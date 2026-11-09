// Local development: HTTP server and job worker together (`pnpm dev` at the root runs this with
// the admin and the store). Each process reloads on change; Ctrl+C stops both.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';

const apiRoot = path.resolve(import.meta.dirname, '..');
const processes: ChildProcess[] = [];

function start(label: string, entry: string): void {
  const child = spawn(process.execPath, ['--env-file-if-exists=../../.env', '--watch', entry], {
    cwd: apiRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = (stream: NodeJS.WritableStream) => (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.length > 0) stream.write(`[${label}] ${line}\n`);
    }
  };
  child.stdout.on('data', prefix(process.stdout));
  child.stderr.on('data', prefix(process.stderr));
  child.on('exit', (code, signal) => {
    process.stderr.write(`[${label}] exited (${signal ?? String(code)})\n`);
    stop();
  });
  processes.push(child);
}

let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start('http', 'src/main-http.ts');
start('worker', 'src/main-worker.ts');
