import type { ReactNode } from 'react';
import { useTokens, useTheme } from '@/design/theme';

type Props = {
  title: string;
  children: ReactNode;
};

export function MacWindow({ title, children }: Props) {
  const t = useTokens();
  const { effectiveMode } = useTheme();
  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'relative', borderRadius: 12, overflow: 'hidden',
      background: t.windowBg,
      boxShadow: effectiveMode === 'light'
        ? '0 30px 80px -20px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.12)'
        : '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.08)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 36,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 14px', zIndex: 50,
        background: t.chromeBg,
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        borderBottom: `0.5px solid ${t.windowBorder}`,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }}/>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }}/>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }}/>
        </div>
        <div style={{
          flex: 1, textAlign: 'center', fontFamily: t.fontSans,
          fontSize: 13, color: t.text1, fontWeight: 500,
        }}>
          {title}
        </div>
        <div style={{ width: 60 }}/>
      </div>

      <div style={{ position: 'absolute', top: 36, left: 0, right: 0, bottom: 0 }}>
        {children}
      </div>
    </div>
  );
}
