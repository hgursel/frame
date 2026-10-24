import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { inside } from './security.js';
export type Sandbox = {
  writable: string;
  readonly: string[];
  hidden?: string[];
  pythonPath?: string;
};
/** Empty mount namespace: never bind the host root, home, /proc, sockets, or Frame data. */
export function sandboxArgs(config: Sandbox, command: string) {
  const writable = realpathSync(config.writable);
  const args = [
    '--die-with-parent',
    '--new-session',
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    '--cap-drop',
    'ALL',
    '--clearenv',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
  ];
  for (const location of ['/usr', '/bin', '/sbin', '/lib', '/lib64'])
    if (existsSync(location)) args.push('--ro-bind', location, location);
  for (const location of ['/etc/resolv.conf', '/etc/hosts', '/etc/nsswitch.conf', '/etc/ssl/certs'])
    if (existsSync(location)) args.push('--ro-bind', location, location);
  // Even installations under /usr/local must not inherit private data through runtime mounts.
  for (const location of config.hidden || []) {
    const hidden = path.resolve(location);
    if (hidden === '/') throw new Error('Install Frame in a dedicated directory');
    args.push('--tmpfs', hidden);
  }
  for (const location of config.readonly) {
    if (!existsSync(location)) continue;
    const canonical = realpathSync(location);
    // Configuration is created by the server, not accepted from tool arguments.
    if (canonical !== path.resolve(location))
      throw new Error('Sandbox mount must not be a symlink');
    if (inside(canonical, writable))
      throw new Error('Read-only mount must not contain the workspace');
    args.push('--ro-bind', canonical, canonical);
  }
  args.push(
    '--bind',
    writable,
    writable,
    '--chdir',
    writable,
    '--setenv',
    'HOME',
    '/tmp',
    '--setenv',
    'PATH',
    '/usr/local/bin:/usr/bin:/bin',
    '--setenv',
    'LANG',
    'C.UTF-8',
    '--setenv',
    'PI_ARTIFACT_DIR',
    writable,
  );
  if (config.pythonPath) args.push('--setenv', 'FRAME_PYTHON', config.pythonPath);
  return [...args, '--', '/bin/bash', '--noprofile', '--norc', '-c', command];
}
export function sandboxExec(config: Sandbox, command: string, signal?: AbortSignal, timeout = 120) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('bwrap', sandboxArgs(config, command), {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      env: { PATH: '/usr/bin:/bin' },
    });
    let output = '';
    const timer = setTimeout(
      () => {
        child.kill('SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        reject(
          new Error('Isolated command timed out; verify bubblewrap and user namespace support.'),
        );
      },
      Math.min(600, Math.max(1, timeout)) * 1000,
    );
    const data = (part: Buffer) => {
      output += part.toString();
      if (output.length > 1_000_000) child.kill('SIGKILL');
    };
    child.stdout.on('data', data);
    child.stderr.on('data', data);
    child.once('error', () => {
      clearTimeout(timer);
      reject(
        new Error(
          'Isolated tools unavailable. Install bubblewrap and enable unprivileged user namespaces on the server. No host fallback is allowed.',
        ),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.slice(0, 50000))
        : reject(new Error(`Isolated command failed (${code}): ${output.slice(0, 4000)}`));
    });
  });
}
const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
const fileScript = `import json,os,sys
p=json.loads(sys.argv[1]); action=sys.argv[2]; f=p['path']
if action=='read':
 with open(f) as h: print(''.join(h.readlines()[max(0,p.get('offset',1)-1):max(0,p.get('offset',1)-1)+p.get('limit',1000)]))
elif action=='write':
 os.makedirs(os.path.dirname(os.path.abspath(f)),exist_ok=True)
 with open(f,'w') as h: h.write(p['content'])
 print('File saved')
elif action=='edit':
 with open(f) as h: text=h.read()
 if text.count(p['oldText'])!=1: raise ValueError('oldText must match exactly once')
 with open(f,'w') as h: h.write(text.replace(p['oldText'],p['newText'],1))
 print('File updated')
`;
export function sandboxTools(config: Sandbox) {
  let available: Promise<string> | undefined;
  const ready = () => (available ??= sandboxExec(config, 'true', undefined, 3));
  const result = (text: string) => ({ content: [{ type: 'text' as const, text }], details: {} });
  const fileTool = (name: string, parameters: any) =>
    defineTool({
      name,
      label: name,
      description: `${name} a file in this conversation's isolated workspace or read-only references.`,
      parameters,
      async execute(_id, args, signal) {
        await ready();
        return result(
          await sandboxExec(
            config,
            `python3 -I -c ${quote(fileScript)} ${quote(JSON.stringify(args))} ${name}`,
            signal,
          ),
        );
      },
    });
  return [
    fileTool(
      'read',
      Type.Object({
        path: Type.String(),
        offset: Type.Optional(Type.Integer({ minimum: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
      }),
    ),
    fileTool(
      'write',
      Type.Object({ path: Type.String(), content: Type.String({ maxLength: 500000 }) }),
    ),
    fileTool(
      'edit',
      Type.Object({
        path: Type.String(),
        oldText: Type.String({ minLength: 1 }),
        newText: Type.String(),
      }),
    ),
    defineTool({
      name: 'bash',
      label: 'Run command',
      description:
        'Run shell commands or installed skills in this conversation’s isolated workspace. Network access is unrestricted. Use ls, find, and grep to inspect accessible files.',
      parameters: Type.Object({ command: Type.String(), timeout: Type.Optional(Type.Number()) }),
      async execute(_id, args, signal) {
        await ready();
        return result(await sandboxExec(config, args.command, signal, args.timeout));
      },
    }),
  ];
}
