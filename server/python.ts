import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { DocumentRuntimeStatus } from '../shared/types.js';

const appRoot = fileURLToPath(
  new URL(import.meta.url.endsWith('.ts') ? '../' : '../../', import.meta.url),
);
const script = path.join(appRoot, 'python', 'documents.py');

function command(
  executable: string,
  args: string[],
  input = '',
  signal?: AbortSignal,
  timeout = 45000,
  outputLimit = 1_000_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const installerEnv = args.includes('pip')
      ? Object.fromEntries(
          [
            'HTTP_PROXY',
            'HTTPS_PROXY',
            'NO_PROXY',
            'http_proxy',
            'https_proxy',
            'no_proxy',
            'PIP_INDEX_URL',
            'PIP_EXTRA_INDEX_URL',
            'PIP_TRUSTED_HOST',
            'PIP_CERT',
            'REQUESTS_CA_BUNDLE',
          ].flatMap((key) =>
            globalThis.process.env[key] ? [[key, globalThis.process.env[key]]] : [],
          ),
        )
      : {};
    const process = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      signal,
      env: {
        PATH: globalThis.process.env.PATH,
        LANG: 'C.UTF-8',
        PYTHONUTF8: '1',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        ...installerEnv,
      },
    });
    let output = '';
    let tooLarge = false;
    const timer = setTimeout(() => process.kill('SIGKILL'), timeout);
    process.stdout.on('data', (part) => {
      output += part;
      if (output.length > outputLimit) {
        tooLarge = true;
        process.kill('SIGKILL');
      }
    });
    process.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && !tooLarge) resolve(output);
      else {
        let message =
          'Python operation failed or exceeded its limits. Check document tools and the file format.';
        try {
          if (!tooLarge && typeof JSON.parse(output).error === 'string')
            message = JSON.parse(output).error;
        } catch {}
        reject(new Error(message));
      }
    });
    process.stdin.on('error', () => {});
    process.stdin.end(input);
  });
}
export async function documentCommand(pythonPath: string, input: object, signal?: AbortSignal) {
  const value = JSON.parse(
    await command(pythonPath, ['-I', script], JSON.stringify(input), signal),
  );
  if (value.error) throw new Error(value.error);
  return value;
}
export class PythonRuntime {
  private installing?: Promise<void>;
  private error = '';
  readonly executable: string;
  constructor(readonly dataDir: string) {
    this.executable =
      globalThis.process.env.FRAME_PYTHON || path.join(dataDir, 'python', 'venv', 'bin', 'python');
  }
  async status(): Promise<DocumentRuntimeStatus> {
    if (this.installing) return { state: 'installing', message: 'Installing document tools…' };
    try {
      if (
        existsSync(this.executable) &&
        (await documentCommand(this.executable, { command: 'status' })).ready
      )
        return { state: 'ready', message: 'PDF and DOCX tools are ready.' };
    } catch {
      /* Show actionable local setup state. */
    }
    return {
      state: this.error ? 'error' : 'missing',
      message:
        this.error ||
        'Install the managed Python environment to read PDFs/DOCX and create documents.',
    };
  }
  install(): Promise<void> {
    if (this.installing) return this.installing;
    if (globalThis.process.env.FRAME_PYTHON)
      return Promise.reject(
        new Error(
          'FRAME_PYTHON is externally managed. Install python/requirements.txt in that environment.',
        ),
      );
    this.error = '';
    this.installing = (async () => {
      await mkdir(path.join(this.dataDir, 'python'), { recursive: true, mode: 0o700 });
      if (!existsSync(this.executable))
        await command(
          'python3',
          ['-m', 'venv', path.dirname(path.dirname(this.executable))],
          '',
          undefined,
          60000,
        );
      await command(
        this.executable,
        [
          '-m',
          'pip',
          'install',
          '--disable-pip-version-check',
          '--no-input',
          '-r',
          path.join(appRoot, 'python', 'requirements.txt'),
        ],
        '',
        undefined,
        180000,
      );
      if (!(await documentCommand(this.executable, { command: 'status' })).ready)
        throw new Error('Version check failed');
    })()
      .catch(() => {
        this.error =
          'Installation failed. Install python3-venv on the server and check access to PyPI, then retry.';
        throw new Error(this.error);
      })
      .finally(() => {
        this.installing = undefined;
      });
    return this.installing;
  }
  async close() {
    await this.installing?.catch(() => {});
  }
}

export async function reportCommand(pythonPath: string, input: object, signal?: AbortSignal) {
  return JSON.parse(
    await command(
      pythonPath,
      ['-I', path.join(appRoot, 'python', 'reports.py')],
      JSON.stringify(input),
      signal,
      60000,
      12_000_000,
    ),
  );
}
