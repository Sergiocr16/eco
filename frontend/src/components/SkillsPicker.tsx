import { useEffect, useMemo, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconZap, IconCommand, IconExt } from '@/design/icons';
import { useSkills, filterSkills, type SkillInfo } from '@/hooks/useSkills';

type Props = {
  workspace: string;
  onRun: (skill: SkillInfo) => void;
};

export function SkillsPicker({ workspace, onRun }: Props) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { skills, loading } = useSkills(workspace);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (anchorRef.current.contains(e.target)) return;
      const pop = document.getElementById('eco-skills-popover');
      if (pop && pop.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    // foco al input al abrir
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const filtered = useMemo(() => filterSkills(skills, query, 50), [skills, query]);

  // Solo escondemos si no hay nada que mostrar. Sin workspace igual hay
  // skills user-level (~/.claude/skills) y de plugins instalados.
  if (!loading && skills.length === 0) return null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 10px', height: 32, alignSelf: 'center',
          marginLeft: 'auto', marginRight: 0,
          borderRadius: 8, border: `1px solid ${open ? t.accent : t.glassBorder}`,
          background: open ? t.accentFaint : t.bg2,
          color: open ? t.accent : t.text1,
          fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
          transition: 'background 140ms, color 140ms, border-color 140ms',
        }}>
        <IconZap size={13}/>
        <span>Skills</span>
        {!loading && skills.length > 0 && (
          <span style={{
            minWidth: 16, height: 16, padding: '0 5px',
            borderRadius: 999,
            background: open ? t.accent : t.bg3,
            color: open ? t.accentOn : t.text2,
            fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{skills.length}</span>
        )}
      </button>

      {open && (
        <div
          id="eco-skills-popover"
          style={{
            position: 'absolute', top: 44, right: 12, zIndex: 80,
            width: 380, maxHeight: 'min(520px, 70vh)',
            display: 'flex', flexDirection: 'column',
            background: t.glassBg,
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: `1px solid ${t.glassBorderHi}`,
            borderRadius: 14,
            boxShadow: t.shadowLg,
            overflow: 'hidden',
          }}>
          <div style={{
            padding: '10px 12px 8px',
            borderBottom: `1px solid ${t.glassBorder}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0 }}>
                Skills disponibles
              </div>
              <div style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text3 }}>
                {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
              </div>
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                borderRadius: 8, padding: '7px 10px',
                fontFamily: t.fontSans, fontSize: 12.5, color: t.text0,
                outline: 'none',
              }}
            />
          </div>

          <div style={{
            flex: 1, overflow: 'auto', padding: 6,
          }}>
            {loading ? (
              <div style={{ padding: 18, color: t.text3, fontSize: 12.5, textAlign: 'center' }}>
                Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 18, color: t.text3, fontSize: 12.5, textAlign: 'center' }}>
                {query ? 'Ningún match.' : 'No hay skills en esta carpeta.'}
              </div>
            ) : (
              filtered.map((s) => (
                <SkillRow
                  key={`${s.source}:${s.plugin ?? ''}:${s.name}`}
                  skill={s}
                  onClick={() => { onRun(s); setOpen(false); }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SkillRow({ skill, onClick }: { skill: SkillInfo; onClick: () => void }) {
  const t = useTokens();
  const [h, setH] = useState(false);
  const KindIcon = skill.kind === 'command' ? IconCommand : skill.kind === 'agent' ? IconExt : IconZap;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 10px', border: 0, borderRadius: 8,
        background: h ? t.bg3 : 'transparent',
        cursor: 'pointer', textAlign: 'left',
        fontFamily: t.fontSans, color: t.text1,
        transition: 'background 120ms',
        marginBottom: 2,
      }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: t.bg2, color: skill.kind === 'agent' ? t.warn : t.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
      }}>
        <KindIcon size={13}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontFamily: t.fontMono, fontSize: 12.5, color: t.text0, fontWeight: 500,
          }}>{skill.name}</span>
          <SourceChip source={skill.source} plugin={skill.plugin}/>
        </div>
        {skill.description && (
          <div style={{
            fontSize: 11.5, color: t.text2, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{skill.description}</div>
        )}
      </div>
    </button>
  );
}

function SourceChip({ source, plugin }: { source: SkillInfo['source']; plugin?: string }) {
  const t = useTokens();
  const label = source === 'plugin' && plugin ? plugin : source;
  const color = source === 'project' ? t.accent : source === 'user' ? t.text2 : t.text3;
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 999,
      background: `color-mix(in oklch, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
      color, fontFamily: t.fontMono, fontSize: 9.5, letterSpacing: 0.2,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}
