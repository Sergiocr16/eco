import { spawn } from 'node:child_process';
import { z } from 'zod';
import { isAllowedWorkspace, isInsideWorkspace } from './config.js';
import { buildSafeEnv, isDangerousBash } from './security.js';
import { shRun } from './platform.js';

export const ShellRequestSchema = z.object({
  command: z.string().min(1).max(10_000),
  cwd: z.string().min(1).max(4096),
  workspace: z.string().min(1).max(4096),
});

export type ShellRequest = z.infer<typeof ShellRequestSchema>;

export type ShellResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
};

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB
const TIMEOUT_MS = 30_000;

export async function runShell(req: ShellRequest): Promise<ShellResult> {
  const start = Date.now();

  if (!isAllowedWorkspace(req.workspace)) {
    throw Object.assign(new Error('Workspace no permitido'), { httpStatus: 403 });
  }

  const cwdOk = req.cwd === req.workspace || isInsideWorkspace(req.cwd, req.workspace);
  if (!cwdOk) {
    throw Object.assign(new Error('cwd fuera del workspace'), { httpStatus: 403 });
  }

  const danger = isDangerousBash(req.command);
  if (danger.dangerous) {
    throw Object.assign(new Error(`Comando bloqueado: ${danger.reason}`), { httpStatus: 403 });
  }

  return await new Promise<ShellResult>((resolve, reject) => {
    const { cmd, args } = shRun(req.command);
    const child = spawn(cmd, args, {
      cwd: req.cwd,
      env: buildSafeEnv({ NO_COLOR: '1' }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const killer = setTimeout(() => {
      truncated = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000);
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBytes >= MAX_OUTPUT_BYTES) { truncated = true; return; }
      const remaining = MAX_OUTPUT_BYTES - stdoutBytes;
      if (chunk.length > remaining) {
        stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutBytes += remaining;
        truncated = true;
        child.kill('SIGTERM');
      } else {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= MAX_OUTPUT_BYTES) { truncated = true; return; }
      const remaining = MAX_OUTPUT_BYTES - stderrBytes;
      if (chunk.length > remaining) {
        stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes += remaining;
        truncated = true;
        child.kill('SIGTERM');
      } else {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });

    child.on('error', (err) => {
      clearTimeout(killer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        truncated,
        durationMs: Date.now() - start,
      });
    });
  });
}
