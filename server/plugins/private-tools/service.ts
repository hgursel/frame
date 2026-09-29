import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { open, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { Store } from '../../store.js';
import type {
  PrivateTool,
  PrivateToolApproval,
  PrivateToolsSettings,
} from '../../../shared/private-tools.js';

const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const file = z
  .string()
  .max(4096)
  .refine((v) => path.isAbsolute(v) && !v.includes('\0'), 'Use an absolute local path.');
const parameters = z
  .array(
    z
      .object({
        name: identifier.refine((s) => !['constructor', 'prototype', '__proto__'].includes(s)),
        type: z.enum(['string', 'number', 'boolean']),
        description: z.string().max(300).default(''),
        required: z.boolean().default(true),
      })
      .strict(),
  )
  .max(20)
  .refine(
    (v) => new Set(v.map((p) => p.name)).size === v.length,
    'Parameter names must be unique.',
  );
export const privateSettingsSchema = z
  .object({
    enabled: z.boolean(),
    instructions: z.string().max(8000).default(''),
    tools: z
      .array(
        z
          .object({
            id: identifier,
            name: z.string().trim().min(1).max(80),
            description: z.string().trim().min(1).max(2000),
            parameters,
            executable: file,
            args: z
              .array(
                z
                  .string()
                  .max(1000)
                  .refine((v) => !v.includes('\0')),
              )
              .max(20)
              .default([]),
            envFile: z.union([z.literal(''), file]).default(''),
            approval: z.enum(['always', 'automatic']).default('always'),
            timeoutSeconds: z.number().int().min(1).max(1800).default(60),
            maxOutputBytes: z.number().int().min(1024).max(131072).default(32000),
          })
          .strict(),
      )
      .max(20)
      .refine((v) => new Set(v.map((t) => t.id)).size === v.length, 'Tool IDs must be unique.'),
  })
  .strict();

export function privateInput(tool: PrivateTool, input: unknown) {
  const fields: Record<string, z.ZodType> = {};
  for (const p of tool.parameters) {
    const value =
      p.type === 'string'
        ? z.string().max(16000)
        : p.type === 'number'
          ? z.number().finite()
          : z.boolean();
    fields[p.name] = p.required ? value : value.optional();
  }
  const parsed = z.object(fields).strict().parse(input);
  if (Buffer.byteLength(JSON.stringify(parsed)) > 32000) throw fail('Tool input exceeds 32 KB.');
  return parsed as Record<string, string | number | boolean>;
}

/** Local secrets are data, never shell-sourced. Nothing from this file is returned by settings. */
async function environment(filename: string) {
  if (!filename) return {};
  let handle;
  try {
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 65536 || stat.mode & 0o077) throw Error();
    const values = parseEnv(await handle.readFile('utf8'));
    for (const key of Object.keys(values)) {
      if (
        values[key]?.includes('\0') ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
        /^(?:PATH|HOME|SHELL|ENV|BASH_ENV|SHELLOPTS|BASHOPTS|CDPATH|IFS|NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONHOME|LD_.*|DYLD_.*)$/i.test(
          key,
        )
      )
        throw Error();
    }
    return values;
  } catch {
    throw fail(
      'Cannot load the environment file. Use a regular file readable by Frame, chmod 600, with application variables only.',
    );
  } finally {
    await handle?.close();
  }
}

export class PrivateTools extends EventEmitter {
  private pending = new Map<
    string,
    { conversation: string; approval: PrivateToolApproval; finish: (allowed: boolean) => void }
  >();
  constructor(readonly store: Store) {
    super();
  }
  settings(): PrivateToolsSettings {
    return privateSettingsSchema.parse(
      JSON.parse(
        this.store.meta('private-tools:settings') ||
          '{"enabled":false,"instructions":"","tools":[]}',
      ),
    );
  }
  save(value: unknown) {
    const parsed = privateSettingsSchema.parse(value);
    this.store.setMeta('private-tools:settings', JSON.stringify(parsed));
    return parsed;
  }
  projectEnabled(id: string) {
    return !!(
      this.store.db
        .prepare("SELECT enabled FROM project_plugins WHERE projectId=? AND plugin='private-tools'")
        .get(id) as any
    )?.enabled;
  }
  setProject(id: string, enabled: boolean) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO project_plugins VALUES (?,'private-tools',?)")
      .run(id, Number(enabled));
  }
  context(projectId: string) {
    const config = this.settings();
    if (!config.enabled || !this.projectEnabled(projectId)) return;
    return {
      instructions: config.instructions,
      tools: config.tools.map(({ id, name, description, parameters }) => ({
        id,
        name,
        description,
        parameters,
      })),
    };
  }
  approvals(conversation: string) {
    return [...this.pending.values()]
      .filter((p) => p.conversation === conversation)
      .map((p) => p.approval);
  }
  decide(conversation: string, id: string, runId: string, allowed: boolean) {
    const pending = this.pending.get(id);
    if (
      !pending ||
      pending.conversation !== conversation ||
      pending.approval.runId !== runId ||
      Date.now() >= pending.approval.expiresAt
    )
      throw fail('This tool approval expired or was already handled.', 409);
    pending.finish(allowed);
    return { ok: true };
  }
  async invoke(conversation: string, runId: string, request: unknown, signal: AbortSignal) {
    const { id, input } = z.object({ id: identifier, input: z.unknown() }).strict().parse(request);
    const chat = this.store.conversation(conversation);
    const config = this.settings();
    if (!chat || !config.enabled || !this.projectEnabled(chat.projectId))
      throw fail('Private Tools is disabled for this project.');
    const tool = config.tools.find((t) => t.id === id);
    if (!tool) throw fail('Private tool is not registered.');
    const args = privateInput(tool, input);
    if (signal.aborted) throw fail('Private tool cancelled. Nothing was started.');
    if (tool.approval === 'always') {
      const approval: PrivateToolApproval = {
        id: randomUUID(),
        runId,
        name: tool.name,
        input: args,
        expiresAt: Date.now() + 5 * 60_000,
      };
      const allowed = await new Promise<boolean>((resolve) => {
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          this.pending.delete(approval.id);
          this.emit('change', conversation);
          resolve(ok);
        };
        const abort = () => finish(false);
        const timer = setTimeout(abort, 5 * 60_000);
        this.pending.set(approval.id, { conversation, approval, finish });
        signal.addEventListener('abort', abort, { once: true });
        this.emit('change', conversation);
      });
      if (!allowed)
        throw fail('Private tool denied, cancelled, or approval expired. Nothing was started.');
    }
    if (signal.aborted) throw fail('Private tool cancelled. Nothing was started.');
    const env = await environment(tool.envFile);
    try {
      await access(tool.executable, constants.X_OK);
    } catch {
      throw fail(
        'The registered executable is unavailable. Check its path and execute permission.',
      );
    }
    if (signal.aborted) throw fail('Private tool cancelled. Nothing was started.');
    return new Promise<{ output: string }>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(tool.executable, tool.args, {
          cwd: path.dirname(tool.executable),
          shell: false,
          detached: true,
          env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // Native spawn diagnostics can include environment values. Never forward them.
        reject(fail('Private tool could not start. Check its executable and environment file.'));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0,
        failure = '';
      const kill = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* Already gone. */
          }
        }
      };
      const stop = (message: string) => {
        failure ||= message;
        kill();
      };
      const abort = () =>
        stop('Private tool stopped. Its remote outcome may be unknown; verify before retrying.');
      const timer = setTimeout(
        () =>
          stop(
            'Private tool timed out. Its remote outcome may be unknown; verify before retrying.',
          ),
        tool.timeoutSeconds * 1000,
      );
      signal.addEventListener('abort', abort, { once: true });
      const collect = (chunk: Buffer, stdout: boolean) => {
        bytes += chunk.length;
        if (bytes > tool.maxOutputBytes)
          stop(
            'Private tool exceeded its output limit. Its remote outcome may be unknown; verify before retrying.',
          );
        else if (stdout) chunks.push(chunk);
      };
      child.stdout.on('data', (b) => collect(b, true));
      child.stderr.on('data', (b) => collect(b, false));
      child.stdin.on('error', () => {});
      child.once('error', () => {
        failure ||= 'Private tool could not start. Check the registered executable.';
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        kill();
        if (failure || code !== 0)
          return reject(
            fail(
              failure ||
                'Private tool exited unsuccessfully. Its remote outcome may be unknown; verify before retrying.',
            ),
          );
        let output = Buffer.concat(chunks).toString('utf8');
        // Redact before output reaches IPC, model context, UI, or native chat history.
        for (const value of Object.values(env)
          .filter((v): v is string => !!v)
          .sort((a, b) => b.length - a.length)) {
          for (const representation of new Set([value, JSON.stringify(value).slice(1, -1)]))
            output = output.split(representation).join('[REDACTED]');
        }
        if (Buffer.byteLength(output) > tool.maxOutputBytes)
          return reject(
            fail(
              'Redacted output exceeds the configured limit. The operation has already finished; do not retry automatically.',
            ),
          );
        resolve({ output: output || '(No output)' });
      });
      if (signal.aborted) abort();
      else child.stdin.end(JSON.stringify(args) + '\n');
    });
  }
}
