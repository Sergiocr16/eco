import { useEffect, useMemo, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { apiFetch } from '@/lib/api';

type Props = {
  bubbleId: string;
  workspace: string;
  onPick: (path: string, line: number, column: number) => void;
};

type Hit = {
  path: string;
  line: number;
  column: number;
  preview: string;
};

const DEBOUNCE_MS = 350;

export function GlobalSearch({ bubbleId, workspace, onPick }: Props) {
  const t = useTokens();
  const tr = useT();

  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [includePattern, setIncludePattern] = useState('');

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
            bubbleId, workspace, query, regex, caseSensitive,
            includePattern: includePattern.trim() || undefined,
            maxResults: 500,
          }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({})) as { error?: string };
          setError(data.error === 'search.timeout' ? tr('berr.search.timeout') : tr('berr.search.failed'));
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
  }, [query, regex, caseSensitive, includePattern, bubbleId, workspace, tr]);

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
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${t.glassBorder}` }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr('files.search.placeholder')}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: t.r2,
            background: t.bg1, color: t.text0, border: `1px solid ${t.glassBorder}`,
            fontSize: 13, fontFamily: t.fontSans, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: t.text2, fontFamily: t.fontSans }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)}/>
            {tr('files.search.regex')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)}/>
            {tr('files.search.case_sensitive')}
          </label>
        </div>
        <input
          value={includePattern}
          onChange={(e) => setIncludePattern(e.target.value)}
          placeholder={tr('files.search.include_pattern')}
          style={{
            width: '100%', padding: '4px 8px', marginTop: 6, borderRadius: t.r2,
            background: t.bg1, color: t.text1, border: `1px solid ${t.glassBorder}`,
            fontSize: 11, fontFamily: t.fontMono, outline: 'none',
          }}
        />
      </div>
      {/* Estado */}
      {error && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: t.err, fontFamily: t.fontSans }}>{error}</div>
      )}
      {loading && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: t.text2, fontFamily: t.fontSans }}>
          {tr('files.search.searching')}
        </div>
      )}
      {!loading && !error && query.trim() && hits.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: t.text2, fontFamily: t.fontSans }}>
          {tr('files.search.no_results')}
        </div>
      )}
      {!loading && hits.length > 0 && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: t.text2, fontFamily: t.fontSans }}>
          {hits.length === 1
            ? tr('files.search.results_count_one', { n: 1 })
            : tr('files.search.results_count_many', { n: hits.length })}
          {truncated && <span style={{ marginLeft: 8, color: t.warn }}>· {tr('files.search.truncated', { n: 500 })}</span>}
        </div>
      )}
      {/* Resultados agrupados */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {groups.map(([p, hs]) => (
          <div key={p} style={{ marginBottom: 4 }}>
            <div style={{
              padding: '4px 10px', fontSize: 11, color: t.text1, fontFamily: t.fontMono,
              fontWeight: 600, background: t.bg2,
            }}>
              {p}
            </div>
            {hs.map((h, idx) => (
              <button
                key={`${p}:${h.line}:${h.column}:${idx}`}
                type="button"
                onClick={() => onPick(h.path, h.line, h.column)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  width: '100%', textAlign: 'left',
                  padding: '3px 10px 3px 18px',
                  background: 'transparent', border: 0,
                  color: t.text1, cursor: 'pointer',
                  fontFamily: t.fontMono, fontSize: 12,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = t.bg3}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: t.text3, minWidth: 40, textAlign: 'right' }}>{h.line}</span>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, minWidth: 0,
                }}>
                  {h.preview.trim()}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
