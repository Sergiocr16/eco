import { useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react';
import { useTokens } from './theme';
import type { Tokens } from './tokens';
import { AGENT_TYPES, type AgentType, type AgentState, stateColor } from './tokens';

type GlassProps = {
  children?: ReactNode;
  style?: CSSProperties;
  radius?: number;
  hover?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
};

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
        background: t.glassBg,
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        border: `1px solid ${h ? t.glassBorderHi : t.glassBorder}`,
        borderRadius: radius ?? t.r3,
        boxShadow: t.glassInset,
        transition: 'border-color 160ms ease, transform 160ms ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger';
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
};

export function Btn({ children, kind = 'ghost', size = 'md', icon: Icon, onClick, style = {}, disabled, title, type = 'button' }: BtnProps) {
  const t = useTokens();
  const [h, setH] = useState(false);
  const sizes = {
    sm: { h: 26, px: 10, fs: 12, gap: 6, ic: 13 },
    md: { h: 32, px: 14, fs: 13, gap: 8, ic: 14 },
    lg: { h: 40, px: 18, fs: 14, gap: 10, ic: 16 },
  }[size];
  const styles: Record<BtnKind, CSSProperties> = {
    primary: {
      background: h ? t.accent : t.accentDim,
      color: t.accentOn,
      border: `1px solid ${t.accent}`,
      boxShadow: h ? `0 0 24px ${t.accentGlow}` : 'none',
    },
    secondary: {
      background: h ? t.bg4 : t.bg3,
      color: t.text0,
      border: `1px solid ${t.glassBorder}`,
    },
    ghost: {
      background: h ? t.bg3 : 'transparent',
      color: t.text1,
      border: '1px solid transparent',
    },
    danger: {
      background: h ? 'oklch(72% 0.16 25 / 0.18)' : 'transparent',
      color: t.err,
      border: `1px solid oklch(72% 0.16 25 / 0.3)`,
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: sizes.gap,
        height: sizes.h, padding: `0 ${sizes.px}px`,
        fontFamily: t.fontSans, fontSize: sizes.fs, fontWeight: 500,
        borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, letterSpacing: -0.1,
        transition: 'all 140ms ease',
        whiteSpace: 'nowrap',
        ...styles[kind], ...style,
      }}
    >
      {Icon && <Icon size={sizes.ic} />}
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
};

export function IconBtn({ icon: Icon, onClick, title, active, size = 32, style = {} }: IconBtnProps) {
  const t = useTokens();
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? t.accentFaint : (h ? t.bg3 : 'transparent'),
        color: active ? t.accent : (h ? t.text0 : t.text1),
        border: `1px solid ${active ? t.accentDim : 'transparent'}`,
        borderRadius: size >= 32 ? 10 : 8,
        cursor: 'pointer', transition: 'all 140ms',
        ...style,
      }}
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
        background: color, boxShadow: `0 0 8px ${color}`,
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
  const finalColor = color ?? t.text2;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 22, padding: '0 9px',
      background: bg || `color-mix(in oklch, ${finalColor} 12%, transparent)`,
      color: finalColor, borderRadius: 999,
      fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
      letterSpacing: -0.1, whiteSpace: 'nowrap',
      border: `1px solid color-mix(in oklch, ${finalColor} 25%, transparent)`,
      ...style,
    }}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 4px',
      background: t.bg3, border: `1px solid ${t.glassBorder}`,
      borderRadius: 4, color: t.text1,
      fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 500,
    }}>{children}</span>
  );
}

type AgentGlyphProps = {
  type?: AgentType;
  size?: number;
  state?: AgentState;
};

export function AgentGlyph({ type = 'general', size = 36, state = 'running' }: AgentGlyphProps) {
  const t = useTokens();
  const meta = AGENT_TYPES[type] ?? AGENT_TYPES.general;
  const sColor = stateColor(state, t);
  return (
    <div style={{
      width: size, height: size, position: 'relative',
      borderRadius: '50%',
      background: t.bg3,
      border: `0.5px solid ${t.glassBorder}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: t.fontSans, fontSize: size * 0.40, fontWeight: 500,
        color: t.text1, letterSpacing: -0.3,
      }}>{meta.glyph}</span>
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

type SectionLabelProps = {
  children?: ReactNode;
  count?: number;
  action?: ReactNode;
};

export function SectionLabel({ children, count, action }: SectionLabelProps) {
  const t = useTokens();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 4px 10px', color: t.text2,
      fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
      letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      <span>{children}</span>
      {count != null && (
        <span style={{
          padding: '1px 7px', background: t.bg3, borderRadius: 999,
          fontSize: 10, color: t.text1, letterSpacing: 0,
        }}>{count}</span>
      )}
      <div style={{ flex: 1 }}/>
      {action}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        width: 38, height: 22, borderRadius: 999,
        background: on ? t.accent : t.bg4,
        border: `1px solid ${on ? t.accent : t.glassBorder}`,
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', padding: 0,
        transition: 'all 200ms',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: on ? t.accentOn : t.text1,
        transition: 'left 200ms',
      }}/>
    </button>
  );
}

export function fieldStyle(t: Tokens): CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box',
    background: t.bg2, border: `1px solid ${t.glassBorder}`,
    borderRadius: 10, padding: '11px 14px',
    fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
    outline: 'none',
  };
}

export function FormField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const t = useTokens();
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        fontSize: 11.5, color: t.text2, fontWeight: 500,
      }}>
        <span>{label}</span>
        <div style={{ flex: 1 }}/>
        {hint}
      </div>
      {children}
    </label>
  );
}
