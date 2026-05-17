import { type ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { useT, useI18n } from '@/hooks/useI18n';
import { translate, type Lang } from '@/lib/i18n';

export function ShaPill({ sha, abbrev }: { sha?: string; abbrev: string }) {
  const t = useTokens();
  return (
    <code
      title={sha}
      style={{
        fontFamily: t.fontMono, fontSize: 11,
        padding: '1px 6px', borderRadius: 5,
        background: t.bg3, color: t.text1,
        cursor: sha ? 'pointer' : 'default',
      }}
      onClick={(e) => {
        if (!sha) return;
        e.stopPropagation();
        try { void navigator.clipboard.writeText(sha); } catch { /* noop */ }
      }}
    >{abbrev}</code>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 40, gap: 8, color: t.text2,
    }}>
      <div style={{ fontSize: 13, color: t.text1, fontWeight: 500 }}>{message}</div>
      {hint && <div style={{ fontSize: 11.5, color: t.text3, maxWidth: 380, textAlign: 'center' }}>{hint}</div>}
    </div>
  );
}

export function SubpanelLoading({ label }: { label?: string }) {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 32, color: t.text2, fontSize: 13,
      flexDirection: 'column', gap: 10,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `2px solid ${t.glassBorder}`,
        borderTopColor: t.accent,
        animation: 'eco-spin 0.8s linear infinite',
        display: 'inline-block',
      }}/>
      <span>{label ?? tr('common.loading')}</span>
    </div>
  );
}

// formatRelTime: helper "pure" usado en lugares donde no es trivial pasar
// `tr`. Acepta lang opcional — si no se pasa, traduce con el lang vivo del
// contexto. El locale del toLocaleDateString también deriva.
export function formatRelTime(iso: string, lang: Lang = 'es'): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 60) return translate('time.moment_ago', lang);
  if (diffSec < 3600) return translate('time.minutes_ago', lang, { n: Math.floor(diffSec / 60) });
  if (diffSec < 86_400) return translate('time.hours_ago', lang, { n: Math.floor(diffSec / 3600) });
  if (diffSec < 30 * 86_400) return translate('time.days_ago', lang, { n: Math.floor(diffSec / 86_400) });
  const d = new Date(t);
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Hook wrapper: respeta el lang activo del contexto sin que cada caller
// tenga que pasarlo.
export function useFormatRelTime() {
  const { lang } = useI18n();
  return (iso: string) => formatRelTime(iso, lang);
}
