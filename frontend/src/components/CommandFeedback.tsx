import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconCommand, IconCheck, IconAlert } from '@/design/icons';

export type FeedbackPayload = {
  id: string;
  title: string;
  detail?: string;
  kind?: 'ok' | 'warn' | 'unknown';
};

type Props = {
  payload: FeedbackPayload | null;
};

export function CommandFeedback({ payload }: Props) {
  const t = useTokens();
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<FeedbackPayload | null>(null);

  useEffect(() => {
    if (!payload) return;
    setShown(payload);
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 2000);
    const remove = setTimeout(() => setShown(null), 2400);
    return () => { clearTimeout(hide); clearTimeout(remove); };
  }, [payload]);

  if (!shown) return null;

  const isUnknown = shown.kind === 'unknown';
  const Icon = isUnknown ? IconAlert : shown.kind === 'warn' ? IconAlert : IconCheck;
  const accentColor = isUnknown ? t.warn : t.accent;

  return (
    <div
      style={{
        position: 'fixed', top: 48, left: '50%',
        transform: visible
          ? 'translate(-50%, 0) scale(1)'
          : 'translate(-50%, -10px) scale(0.97)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 240ms ease, transform 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 200, pointerEvents: 'none',
        background: t.glassBg,
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: `1px solid ${t.glassBorderHi}`,
        borderRadius: 999,
        padding: '10px 16px 10px 12px',
        boxShadow: t.shadowLg,
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 200, maxWidth: 480,
        fontFamily: t.fontSans,
      }}
    >
      <span
        style={{
          width: 26, height: 26, borderRadius: '50%',
          background: `color-mix(in oklch, ${accentColor} 18%, transparent)`,
          color: accentColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
        <IconCommand size={12}/>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: t.text0, letterSpacing: -0.1 }}>
          {shown.title}
        </div>
        {shown.detail && (
          <div style={{
            fontSize: 11.5, color: t.text2, marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{shown.detail}</div>
        )}
      </div>
      <Icon size={13} style={{ color: accentColor, flexShrink: 0 }}/>
    </div>
  );
}
