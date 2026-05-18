import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { on as ecoOn } from '@/lib/eco-bus';

// Toast flotante que muestra qué operación git está en curso para una
// bubble específica. Disparado por `eco:git_busy { busy: true, label, kind }`
// y desaparece con `busy: false`. Solo reacciona a eventos del bubble activo.
//
// Sirve para que el user sepa que algo está pasando cuando hace commit /
// push / merge — antes la app parecía "pegada" hasta que terminara.
export function GitBusyToast({ bubbleId }: { bubbleId: string }) {
  const t = useTokens();
  const [active, setActive] = useState<{ kind: string; label: string } | null>(null);

  useEffect(() => {
    return ecoOn('eco:git_busy', (e) => {
      if (e.bubbleId !== bubbleId) return;
      if (e.busy) {
        setActive({ kind: e.kind, label: e.label ?? e.kind });
      } else {
        // Solo limpiar si la kind que termina es la misma activa — evita
        // que un push terminando borre un toast de merge que arrancó después.
        setActive((prev) => (prev && prev.kind === e.kind) ? null : prev);
      }
    });
  }, [bubbleId]);

  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute', top: 14, right: 18,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 14px', borderRadius: 999,
        background: t.glassBg,
        border: `1px solid color-mix(in oklch, ${t.accent} 45%, ${t.glassBorder})`,
        color: t.text0, fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
        boxShadow: t.shadowMd,
        zIndex: 200,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <span style={{
        width: 11, height: 11, borderRadius: '50%',
        border: `1.7px solid color-mix(in oklch, ${t.accent} 25%, transparent)`,
        borderTopColor: t.accent,
        animation: 'eco-spin 0.7s linear infinite',
        display: 'inline-block', flexShrink: 0,
      }}/>
      <span>{active.label}</span>
    </div>
  );
}
