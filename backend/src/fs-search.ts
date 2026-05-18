// Búsqueda fulltext en el workdir de una burbuja. Usa ripgrep (`rg`) si está
// instalado, sino cae a `grep -rn`. La query SIEMPRE se pasa como argv —
// nunca interpolada en un shell — para frenar injection.
//
// Cap 500 hits, timeout 8s. Diseñado para potenciar el panel "Buscar en
// archivos" de la tab Archivos (Cmd+Shift+F).

import { spawn, spawnSync } from 'node:child_process';
import { buildSafeEnv } from './security.js';

export type SearchHit = {
  path: string;        // relativo al workdir, separador '/' siempre
  line: number;        // 1-based
  column: number;      // 1-based
  preview: string;     // hasta 200 chars
};

export type SearchResult =
  | { ok: true; hits: SearchHit[]; truncated: boolean; engine: 'rg' | 'grep' }
  | { ok: false; code: 'search.timeout' | 'search.failed'; error: string };

// Detección cacheada al primer uso. spawnSync sincrónico es OK al startup;
// `which` está siempre disponible en macOS/Linux.
let rgChecked = false;
let rgAvailable = false;
function isRgAvailable(): boolean {
  if (rgChecked) return rgAvailable;
  rgChecked = true;
  try {
    const r = spawnSync('which', ['rg'], { encoding: 'utf8' });
    rgAvailable = r.status === 0 && (r.stdout ?? '').trim().length > 0;
  } catch {
    rgAvailable = false;
  }
  return rgAvailable;
}

const SEARCH_TIMEOUT_MS = 8000;
const PREVIEW_MAX = 200;

const EXCLUDE_DIRS_FOR_GREP = [
  'node_modules', '.git', 'dist', 'build', '.next', 'target', '.cache',
  '.turbo', 'coverage', '.venv', '__pycache__',
];

export async function searchInWorkspace(args: {
  workdir: string;
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  includePattern?: string;
  maxResults: number;
}): Promise<SearchResult> {
  const { workdir, query, regex, caseSensitive, includePattern, maxResults } = args;
  const engine: 'rg' | 'grep' = isRgAvailable() ? 'rg' : 'grep';
  const argv = engine === 'rg'
    ? buildRgArgv({ query, regex, caseSensitive, includePattern })
    : buildGrepArgv({ query, regex, caseSensitive });
  return runSearch({ cmd: argv[0], args: argv.slice(1), cwd: workdir, engine, maxResults });
}

function buildRgArgv(args: {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  includePattern?: string;
}): string[] {
  const { query, regex, caseSensitive, includePattern } = args;
  const out: string[] = [
    'rg',
    '--json',
    '--max-count=50',
    '--max-filesize=1M',
    caseSensitive ? '--case-sensitive' : '--ignore-case',
  ];
  if (!regex) out.push('--fixed-strings');
  if (includePattern) out.push(`--glob=${includePattern}`);
  // -- separa flags de pattern, para que queries que empiecen con '-' no se
  // interpreten como flag aunque ya pasen como argv.
  out.push('--', query, '.');
  return out;
}

function buildGrepArgv(args: {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
}): string[] {
  const { query, regex, caseSensitive } = args;
  const out: string[] = ['grep', '-rn'];
  for (const d of EXCLUDE_DIRS_FOR_GREP) out.push(`--exclude-dir=${d}`);
  if (!caseSensitive) out.push('-i');
  out.push(regex ? '-E' : '-F');
  out.push('--', query, '.');
  return out;
}

function runSearch(opts: {
  cmd: string;
  args: string[];
  cwd: string;
  engine: 'rg' | 'grep';
  maxResults: number;
}): Promise<SearchResult> {
  return new Promise((resolve) => {
    const { cmd, args, cwd, engine, maxResults } = opts;
    const child = spawn(cmd, args, {
      cwd,
      env: buildSafeEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const hits: SearchHit[] = [];
    let truncated = false;
    let killedByTimeout = false;
    let stdoutBuf = '';
    let stderrBuf = '';

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try { child.kill('SIGTERM'); } catch {}
      // Por las dudas, escalada a SIGKILL si no muere en 500ms.
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 500);
    }, SEARCH_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (truncated) return;
      stdoutBuf += chunk.toString('utf8');
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        const parsed = engine === 'rg' ? parseRgLine(line) : parseGrepLine(line);
        if (parsed) {
          hits.push(parsed);
          if (hits.length >= maxResults) {
            truncated = true;
            try { child.kill('SIGTERM'); } catch {}
            break;
          }
        }
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
      if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, code: 'search.failed', error: 'No se pudo ejecutar la búsqueda' });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killedByTimeout) {
        return resolve({ ok: false, code: 'search.timeout', error: 'La búsqueda excedió el tiempo límite' });
      }
      // rg/grep devuelven 1 cuando no hay matches — no es error.
      // grep devuelve 2 en errores reales. rg también devuelve 2.
      if (!truncated && code !== 0 && code !== 1 && code !== null) {
        return resolve({ ok: false, code: 'search.failed', error: (stderrBuf || '').trim().slice(0, 600) || 'Búsqueda falló' });
      }
      resolve({ ok: true, hits, truncated, engine });
    });
  });
}

// ─── Parsers ──────────────────────────────────────────────────────────────

// ripgrep --json emite varios tipos de mensaje; solo nos interesan los "match".
type RgJsonMatch = {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{ start: number; end: number }>;
  };
};
function parseRgLine(line: string): SearchHit | null {
  let obj: { type?: string; data?: unknown };
  try { obj = JSON.parse(line); } catch { return null; }
  if (obj.type !== 'match') return null;
  const data = (obj as RgJsonMatch).data;
  if (!data?.path?.text || typeof data.line_number !== 'number') return null;
  const firstMatch = data.submatches?.[0];
  const col = firstMatch ? firstMatch.start + 1 : 1;
  const preview = (data.lines?.text ?? '').replace(/\n$/, '').slice(0, PREVIEW_MAX);
  return {
    path: data.path.text.replace(/^\.\//, '').replace(/\\/g, '/'),
    line: data.line_number,
    column: col,
    preview,
  };
}

// grep -rn: "path:line:content"
function parseGrepLine(line: string): SearchHit | null {
  // Encontrar las dos primeras ':' separadoras. El path puede tener ':' en
  // teoría pero en práctica no en cwd típicos; usamos heurística.
  const firstColon = line.indexOf(':');
  if (firstColon < 0) return null;
  const secondColon = line.indexOf(':', firstColon + 1);
  if (secondColon < 0) return null;
  const path = line.slice(0, firstColon);
  const lineNumStr = line.slice(firstColon + 1, secondColon);
  const lineNum = parseInt(lineNumStr, 10);
  if (!Number.isFinite(lineNum)) return null;
  const preview = line.slice(secondColon + 1).slice(0, PREVIEW_MAX);
  return {
    path: path.replace(/^\.\//, '').replace(/\\/g, '/'),
    line: lineNum,
    column: 1,  // grep no da columna sin -b o regex extensions; default 1.
    preview,
  };
}
