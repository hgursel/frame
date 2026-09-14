import path from 'node:path';
import { PythonRuntime } from './python.js';
process.umask(0o077);
const runtime = new PythonRuntime(path.resolve(process.env.FRAME_DATA_DIR || 'data'));
await runtime.install();
console.log((await runtime.status()).message);
