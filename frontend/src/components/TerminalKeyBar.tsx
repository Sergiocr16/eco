import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { SAFE_BOTTOM } from '@/lib/platform';
import { TERM_FONT_MAX, TERM_FONT_MIN } from '@/lib/terminal-prefs';

// El teclado de iOS no tiene Esc, Ctrl, Tab ni flechas, que son exactamente
// las teclas que necesitan los TUI de Claude y Codex (interrumpir, completar,
// navegar el historial, cambiar de modo). Sin esta barra el terminal en el
// teléfono es de solo lectura en la práctica.
//
// Manda secuencias crudas por el mismo camino de input que xterm: no toca el
// protocolo ni el backend.

const PASTE = '__paste__';

type KeyDef = { label: string; seq: string; wide?: boolean };

// Los rótulos son nombres de tecla, no texto de interfaz: no pasan por i18n
// (misma regla que 'OPEN' o 'HARD RESET' en el resto del producto).
// Orden por frecuencia de uso en el teléfono: Shift+Tab (cambiar de modo en
// Claude/Codex) es lo que más se toca, después Tab, / y navegar el historial
// y Enter. Esc y Ctrl+C se usan poco; las flechas laterales casi nunca, por
// eso quedan al final (hay que desplazar la barra para verlas).
const KEYS: KeyDef[] = [
  { label: '⇧Tab', seq: '\x1b[Z', wide: true },
  { label: 'Tab', seq: '\t', wide: true },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: 'Esc', seq: '\x1b', wide: true },
  { label: '^C', seq: '\x03' },
  { label: '^V', seq: PASTE },
  { label: '/', seq: '/' },
  { label: '⏎', seq: '\r' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
];

// Ctrl+V pega el portapapeles del teléfono como bracketed paste (un solo
// mensaje, igual que un pegado real). Si el navegador no deja leerlo, manda
// el Ctrl+V crudo y el CLI resuelve con el portapapeles del anfitrión.
async function pasteSeq(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) return `\x1b[200~${text}\x1b[201~`;
  } catch { /* sin permiso */ }
  return '\x16';
}

export function TerminalKeyBar({
  onKey, fontSize, onFontSize,
}: {
  onKey: (seq: string) => void;
  fontSize: number;
  onFontSize: (next: number) => void;
}) {
  const t = useTokens();
  const tr = useT();

  return (
    <div
      className="eco-dock-scroll"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        // Las teclas van lo más abajo posible: en el terminal cada píxel
        // vertical cuenta y el inset entero de iOS (34px) dejaba una banda
        // muerta debajo. Se capa a 10px, que alcanza para que el indicador de
        // home no quede encima de las teclas sin regalar el resto.
        padding: `4px 8px calc(2px + min(${SAFE_BOTTOM}, 10px))`,
        borderTop: `1px solid ${t.line}`,
        overflowX: 'auto',
        flexShrink: 0,
      }}>
      {KEYS.map((k) => (
        <KeyBtn key={k.label} label={k.label} wide={k.wide} onPress={() => { if (k.seq === PASTE) void pasteSeq().then(onKey); else onKey(k.seq); }}/>
      ))}
      <div style={{ width: 1, height: 22, background: t.line, flexShrink: 0, margin: '0 2px' }}/>
      <KeyBtn
        label="A−"
        title={tr('term.keybar.font_smaller')}
        disabled={fontSize <= TERM_FONT_MIN}
        onPress={() => onFontSize(fontSize - 1)}
      />
      <KeyBtn
        label="A+"
        title={tr('term.keybar.font_bigger')}
        disabled={fontSize >= TERM_FONT_MAX}
        onPress={() => onFontSize(fontSize + 1)}
      />
    </div>
  );
}

function KeyBtn({
  label, onPress, wide = false, title, disabled = false,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  const t = useTokens();
  const [down, setDown] = useState(false);
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      // pointerdown y no click: el terminal pierde el foco en el mousedown del
      // botón, así que preventDefault acá mantiene el teclado del sistema
      // arriba mientras se toca la barra.
      onPointerDown={(e) => { e.preventDefault(); setDown(true); if (!disabled) onPress(); }}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      style={{
        flexShrink: 0,
        minWidth: wide ? 48 : 38, height: 38,
        padding: '0 8px',
        borderRadius: 11,
        border: 0,
        background: down ? t.accentSoft : t.raised,
        color: disabled ? t.text3 : (down ? t.accent : t.text1),
        fontFamily: t.fontMono, fontSize: 13, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 100ms, color 100ms',
      }}>
      {label}
    </button>
  );
}
