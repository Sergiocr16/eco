#!/usr/bin/env node
// check-i18n: busca strings user-facing hardcoded en frontend/src/**/*.{ts,tsx}
// y falla con exit 1 si encuentra alguno. Soporta una allowlist en
// scripts/.i18n-allowlist con líneas "path:texto" o "path:*" para escape
// hatches conocidos.
//
// Flags:
//   --report   Imprime los hits pero no falla (útil para auditoría tech-debt).
//
// Heurísticas (intencionalmente simples — preferimos un falso positivo
// puntual que tener que mantener un AST):
//   1. JSX text con palabras en español (palabras comunes o tildes).
//   2. Atributos UI con string literal en español:
//      placeholder, title, aria-label, alt, label.
//
// Detección: regex sobre el fuente. NO se parsea AST. La idea es:
// - El review pasó: el componente importa useT y consume tr().
// - Lo que queda en duro son los "olvidados" — esos los marcamos.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRC = join(REPO, 'frontend', 'src');
const ALLOWLIST_FILE = join(HERE, '.i18n-allowlist');

// Archivos que NO chequeamos.
const EXCLUDE_FILES = new Set([
  'lib/i18n.ts',
  'lib/backend-errors.ts',
]);
const EXCLUDE_DIRS = ['node_modules', 'dist', '__tests__'];
const EXCLUDE_PATTERN = /\.(test|spec|d)\.tsx?$/;

// Palabras españolas comunes que disparan un hit (curated para evitar
// nombres técnicos como "el", "la" — preferimos términos de UI).
const ES_WORDS = [
  'que', 'para', 'desde', 'sobre', 'usando', 'cuando', 'pero',
  'cargando', 'guardar', 'cancelar', 'agregar', 'eliminar', 'borrar',
  'aceptar', 'rechazar', 'continuar', 'confirmar', 'enviar', 'recibir',
  'descargar', 'subir', 'editar', 'crear', 'modificar', 'configurar',
  'aplicar', 'reintentar', 'reiniciar', 'detener', 'iniciar',
  'archivo', 'archivos', 'carpeta', 'agente', 'agentes', 'rama', 'ramas',
  'mensaje', 'mensajes', 'sesión', 'sesion', 'sesiones',
  'sin', 'con', 'esta', 'este', 'tiene', 'tienen', 'puede', 'podés', 'hacer',
  'click', 'tooltip', 'placeholder',
  'historial', 'cambios', 'navegador', 'terminal', 'inicio',
  'pendiente', 'pendientes', 'aceptado', 'aceptados', 'rechazado',
  'comentario', 'comentarios', 'descripción', 'mergeado', 'cerrado',
  'guardando', 'cerrando', 'pegada', 'analizando', 'commiteando',
  'detectar', 'detectado', 'detectados',
];
const ACCENT_RE = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;

// Atributos JSX donde una string literal es user-facing.
const UI_ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];

const args = new Set(process.argv.slice(2));
const REPORT_ONLY = args.has('--report');

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return [];
  const lines = readFileSync(ALLOWLIST_FILE, 'utf8').split('\n');
  const entries = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const path = line.slice(0, idx).trim();
    const text = line.slice(idx + 1).trim();
    entries.push({ path, text });
  }
  return entries;
}

function isAllowed(allow, relPath, snippet) {
  for (const a of allow) {
    if (!relPath.endsWith(a.path) && a.path !== '*') continue;
    if (a.text === '*') return true;
    if (snippet.includes(a.text)) return true;
  }
  return false;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !EXCLUDE_PATTERN.test(entry)) out.push(full);
  }
  return out;
}

function looksSpanish(text) {
  const lower = text.toLowerCase();
  if (ACCENT_RE.test(text)) return true;
  for (const w of ES_WORDS) {
    const re = new RegExp(`(^|[^a-záéíóúñ])${w}([^a-záéíóúñ]|$)`, 'i');
    if (re.test(lower)) return true;
  }
  return false;
}

function checkFile(file, allow) {
  const relPath = relative(REPO, file).replaceAll('\\', '/');
  const srcRel = relative(SRC, file).replaceAll('\\', '/');
  if (EXCLUDE_FILES.has(srcRel)) return [];

  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1) JSX text: >Texto en español< (sin {} adentro).
    //    Solo si la línea no contiene `tr(` para el mismo segmento.
    const jsxRe = />([^<>{}\n]{4,})</g;
    let m;
    while ((m = jsxRe.exec(line)) !== null) {
      const text = m[1].trim();
      if (!text) continue;
      // Filtros baratos: simbolos, números puros, palabras técnicas.
      if (/^[\s\d\W]+$/.test(text)) continue;
      if (!looksSpanish(text)) continue;
      const snippet = line.trim();
      if (isAllowed(allow, relPath, snippet)) continue;
      hits.push({ file: relPath, line: i + 1, kind: 'jsx', text });
    }

    // 2) UI attrs: placeholder="..." title="..." etc. con texto en español.
    for (const attr of UI_ATTRS) {
      // Atributo con valor literal entre comillas dobles.
      const re = new RegExp(`\\b${attr}="([^"]+)"`, 'g');
      let am;
      while ((am = re.exec(line)) !== null) {
        const text = am[1];
        if (text.length < 3) continue;
        if (!looksSpanish(text)) continue;
        if (isAllowed(allow, relPath, line.trim())) continue;
        hits.push({ file: relPath, line: i + 1, kind: `attr:${attr}`, text });
      }
    }
  }

  return hits;
}

function main() {
  const allow = loadAllowlist();
  const files = walk(SRC);
  let all = [];
  for (const f of files) all = all.concat(checkFile(f, allow));

  if (all.length === 0) {
    console.log(`check:i18n OK — ${files.length} archivos sin strings user-facing hardcoded.`);
    process.exit(0);
  }

  const head = REPORT_ONLY
    ? `check:i18n report — ${all.length} hit(s) en ${new Set(all.map((h) => h.file)).size} archivo(s):`
    : `check:i18n FALLÓ — ${all.length} hit(s) en ${new Set(all.map((h) => h.file)).size} archivo(s):`;
  console.log(head);
  console.log('');
  for (const h of all) {
    console.log(`  ${h.file}:${h.line}  [${h.kind}]  ${h.text.slice(0, 120)}`);
  }
  console.log('');
  if (REPORT_ONLY) {
    console.log('(--report: no se sale con error)');
    process.exit(0);
  } else {
    console.log('Hint: pasá toda string user-facing por tr() (useT). Si necesitás');
    console.log('una excepción puntual, agregala a scripts/.i18n-allowlist con el formato');
    console.log('"path/al/archivo.tsx:fragmento" — una línea por excepción.');
    process.exit(1);
  }
}

main();
