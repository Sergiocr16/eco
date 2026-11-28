import { vh, vw } from '@/lib/ui-zoom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { cx } from '@/design/primitives';
import { IconZap, IconCommand, IconExt } from '@/design/icons';
import { useSkills, filterSkills, type SkillInfo } from '@/hooks/useSkills';
import { useSkillFavorites, skillIdOf } from '@/hooks/useSkillFavorites';

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
  const { isFav, toggle: toggleFav } = useSkillFavorites();

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

  // Siempre renderizamos el botón — aunque no haya skills detectados, así
  // el user sabe dónde encontrarlos. Si hay 0, el dropdown muestra un mensaje
  // explicando dónde Eco los busca.
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={loading
          ? 'Cargando skills…'
          : skills.length === 0
            ? 'Skills (sin detectar — ver dónde buscarlos)'
            : `${skills.length} skills disponibles`}
        aria-expanded={open}
        className={cx('eco-btn eco-btn--sm', open ? 'eco-chip--accent' : 'eco-btn--raised')}
        style={{ alignSelf: 'center' }}>
        <IconZap size={13}/>
        <span>Skills</span>
        <span className="eco-num" style={open ? { color: 'inherit' } : undefined}>{loading ? '…' : skills.length}</span>
      </button>

      {open && (
        <div
          id="eco-skills-popover"
          className="eco-menu"
          style={{
            position: 'absolute', top: 44, right: 12, zIndex: 80,
            width: `min(380px, calc(${vw(100)} - 24px))`, maxHeight: `min(520px, ${vh(70)})`,
            display: 'flex', flexDirection: 'column',
            padding: 0, overflow: 'hidden',
          }}>
          <div style={{ padding: '12px 12px 8px' }}>
            <div className="eco-hstack" style={{ justifyContent: 'space-between', alignItems: 'baseline', margin: '0 4px 8px' }}>
              <div className="eco-label">
                Skills disponibles
              </div>
              <div className="eco-num">
                {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
              </div>
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
              className="eco-field eco-field--sm eco-field--on-sheet"
            />
          </div>

          <div style={{
            flex: 1, overflow: 'auto', padding: 6,
          }}>
            {loading ? (
              <div className="eco-empty">
                Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="eco-sub" style={{ padding: '12px 14px 16px', color: t.text1, lineHeight: 1.55 }}>
                {query ? (
                  'Ningún match para esa búsqueda.'
                ) : (
                  <>
                    <div className="eco-label" style={{ marginBottom: 6 }}>Sin skills detectados</div>
                    Eco busca skills en:
                    <ul className="eco-mono" style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 11.5 }}>
                      <li><code>{workspace || '<workspace>'}/.claude/skills/</code></li>
                      <li><code>~/.claude/skills/</code> (globales)</li>
                      <li><code>~/.claude/commands/</code> (slash commands)</li>
                    </ul>
                    <div style={{ marginTop: 8, color: t.text3 }}>
                      Cada skill es una carpeta con <code className="eco-mono">SKILL.md</code> dentro.
                    </div>
                  </>
                )}
              </div>
            ) : (() => {
              // Si no hay query, separamos en "Favoritos" + resto. Si hay
              // query, lista plana porque el user está buscando algo específico.
              const favs = !query ? filtered.filter((s) => isFav(skillIdOf(s))) : [];
              const others = !query ? filtered.filter((s) => !isFav(skillIdOf(s))) : filtered;
              return (
                <>
                  {favs.length > 0 && (
                    <>
                      <div className="eco-sub" style={{ padding: '6px 10px 4px', fontSize: 11.5 }}>★ Favoritos</div>
                      {favs.map((s) => (
                        <SkillRow
                          key={`fav-${skillIdOf(s)}`}
                          skill={s}
                          favored={true}
                          onToggleFav={() => toggleFav(skillIdOf(s))}
                          onClick={() => { onRun(s); setOpen(false); }}
                        />
                      ))}
                      {others.length > 0 && (
                        <div className="eco-sub" style={{ padding: '8px 10px 4px', fontSize: 11.5 }}>Todos</div>
                      )}
                    </>
                  )}
                  {others.map((s) => (
                    <SkillRow
                      key={skillIdOf(s)}
                      skill={s}
                      favored={isFav(skillIdOf(s))}
                      onToggleFav={() => toggleFav(skillIdOf(s))}
                      onClick={() => { onRun(s); setOpen(false); }}
                    />
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

function SkillRow({
  skill, onClick, favored, onToggleFav,
}: {
  skill: SkillInfo;
  onClick: () => void;
  favored?: boolean;
  onToggleFav?: () => void;
}) {
  const KindIcon = skill.kind === 'command' ? IconCommand : skill.kind === 'agent' ? IconExt : IconZap;
  return (
    <div
      className="eco-menu__item"
      style={{ height: 'auto', alignItems: 'flex-start', padding: '8px 6px 8px 10px', marginBottom: 2, cursor: 'default' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: 0, border: 0, background: 'transparent',
          cursor: 'pointer', textAlign: 'left',
          font: 'inherit', color: 'inherit', minWidth: 0,
        }}>
        <div className={cx('eco-tile eco-tile--sm', skill.kind !== 'agent' && 'eco-tile--accent')} style={{ marginTop: 1 }}>
          <KindIcon size={14}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eco-hstack" style={{ gap: 6, marginBottom: 2 }}>
            <span className="eco-mono eco-truncate" style={{ fontSize: 13, fontWeight: 500 }}>{skill.name}</span>
            <SourceChip source={skill.source} plugin={skill.plugin}/>
          </div>
          {skill.description && (
            <div className="eco-sub" style={{
              lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{skill.description}</div>
          )}
        </div>
      </button>
      {onToggleFav && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          title={favored ? 'Quitar de favoritos' : 'Marcar como favorito'}
          aria-pressed={!!favored}
          className="eco-iconbtn eco-iconbtn--xs"
          style={favored ? { color: 'var(--warn)' } : { color: 'var(--tx3)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24"
            fill={favored ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function SourceChip({ source, plugin }: { source: SkillInfo['source']; plugin?: string }) {
  const label = source === 'plugin' && plugin ? plugin : source;
  return (
    <span className={cx('eco-chip eco-mono', source === 'project' && 'eco-chip--accent')}
      style={{ padding: '1px 8px', fontSize: 11 }}>{label}</span>
  );
}
