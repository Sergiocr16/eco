import { useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react';
import { useTokens } from './theme';
import type { Tokens } from './tokens';
import { AGENT_TYPES, type AgentType, type AgentState, stateColor } from './tokens';
import { isMobileNow } from '@/hooks/useMediaQuery';

// Las primitivas son envoltorios finos de las clases de eco.css (catálogo en
// DESIGN.md). El estilo inline queda para valores dinámicos.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type GlassProps = {
  children?: ReactNode;
  style?: CSSProperties;
  radius?: number;
  hover?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
};

// Superficie de tarjeta. El nombre viene del diseño anterior (vidrio); hoy es
// plana. Dentro del grafo (tokens `legacy`) conserva el vidrio original.
export function Glass({ children, style = {}, radius, hover = false, onClick, className }: GlassProps) {
  const t = useTokens();
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      className={className}
      style={{
        position: 'relative',
        ...glassEffect(t, { hovered: h }),
        borderRadius: radius ?? (t.legacy ? t.r3 : t.r5),
        transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease, background-color 140ms ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function glassEffect(
  t: Tokens,
  opts: { hovered?: boolean; intensity?: 'subtle' | 'normal' | 'strong' } = {},
): CSSProperties {
  if (!t.legacy) {
    return { background: opts.hovered ? t.hover : t.card, border: '1px solid transparent' };
  }
  const intensity = opts.intensity ?? 'normal';
  const blur =
    intensity === 'strong' ? 32 : intensity === 'subtle' ? 18 : 26;
  const sat = intensity === 'strong' ? 180 : intensity === 'subtle' ? 140 : 160;
  return {
    background: t.glassBg,
    backdropFilter: `blur(${blur}px) saturate(${sat}%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(${sat}%)`,
    border: `1px solid ${opts.hovered ? t.glassBorderHi : t.glassBorder}`,
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.06)',
      'inset 0 0 0 0.5px rgba(255,255,255,0.02)',
      t.shadowMd,
    ].join(', '),
  };
}

// Velo detrás de un diálogo modal.
export function scrimStyle(t: Tokens): CSSProperties {
  return {
    background: t.scrimBg ?? 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
  };
}

// Panel de un diálogo modal. Pasá `border` para los que marcan intención con
// color (acento / err).
export function dialogSurface(t: Tokens, opts: { border?: string } = {}): CSSProperties {
  return {
    background: t.sheet,
    border: `1px solid ${opts.border ?? t.line}`,
    borderRadius: 28,
    boxShadow: t.shadowLg,
  };
}

// Menú flotante / popover.
export function menuSurface(t: Tokens): CSSProperties {
  return {
    background: t.bg,
    border: `1px solid ${t.line2}`,
    borderRadius: 18,
    boxShadow: '0 14px 36px rgba(0,0,0,.22)',
  };
}

export type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid' | 'solid' | 'soft' | 'raised' | 'outline';
export type BtnSize = 'sm' | 'md' | 'lg';

type BtnProps = {
  children?: ReactNode;
  kind?: BtnKind;
  size?: BtnSize;
  icon?: React.ComponentType<{ size?: number }>;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
};

const BTN_SIZE: Record<BtnSize, { cls: string; ic: number }> = {
  sm: { cls: 'eco-btn--xs', ic: 13 },
  md: { cls: '', ic: 15 },
  lg: { cls: 'eco-btn--lg', ic: 16 },
};

export function Btn({ children, kind = 'ghost', size = 'md', icon: Icon, onClick, style, disabled, title, type = 'button', className }: BtnProps) {
  const s = BTN_SIZE[size];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx('eco-btn', s.cls, `eco-btn--${kind}`, className)}
      style={style}
    >
      {Icon && <Icon size={s.ic} />}
      {children}
    </button>
  );
}

type IconBtnProps = {
  icon: React.ComponentType<{ size?: number }>;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  active?: boolean;
  size?: number;
  style?: CSSProperties;
  disabled?: boolean;
  className?: string;
};

export function IconBtn({ icon: Icon, onClick, title, active, size = 32, style = {}, disabled, className }: IconBtnProps) {
  // En táctil crece el área de toque, no el glyph: muchas toolbars pasan
  // size={26} y agrandar el ícono las desbalancearía.
  const box = isMobileNow() ? Math.max(size, 40) : size;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cx('eco-iconbtn', active && 'is-on', className)}
      style={{ width: box, height: box, ...style }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </button>
  );
}

export function StatusDot({ color, pulse = false, size = 8 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: color, boxShadow: pulse ? `0 0 8px ${color}` : 'none',
      }}/>
      {pulse && (
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: color, animation: 'eco-pulse 1.6s ease-out infinite',
        }}/>
      )}
    </span>
  );
}

type PillProps = {
  children?: ReactNode;
  color?: string;
  bg?: string;
  icon?: React.ComponentType<{ size?: number }>;
  style?: CSSProperties;
};

export function Pill({ children, color, bg, icon: Icon, style = {} }: PillProps) {
  const t = useTokens();
  const finalColor = color ?? t.text1;
  return (
    <span className="eco-chip" style={{
      fontSize: 12, padding: '2px 10px',
      background: bg || (color ? `color-mix(in oklch, ${finalColor} 13%, transparent)` : t.raised),
      color: finalColor,
      ...style,
    }}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="eco-kbd">{children}</span>;
}

type AgentGlyphProps = {
  type?: AgentType;
  size?: number;
  state?: AgentState;
  /** Override del glyph. Si se pasa, ignora el type. Ej: primera letra del título. */
  letter?: string;
  accent?: string;
};

// Neutral on purpose: color on the glyph is reserved for the state dot.
export function AgentGlyph({ type = 'general', size = 36, state = 'running', letter }: AgentGlyphProps) {
  const t = useTokens();
  const meta = AGENT_TYPES[type] ?? AGENT_TYPES.general;
  const sColor = stateColor(state, t);
  const display = (letter ?? meta.glyph).slice(0, 2);
  return (
    <div style={{
      width: size, height: size, position: 'relative',
      borderRadius: Math.round(size * 0.3),
      background: t.raised,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: t.fontSans, fontSize: size * (display.length === 1 ? 0.44 : 0.36),
        fontWeight: 600,
        color: t.text0, letterSpacing: -0.3,
      }}>{display}</span>
      {(state === 'running' || state === 'thinking') && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1,
          width: Math.max(8, size * 0.24), height: Math.max(8, size * 0.24),
          borderRadius: '50%', background: sColor,
          border: `2px solid ${t.windowBg}`,
        }}/>
      )}
    </div>
  );
}

export function bubbleLetter(title: string): string {
  if (!title) return '·';
  // Si tiene varias palabras, tomar iniciales (max 2)
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return title.trim()[0]!.toUpperCase();
}

type SectionLabelProps = {
  children?: ReactNode;
  count?: number;
  action?: ReactNode;
};

export function SectionLabel({ children, count, action }: SectionLabelProps) {
  return (
    <div className="eco-hstack" style={{ gap: 8, padding: '0 4px 10px' }}>
      <span className="eco-eyebrow">{children}</span>
      {count != null && <span className="eco-count">{count}</span>}
      <div className="eco-spacer"/>
      {action}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={cx('eco-toggle', on && 'is-on')}
    ><i/></button>
  );
}

export function fieldStyle(t: Tokens): CSSProperties {
  // 16px no es estética: iOS Safari hace auto-zoom al enfocar cualquier input
  // de menos de 16px, y de ahí no vuelve solo. Es el arreglo que más se siente
  // en el teléfono porque aplica a todos los campos del producto.
  const mob = isMobileNow();
  return {
    width: '100%', boxSizing: 'border-box',
    background: t.raised, border: `1px solid ${t.line}`,
    borderRadius: 22, padding: '11px 16px',
    fontFamily: t.fontSans, fontSize: mob ? 16 : 13.5, color: t.text0,
    outline: 'none',
  };
}

export function FormField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const t = useTokens();
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        fontSize: 12.5, color: t.text1,
      }}>
        <span>{label}</span>
        <div style={{ flex: 1 }}/>
        {hint}
      </div>
      {children}
    </label>
  );
}

// ───────── Primitivas del rediseño v2 ─────────

type CardProps = {
  children?: ReactNode;
  /** list: filas con separador · nav: lista de navegación · flush: sin padding · stack: columna con gap */
  variant?: 'default' | 'list' | 'nav' | 'flush' | 'stack';
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  as?: 'div' | 'section' | 'nav' | 'aside';
  title?: string;
};

export function Card({ children, variant = 'default', className, style, onClick, as: Tag = 'div', title }: CardProps) {
  return (
    <Tag
      title={title}
      onClick={onClick}
      className={cx('eco-card', variant !== 'default' && `eco-card--${variant}`, onClick && 'eco-card--click', className)}
      style={style}
    >{children}</Tag>
  );
}

/** Cabecera de página: rótulo + título grande + subtítulo + acciones a la derecha. */
export function PageHeader({ eyebrow, title, sub, after, actions, style }: {
  eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode;
  /** Chips u otros elementos en la misma línea que el título. */
  after?: ReactNode; actions?: ReactNode; style?: CSSProperties;
}) {
  return (
    <header className="eco-page-head" style={style}>
      <div className="eco-page-head__main">
        {eyebrow && <div className="eco-eyebrow">{eyebrow}</div>}
        {after ? (
          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 12, marginTop: 6 }}>
            <h1 className="eco-title" style={{ marginTop: 0 }}>{title}</h1>
            {after}
          </div>
        ) : <h1 className="eco-title">{title}</h1>}
        {sub && <div className="eco-page-head__sub">{sub}</div>}
      </div>
      {actions && <div className="eco-page-head__actions">{actions}</div>}
    </header>
  );
}

export type SegOption<T extends string> = {
  id: T; label?: ReactNode; icon?: React.ComponentType<{ size?: number }>; title?: string; count?: ReactNode;
};

/** Control segmentado. `onCard` cuando vive dentro de una tarjeta. */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', onCard, iconsOnly, style }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void;
  size?: 'sm' | 'md' | 'lg'; onCard?: boolean; iconsOnly?: boolean; style?: CSSProperties;
}) {
  return (
    <div role="tablist" style={style}
      className={cx('eco-seg', size !== 'lg' && `eco-seg--${size}`, onCard && 'eco-seg--on-card', iconsOnly && 'eco-seg--icons')}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === value}
          title={o.title ?? (iconsOnly && typeof o.label === 'string' ? o.label : undefined)}
          onClick={() => onChange(o.id)}
          className={cx('eco-seg__item', o.id === value && 'is-on')}>
          {o.icon && <o.icon size={15}/>}
          {!iconsOnly && o.label}
          {o.count != null && o.count !== '' && <span className="eco-num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function IconTile({ icon: Icon, children, size, accent, onRaised, title, style }: {
  icon?: React.ComponentType<{ size?: number }>; children?: ReactNode;
  size?: 'sm' | 'md' | 'lg'; accent?: boolean; onRaised?: boolean; title?: string; style?: CSSProperties;
}) {
  return (
    <div title={title} style={style}
      className={cx('eco-tile', size && size !== 'md' && `eco-tile--${size}`, accent && 'eco-tile--accent', onRaised && 'eco-tile--on-raised')}>
      {Icon ? <Icon size={size === 'sm' ? 14 : 16}/> : children}
    </div>
  );
}

/** Fila de una tarjeta-lista: mosaico + título/descripción + control al final. */
export function Row({ icon, tile, title, desc, children, onClick, first, tight, style }: {
  icon?: React.ComponentType<{ size?: number }>; tile?: ReactNode;
  title?: ReactNode; desc?: ReactNode; children?: ReactNode;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void; first?: boolean; tight?: boolean; style?: CSSProperties;
}) {
  return (
    <div onClick={onClick} style={style}
      className={cx('eco-row', first && 'eco-row--first', tight && 'eco-row--tight', onClick && 'eco-row--click')}>
      {tile ?? (icon && <IconTile icon={icon}/>)}
      <div className="eco-row__main">
        {title && <div className="eco-row__title">{title}</div>}
        {desc && <div className="eco-row__desc">{desc}</div>}
      </div>
      {children && <div className="eco-row__end">{children}</div>}
    </div>
  );
}

export function Chip({ children, dot, tone, onCard, spin, style, title }: {
  children?: ReactNode; dot?: string | true; tone?: 'accent' | 'ok' | 'warn' | 'err';
  onCard?: boolean; spin?: boolean; style?: CSSProperties; title?: string;
}) {
  return (
    <span title={title} style={style} className={cx('eco-chip', tone && `eco-chip--${tone}`, onCard && 'eco-chip--on-card')}>
      {spin ? <span className="eco-spinner" style={{ width: 10, height: 10 }}/> : dot ? (
        <span className="eco-dot" style={dot === true ? undefined : { background: dot }}/>
      ) : null}
      {children}
    </span>
  );
}
