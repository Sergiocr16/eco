import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { isAllowedWorkspace, isInsideWorkspace } from './config.js';
import { buildSafeEnv } from './security.js';
import { getWorktree } from './worktree-manager.js';

export const DiffRequestSchema = z.object({
  path: z.string().min(1).max(4096),
  workspace: z.string().min(1).max(4096),
  bubbleId: z.string().max(128).optional(),
  ref: z.string().min(1).max(80).optional(),
  // Si true, el diff es contra el INDEX (lo staged) en vez de contra HEAD.
  // Eso permite "review incremental": cuando aceptás un cambio lo
  // staged-eamos, y los próximos diffs muestran solo lo nuevo unstaged.
  vsIndex: z.boolean().optional(),
});

export type DiffRequest = z.infer<typeof DiffRequestSchema>;

export type DiffResult = {
  mode: 'git' | 'created' | 'plain' | 'not_found';
  diff: string;
  hasChanges: boolean;
  message?: string;
};

const MAX_DIFF_BYTES = 512 * 1024;

async function runGit(args: string[], cwd: string): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: buildSafeEnv({ GIT_TERMINAL_PROMPT: '0' }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    const killer = setTimeout(() => child.kill('SIGTERM'), 8000);
    child.stdout.on('data', (c: Buffer) => {
      if (bytes < MAX_DIFF_BYTES) {
        const room = MAX_DIFF_BYTES - bytes;
        const chunk = c.length > room ? c.subarray(0, room) : c;
        stdout += chunk.toString('utf-8');
        bytes += chunk.length;
        if (bytes >= MAX_DIFF_BYTES) child.kill('SIGTERM');
      }
    });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf-8'); });
    child.on('close', (code) => {
      clearTimeout(killer);
      if (code !== 0 && stderr && !stdout) {
        // best-effort: incluir mensaje de error en stdout vacío
      }
      resolve({ stdout, code });
    });
    child.on('error', () => {
      clearTimeout(killer);
      resolve({ stdout, code: null });
    });
  });
}

export async function fileDiff(req: DiffRequest): Promise<DiffResult> {
  if (!isAllowedWorkspace(req.workspace)) {
    throw Object.assign(new Error('Workspace no permitido'), { httpStatus: 403 });
  }
  // Si la burbuja tiene worktree, sus archivos viven ahí, no en el repo padre.
  // El workspace efectivo para los chequeos pasa a ser el worktree.
  const effectiveWorkspace = (req.bubbleId && getWorktree(req.bubbleId)) || req.workspace;

  if (!isInsideWorkspace(req.path, effectiveWorkspace)) {
    throw Object.assign(new Error('Path fuera del workspace'), { httpStatus: 403 });
  }

  const fullPath = realpathSafe(req.path);
  if (!fullPath) {
    return { mode: 'not_found', diff: '', hasChanges: false, message: 'Archivo no existe' };
  }

  // Verificar si hay git
  const gitDir = realpathSafe(`${effectiveWorkspace}/.git`);
  if (gitDir && existsSync(gitDir)) {
    const rel = relativeTo(effectiveWorkspace, fullPath);
    // vsIndex=true → muestra unstaged (working tree vs index). Útil para
    // review incremental: lo ya aceptado vive en el index y desaparece
    // del diff hasta que vuelva a haber cambios unstaged.
    // vsIndex=false (default) → muestra todo vs HEAD (compatibilidad).
    const args = req.vsIndex
      ? ['diff', '--no-color', '-U3', '--', rel]
      : ['diff', '--no-color', '-U3', req.ref ?? 'HEAD', '--', rel];
    const { stdout } = await runGit(args, effectiveWorkspace);
    if (stdout.trim()) {
      return { mode: 'git', diff: stdout, hasChanges: true };
    }
    // Sin cambios contra el target — probar si es archivo nuevo no trackeado
    const untracked = await runGit(['ls-files', '--others', '--exclude-standard', '--', rel], effectiveWorkspace);
    if (untracked.stdout.trim()) {
      // Archivo nuevo — mostrar todo el contenido con prefijo +
      return readAsCreated(fullPath, rel);
    }
    return {
      mode: 'git', diff: '', hasChanges: false,
      message: req.vsIndex ? 'Sin cambios nuevos desde la última aceptación' : 'Sin cambios contra HEAD',
    };
  }

  // Sin git: mostrar contenido plano
  return readAsPlain(fullPath, req.path);
}

function realpathSafe(p: string): string | null {
  try { return realpathSync(resolve(p)); } catch { return null; }
}

function relativeTo(workspace: string, fullPath: string): string {
  const ws = realpathSafe(workspace) ?? workspace;
  if (fullPath === ws) return '.';
  if (fullPath.startsWith(ws + '/')) return fullPath.slice(ws.length + 1);
  return fullPath;
}

function readAsCreated(fullPath: string, rel: string): DiffResult {
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return { mode: 'not_found', diff: '', hasChanges: false };
    if (stat.size > MAX_DIFF_BYTES) {
      return { mode: 'created', diff: '', hasChanges: true, message: 'Archivo demasiado grande para diff' };
    }
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const head = [
      `diff --git a/${rel} b/${rel}`,
      'new file mode 100644',
      `--- /dev/null`,
      `+++ b/${rel}`,
      `@@ -0,0 +1,${lines.length} @@`,
    ];
    const body = lines.map((l) => `+${l}`).join('\n');
    return { mode: 'created', diff: head.join('\n') + '\n' + body, hasChanges: true };
  } catch (e) {
    return { mode: 'not_found', diff: '', hasChanges: false, message: e instanceof Error ? e.message : 'Error' };
  }
}

function readAsPlain(fullPath: string, originalPath: string): DiffResult {
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return { mode: 'not_found', diff: '', hasChanges: false };
    if (stat.size > MAX_DIFF_BYTES) {
      return { mode: 'plain', diff: '', hasChanges: true, message: 'Archivo demasiado grande' };
    }
    const content = readFileSync(fullPath, 'utf-8');
    return { mode: 'plain', diff: content, hasChanges: true, message: 'Workspace sin git — mostrando contenido completo' };
  } catch (e) {
    return { mode: 'not_found', diff: '', hasChanges: false, message: e instanceof Error ? e.message : 'Error' };
  }
}
