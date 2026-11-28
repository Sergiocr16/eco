import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { IconSearch } from '@/design/icons';
import { apiFetch } from '@/lib/api';

type Props = {
  bubbleId: string;
  workspace: string;
  onPick: (path: string, line: number, column: number) => void;
  // Semilla para precargar la búsqueda desde "find usages" (Cmd/Ctrl+click o
  // Shift+F12 en el editor). `nonce` fuerza re-semilla aunque la palabra repita.
  seed?: { query: string; wholeWord: boolean; nonce: number } | null;
};

type Hit = {
  path: string;
  line: number;
  column: number;
  preview: string;
};

const DEBOUNCE_MS = 200;

export function GlobalSearch({ bubbleId, workspace, onPick, seed }: Props) {
  const t = useTokens();
  const tr = useT();

  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [includePattern, setIncludePattern] = useState('');

  // Semilla de "find usages": precarga query + palabra-completa y limpia regex.
  const lastSeedNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!seed || seed.nonce === lastSeedNonce.current) return;
    lastSeedNonce.current = seed.nonce;
    setQuery(seed.query);
    setWholeWord(seed.wholeWord);
    setRegex(false);
    inputRef.current?.focus();
  }, [seed]);

  const [hits, setHits] = useState<Hit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounce: cuando cualquier filtro cambia, esperamos DEBOUNCE_MS y mandamos.
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setTruncated(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const handle = window.setTimeout(async () => {
      try {
        const r = await apiFetch('/fs/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bubbleId, workspace, query, regex, caseSensitive, wholeWord,
            includePattern: includePattern.trim() || undefined,
            maxResults: 500,
          }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({})) as { error?: string };
          const code = data.error;
          setError(
            code === 'search.timeout' ? tr('berr.search.timeout')
            : code === 'search.no_engine' ? tr('berr.search.no_engine')
            : tr('berr.search.failed'),
          );
          setHits([]);
          setLoading(false);
          return;
        }
        const data = await r.json() as { ok: boolean; hits: Hit[]; truncated: boolean };
        setHits(data.hits);
        setTruncated(!!data.truncated);
        setLoading(false);
      } catch {
        setError(tr('berr.search.failed'));
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, regex, caseSensitive, wholeWord, includePattern, bubbleId, workspace, tr]);

  // Agrupar por path.
  const groups = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of hits) {
      const arr = map.get(h.path) ?? [];
      arr.push(h);
      map.set(h.path, arr);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header con input */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label className="eco-inputbar eco-inputbar--sm">
          <IconSearch size={14}/>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('files.search.placeholder')}
            className="eco-input-bare"
          />
        </label>
        <div className="eco-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '0 4px' }}>
          <label style={CHECK}>
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} style={{ accentColor: 'var(--ac)' }}/>
            {tr('files.search.regex')}
          </label>
          <label style={CHECK}>
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} style={{ accentColor: 'var(--ac)' }}/>
            {tr('files.search.case_sensitive')}
          </label>
          <label style={CHECK}>
            <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} style={{ accentColor: 'var(--ac)' }}/>
            {tr('files.search.whole_word')}
          </label>
        </div>
        <input
          value={includePattern}
          onChange={(e) => setIncludePattern(e.target.value)}
          placeholder={tr('files.search.include_pattern')}
          className="eco-field eco-field--sm eco-field--mono"
        />
      </div>
      {/* Estado */}
      {error && (
        <div className="eco-banner eco-banner--err" style={{ margin: '4px 12px' }}>{error}</div>
      )}
      {loading && (
        <div className="eco-sub" style={{ padding: '6px 16px' }}>
          {tr('files.search.searching')}
        </div>
      )}
      {!loading && !error && query.trim() && hits.length === 0 && (
        <div className="eco-sub" style={{ padding: '6px 16px' }}>
          {tr('files.search.no_results')}
        </div>
      )}
      {!loading && hits.length > 0 && (
        <div className="eco-sub" style={{ padding: '4px 16px' }}>
          {hits.length === 1
            ? tr('files.search.results_count_one', { n: 1 })
            : tr('files.search.results_count_many', { n: hits.length })}
          {truncated && <span style={{ marginLeft: 8, color: t.warn }}>· {tr('files.search.truncated', { n: 500 })}</span>}
        </div>
      )}
      {/* Resultados agrupados */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 10px' }}>
        {groups.map(([p, hs]) => {
          const lastSep = p.lastIndexOf('/');
          const name = lastSep >= 0 ? p.slice(lastSep + 1) : p;
          const dir = lastSep >= 0 ? p.slice(0, lastSep) : '';
          return (
          <div key={p} style={{ marginBottom: 6 }}>
            <div className="eco-mono" style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              padding: '6px 8px 2px', fontSize: 12,
            }}>
              <span style={{ color: t.text0, fontWeight: 500 }}>{name}</span>
              {dir && <span className="eco-truncate" style={{ color: t.text3 }}>{dir}</span>}
            </div>
            {hs.map((h, idx) => (
              <button
                key={`${p}:${h.line}:${h.column}:${idx}`}
                type="button"
                onClick={() => onPick(h.path, h.line, h.column)}
                className="eco-nav-item eco-nav-item--sm eco-mono"
                style={{ height: 'auto', minHeight: 26, padding: '4px 8px', gap: 8, borderRadius: 8, fontSize: 12, color: t.text1 }}
              >
                <span style={{ color: t.text3, minWidth: 34, textAlign: 'right', flexShrink: 0 }}>{h.line}</span>
                <span className="eco-truncate" style={{ flex: 1 }}>
                  {highlightPreview(h.preview.trim(), query, regex, caseSensitive, t.accent)}
                </span>
              </button>
            ))}
          </div>
          );
        })}
      </div>
    </div>
  );
}

const CHECK = { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } as const;

// Resalta las coincidencias de la query dentro de la línea de preview. En modo
// no-regex resalta ocurrencias literales (case-(in)sensitive); en regex intenta
// compilar la query y resaltar sus matches. Si algo falla, devuelve el texto plano.
function highlightPreview(
  preview: string, query: string, regex: boolean, caseSensitive: boolean, accent: string,
): ReactNode {
  const q = query.trim();
  if (!q) return preview;
  let re: RegExp;
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    re = new RegExp(regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch {
    return preview;
  }
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(preview)) !== null && guard < 200) {
    guard++;
    if (m.index > last) out.push(preview.slice(last, m.index));
    out.push(<span key={`${m.index}-${guard}`} style={{ color: accent, fontWeight: 600 }}>{m[0]}</span>);
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;  // evita loop infinito en match vacío
  }
  if (last < preview.length) out.push(preview.slice(last));
  return out.length ? out : preview;
}
