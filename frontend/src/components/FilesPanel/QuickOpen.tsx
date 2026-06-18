import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { FileTypeIcon } from './file-icon';
import type { TreeEntry } from './types';

type Props = {
  entries: TreeEntry[];      // flat list, archivos + dirs. Filtramos por type='file'.
  open: boolean;
  onClose: () => void;
  onPick: (path: string) => void;
  recentPaths?: string[];    // archivos abiertos recientemente — flotan arriba.
};

const MAX_VISIBLE = 100;

type Match = { entry: TreeEntry; positions: number[] };

export function QuickOpen({ entries, open, onClose, onPick, recentPaths }: Props) {
  const t = useTokens();
  const tr = useT();
  const [query, setQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset al abrir + focus en el input.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFocusedIdx(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  // Índice de recientes → rank (0 = más reciente) para bonificar el score.
  const recentRank = useMemo(() => {
    const map = new Map<string, number>();
    (recentPaths ?? []).forEach((p, i) => { if (!map.has(p)) map.set(p, i); });
    return map;
  }, [recentPaths]);

  // Archivos (no dirs) ordenados por score del fuzzy match. Con query vacía,
  // mostramos primero los recientes.
  const matches = useMemo<Match[]>(() => {
    const files = entries.filter((e) => e.type === 'file');
    if (!query.trim()) {
      const sorted = [...files].sort((a, b) => {
        const ra = recentRank.has(a.path) ? recentRank.get(a.path)! : Infinity;
        const rb = recentRank.has(b.path) ? recentRank.get(b.path)! : Infinity;
        return ra - rb;
      });
      return sorted.slice(0, MAX_VISIBLE).map((entry) => ({ entry, positions: [] }));
    }
    const scored: Array<{ entry: TreeEntry; score: number; positions: number[] }> = [];
    for (const f of files) {
      const m = fuzzyMatch(query, f.path);
      if (m) {
        // Bonus por reciente: cuanto más arriba en la lista, más peso.
        const rank = recentRank.get(f.path);
        const recentBonus = rank === undefined ? 0 : Math.max(0, 12 - rank);
        scored.push({ entry: f, score: m.score + recentBonus, positions: m.positions });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_VISIBLE).map((s) => ({ entry: s.entry, positions: s.positions }));
  }, [entries, query, recentRank]);

  // Mantener focused dentro del rango.
  useEffect(() => {
    if (focusedIdx >= matches.length) setFocusedIdx(Math.max(0, matches.length - 1));
  }, [matches.length, focusedIdx]);

  // Scroll para mantener visible el focused.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLDivElement>(`[data-idx="${focusedIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh', zIndex: 100,
      }}
    >
      <div style={{
        width: 'min(560px, 90vw)',
        background: t.windowBg, border: `1px solid ${t.glassBorder}`,
        borderRadius: t.r3, boxShadow: t.shadowLg,
        display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflow: 'hidden',
      }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx((i) => Math.min(matches.length - 1, i + 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx((i) => Math.max(0, i - 1)); return; }
            if (e.key === 'Enter') {
              e.preventDefault();
              const pick = matches[focusedIdx];
              if (pick) { onPick(pick.entry.path); onClose(); }
              return;
            }
          }}
          placeholder={tr('files.quickopen.placeholder')}
          style={{
            padding: '12px 14px', fontSize: 14, fontFamily: t.fontSans,
            background: t.bg1, color: t.text0, border: 0,
            borderBottom: `1px solid ${t.glassBorder}`, outline: 'none',
          }}
        />
        <div ref={listRef} style={{ overflow: 'auto', flex: 1 }}>
          {matches.length === 0 ? (
            <div style={{ padding: 16, color: t.text2, fontSize: 13, fontFamily: t.fontSans }}>
              {tr('files.quickopen.no_match')}
            </div>
          ) : (
            matches.map((m, idx) => {
              const isActive = idx === focusedIdx;
              const path = m.entry.path;
              const lastSep = path.lastIndexOf('/');
              const name = lastSep >= 0 ? path.slice(lastSep + 1) : path;
              const dir = lastSep >= 0 ? path.slice(0, lastSep) : '';
              // positions del fuzzy son índices sobre el path completo; los
              // separamos en posiciones del nombre vs del dir.
              const nameStart = lastSep + 1;
              const namePos = m.positions.filter((p) => p >= nameStart).map((p) => p - nameStart);
              const dirPos = m.positions.filter((p) => p < lastSep);
              return (
                <div
                  key={path}
                  data-idx={idx}
                  onMouseDown={(e) => { e.preventDefault(); onPick(path); onClose(); }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px',
                    background: isActive ? `color-mix(in oklch, ${t.accent} 18%, transparent)` : 'transparent',
                    cursor: 'pointer', fontSize: 13, fontFamily: t.fontSans,
                    color: isActive ? t.text0 : t.text1,
                  }}
                >
                  <FileTypeIcon path={path} size={14}/>
                  <span style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {highlight(name, namePos, t.accent)}
                  </span>
                  {dir && (
                    <span style={{ color: t.text3, fontSize: 11, marginLeft: 'auto', fontFamily: t.fontMono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
                      {highlight(dir, dirPos, t.accent)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Renderiza `text` con los chars en `positions` (índices relativos a `text`)
// resaltados en color accent + bold. Posiciones fuera de rango se ignoran.
function highlight(text: string, positions: number[], accent: string) {
  if (positions.length === 0) return text;
  const set = new Set(positions);
  const out: ReactNode[] = [];
  let run = '';
  let runHi = false;
  const flush = (key: number) => {
    if (!run) return;
    out.push(runHi
      ? <span key={key} style={{ color: accent, fontWeight: 700 }}>{run}</span>
      : <span key={key}>{run}</span>);
    run = '';
  };
  for (let i = 0; i < text.length; i++) {
    const hi = set.has(i);
    if (hi !== runHi) { flush(i); runHi = hi; }
    run += text[i];
  }
  flush(text.length);
  return out;
}

// Fuzzy match casero. Devuelve null si no matchea (algún char del query no
// aparece en orden). Score más alto = mejor match.
//   - +base por cada char matcheado
//   - +bonus si el char está al inicio del path o de un segmento (post '/')
//   - +bonus si es consecutivo con el match anterior
//   - bonus extra si todos los chars caen en el "nombre" final (post último '/')
//
// No optimal pero suficiente para 5k entries.
function fuzzyMatch(query: string, target: string): { score: number; positions: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const positions: number[] = [];
  let qi = 0;
  let score = 0;
  let prev = -2;
  const lastSep = t.lastIndexOf('/');
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      positions.push(i);
      let bonus = 1;
      if (i === 0 || t[i - 1] === '/' || t[i - 1] === '-' || t[i - 1] === '_' || t[i - 1] === '.') bonus += 3;
      if (i === prev + 1) bonus += 2;
      if (i > lastSep) bonus += 2; // match en el filename pesa más
      score += bonus;
      prev = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // Penalty leve por longitud del target (preferir paths más cortos).
  score -= Math.floor(t.length / 50);
  return { score, positions };
}
