import { useState, type ReactNode } from 'react';
import { useTheme, useTokens } from '@/design/theme';
import { ACCENT_HUES } from '@/design/tokens';
import {
  Glass, Btn, StatusDot, SectionLabel, Toggle, fieldStyle,
} from '@/design/primitives';
import {
  IconSettings, IconKey, IconMic, IconFolder, IconShield, IconLayers,
  IconInfo, IconCheck, IconCpu, IconTerminal, IconWave, IconGlobe,
  IconCommand, IconBolt, IconHistory, IconLock, IconTrash, type IconProps,
} from '@/design/icons';
import { EcoMark } from '@/design/EcoMark';
import { useTTS, type UnifiedVoice } from '@/hooks/useTTS';

type Section = 'general' | 'claude' | 'voice' | 'folders' | 'security' | 'appearance' | 'about';

export function Settings() {
  const t = useTokens();
  const [sec, setSec] = useState<Section>('voice');
  const sections: { id: Section; label: string; icon: (p: IconProps) => JSX.Element }[] = [
    { id: 'general', label: 'General', icon: IconSettings },
    { id: 'claude', label: 'Claude & API', icon: IconKey },
    { id: 'voice', label: 'Voz', icon: IconMic },
    { id: 'folders', label: 'Carpetas', icon: IconFolder },
    { id: 'security', label: 'Seguridad', icon: IconShield },
    { id: 'appearance', label: 'Apariencia', icon: IconLayers },
    { id: 'about', label: 'Acerca de', icon: IconInfo },
  ];
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{
        width: 220, flexShrink: 0, padding: '20px 12px',
        borderRight: `1px solid ${t.glassBorder}`,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <div style={{
          padding: '8px 12px 12px', fontSize: 15, fontWeight: 600,
          color: t.text0, letterSpacing: -0.2,
        }}>Ajustes</div>
        {sections.map((s) => (
          <button
            key={s.id} type="button"
            onClick={() => setSec(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8, border: 0,
              background: sec === s.id ? t.bg3 : 'transparent',
              color: sec === s.id ? t.text0 : t.text1,
              fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', textAlign: 'left',
            }}>
            <s.icon size={14}/>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {sec === 'general' && <SectionGeneral/>}
        {sec === 'claude' && <SectionClaude/>}
        {sec === 'voice' && <SectionVoice/>}
        {sec === 'folders' && <SectionFolders/>}
        {sec === 'security' && <SectionSecurity/>}
        {sec === 'appearance' && <SectionAppearance/>}
        {sec === 'about' && <SectionAbout/>}
      </div>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  const t = useTokens();
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>{title}</h2>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: t.text2 }}>{sub}</p>
    </div>
  );
}

function Row({ icon: Icon, title, desc, control, danger }: {
  icon?: (p: IconProps) => JSX.Element; title: string; desc?: string; control?: ReactNode; danger?: boolean;
}) {
  const t = useTokens();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 0', borderBottom: `1px solid ${t.glassBorder}`,
    }}>
      {Icon && (
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: t.bg3, color: danger ? t.err : t.text1,
          border: `1px solid ${t.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon size={15}/></div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: danger ? t.err : t.text0, fontWeight: 500 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: t.text2, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div>{control}</div>
    </div>
  );
}

function SectionGeneral() {
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title="General" sub="Comportamiento global de Eco."/>
      <GeneralToggleRow icon={IconBolt} title="Abrir Eco al iniciar sesión" storageKey="eco.start.boot" defaultOn/>
      <GeneralToggleRow icon={IconLayers} title="Mantener Eco en la barra de menú" storageKey="eco.menubar" defaultOn/>
      <Row icon={IconCommand} title="Atajo global" desc="Pulsá esta combinación para invocar Eco."
        control={<KbdRow keys={['⌥', '⇧', 'E']}/>}/>
      <Row icon={IconGlobe} title="Idioma de Eco"
        control={
          <Select defaultValue="es" width={180} options={[
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
            { value: 'pt', label: 'Português' },
          ]}/>
        }/>
    </div>
  );
}

function SectionClaude() {
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title="Claude & API" sub="Configura tu acceso a los modelos de Anthropic."/>
      <Row icon={IconCpu} title="Modelo por defecto" desc="Usado al crear nuevos agentes."
        control={
          <Select defaultValue="sonnet" width={220} options={[
            { value: 'sonnet', label: 'claude-sonnet-4-5' },
            { value: 'opus', label: 'claude-opus-4-1' },
            { value: 'haiku', label: 'claude-haiku-4-5' },
          ]}/>
        }/>
      <Row icon={IconTerminal} title="Ruta del Claude CLI" desc="Binario que ejecuta cada agente."
        control={<Input defaultValue="~/.local/bin/claude" width={240} mono/>}/>
      <Row icon={IconBolt} title="Streaming de respuestas" desc="Mostrar texto en tiempo real."
        control={<ToggleControlled defaultOn/>}/>
    </div>
  );
}

function SectionVoice() {
  const t = useTokens();
  const tts = useTTS();
  const spanish = tts.voices.filter((v) => /^es/i.test(v.language));
  const neural = spanish.filter((v) => v.kind === 'piper');
  const system = spanish.filter((v) => v.kind === 'browser');

  return (
    <div style={{ maxWidth: 720 }}>
      <Header title="Voz" sub="Controla cómo Eco te escucha y te responde."/>

      <Row icon={IconWave} title="Palabra de activación" desc='Eco se activa cuando la escucha.'
        control={<Select defaultValue="eco" width={160} options={[
          { value: 'eco', label: '"Eco"' }, { value: 'hey', label: '"Hey Eco"' }, { value: 'oye', label: '"Oye Eco"' },
        ]}/>}/>
      <Row icon={IconMic} title="Escucha siempre activa" desc="Necesario para reconocer la palabra de activación."
        control={<ToggleControlled defaultOn/>}/>
      <Row icon={IconGlobe} title="Idioma de reconocimiento"
        control={<Select defaultValue="es" width={220} options={[
          { value: 'es', label: 'Español (Latinoamérica)' }, { value: 'es-es', label: 'Español (España)' },
          { value: 'en', label: 'English' },
        ]}/>}/>
      <Row icon={IconCommand} title="Respuestas habladas"
        desc="Eco te lee en voz alta las respuestas de los agentes."
        control={<Toggle on={tts.enabled} onChange={tts.setEnabled}/>}/>

      <div style={{ marginTop: 24 }}>
        <SectionLabel>Voz seleccionada</SectionLabel>
        {neural.length > 0 && (
          <VoiceGroup label="Neural local" voices={neural} selected={tts.selectedVoiceURI}
            onSelect={tts.selectVoice}
            onTest={(uri) => {
              const previous = tts.selectedVoiceURI;
              tts.selectVoice(uri);
              const wasEnabled = tts.enabled;
              if (!wasEnabled) tts.setEnabled(true);
              setTimeout(() => tts.speak('Hola, soy Eco. Esta es mi voz.'), 50);
              setTimeout(() => {
                if (!wasEnabled) tts.setEnabled(false);
                if (previous) tts.selectVoice(previous);
              }, 4500);
            }}/>
        )}
        {system.length > 0 && (
          <VoiceGroup label="Sistema" voices={system.slice(0, 10)} selected={tts.selectedVoiceURI}
            onSelect={tts.selectVoice}
            onTest={(uri) => {
              const previous = tts.selectedVoiceURI;
              tts.selectVoice(uri);
              const wasEnabled = tts.enabled;
              if (!wasEnabled) tts.setEnabled(true);
              setTimeout(() => tts.speak('Hola, soy Eco. Esta es mi voz.'), 50);
              setTimeout(() => {
                if (!wasEnabled) tts.setEnabled(false);
                if (previous) tts.selectVoice(previous);
              }, 4500);
            }}/>
        )}
        {neural.length === 0 && system.length === 0 && (
          <div style={{ fontSize: 12, color: t.text2 }}>Sin voces en español detectadas.</div>
        )}
      </div>
    </div>
  );
}

function VoiceGroup({ label, voices, selected, onSelect, onTest }: {
  label: string;
  voices: UnifiedVoice[];
  selected: string | null;
  onSelect: (id: string) => void;
  onTest: (id: string) => void;
}) {
  const t = useTokens();
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10.5, color: t.text2, fontFamily: t.fontMono,
        textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 4px',
      }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {voices.map((v) => (
          <button key={v.id} type="button" onClick={() => onSelect(v.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10, border: 0,
            background: v.id === selected ? t.accentFaint : 'transparent',
            color: v.id === selected ? t.text0 : t.text1, textAlign: 'left',
            cursor: 'pointer', transition: 'background 140ms',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: v.id === selected ? t.accent : 'transparent',
              border: v.id === selected ? 'none' : `1px solid ${t.glassBorder}`,
              flexShrink: 0,
            }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {v.name}
                {v.kind === 'piper' && (
                  <span style={{
                    marginLeft: 8, fontSize: 9.5, color: t.accent,
                    fontFamily: t.fontMono, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}>Neural</span>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: t.text3, fontFamily: t.fontMono, marginTop: 2 }}>
                {v.language}
              </div>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); onTest(v.id); }} style={{
              fontFamily: t.fontMono, fontSize: 11, color: t.text2,
              background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 8px',
            }}>▸ Probar</button>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionFolders() {
  const t = useTokens();
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title="Carpetas autorizadas" sub="Eco solo puede leer y escribir dentro de estas rutas."/>
      <p style={{ fontSize: 12, color: t.text2, marginBottom: 12 }}>
        Configurá los workspaces permitidos en <code style={{ fontFamily: t.fontMono, color: t.text1 }}>backend/.env</code> con la variable <code style={{ fontFamily: t.fontMono, color: t.text1 }}>ECO_WORKSPACES</code>. Próximamente: gestión inline desde aquí.
      </p>
    </div>
  );
}

function SectionSecurity() {
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title="Seguridad" sub="Define qué acciones requieren confirmación explícita."/>
      <Row icon={IconShield} title="Modo seguro global"
        desc="Pide confirmación antes de cualquier modificación de archivos."
        control={<ToggleControlled defaultOn/>}/>
      <Row icon={IconHistory} title="Registro de auditoría"
        desc="Guarda log permanente de cada acción ejecutada por agentes."
        control={<ToggleControlled defaultOn/>}/>
      <Row icon={IconLock} title="Bloquear Eco tras inactividad"
        control={<Select defaultValue="15" width={140} options={[
          { value: '5', label: '5 minutos' }, { value: '15', label: '15 minutos' },
          { value: '60', label: '1 hora' }, { value: 'never', label: 'Nunca' },
        ]}/>}/>
      <Row icon={IconTrash} title="Borrar todos los datos locales" danger
        desc="Elimina cuenta, agentes, historial y caché. No reversible."
        control={<Btn kind="danger" size="sm">Borrar todo</Btn>}/>
    </div>
  );
}

function SectionAppearance() {
  const t = useTokens();
  const { mode, setMode, accentHue, setAccentHue } = useTheme();
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title="Apariencia" sub="Tema visual y preferencias de interfaz."/>
      <SectionLabel>Tema</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {([
          { id: 'dark', label: 'Oscuro', preview: '#0a0a0c' },
          { id: 'light', label: 'Claro', preview: '#f5f5f7' },
          { id: 'system', label: 'Sistema', preview: 'linear-gradient(135deg, #0a0a0c 50%, #f5f5f7 50%)' },
        ] as const).map((m) => (
          <button key={m.id} type="button" onClick={() => setMode(m.id)} style={{
            padding: 14, border: `1px solid ${mode === m.id ? t.accentDim : t.glassBorder}`,
            borderRadius: 14, background: mode === m.id ? t.accentFaint : t.bg2,
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              height: 56, borderRadius: 8, marginBottom: 10,
              background: m.preview, border: `1px solid ${t.glassBorder}`,
            }}/>
            <div style={{
              fontSize: 13, color: mode === m.id ? t.accent : t.text0, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>{mode === m.id && <IconCheck size={12} strokeWidth={3}/>}{m.label}</div>
          </button>
        ))}
      </div>

      <SectionLabel>Color de acento</SectionLabel>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        {ACCENT_HUES.map((a) => (
          <button key={a.hue} type="button" onClick={() => setAccentHue(a.hue)} title={a.name} style={{
            width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
            background: `oklch(70% 0.13 ${a.hue})`,
            boxShadow: accentHue === a.hue ? `0 0 0 2px ${t.bg1}, 0 0 0 4px oklch(74% 0.13 ${a.hue})` : 'none',
          }}/>
        ))}
      </div>
    </div>
  );
}

function SectionAbout() {
  const t = useTokens();
  return (
    <div style={{ maxWidth: 720, textAlign: 'center', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <EcoMark size={80}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>Eco</h2>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: t.text2 }}>
        Centro de control local para agentes de IA · v0.1
      </p>
    </div>
  );
}

// ──────────── helpers

function Select({ defaultValue, options, width }: {
  defaultValue: string; width?: number;
  options: { value: string; label: string }[];
}) {
  const t = useTokens();
  return (
    <select defaultValue={defaultValue} style={{ ...fieldStyle(t), width }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Input({ defaultValue, width, mono }: { defaultValue: string; width?: number; mono?: boolean }) {
  const t = useTokens();
  return (
    <input defaultValue={defaultValue} style={{
      ...fieldStyle(t), width,
      fontFamily: mono ? t.fontMono : t.fontSans,
      fontSize: mono ? 12 : 13.5,
    }}/>
  );
}

function ToggleControlled({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return <Toggle on={on} onChange={setOn}/>;
}

function GeneralToggleRow({ icon, title, storageKey, defaultOn }: {
  icon: (p: IconProps) => JSX.Element; title: string; storageKey: string; defaultOn?: boolean;
}) {
  const [on, setOn] = useState(() => {
    if (typeof window === 'undefined') return defaultOn ?? false;
    const v = window.localStorage.getItem(storageKey);
    if (v == null) return defaultOn ?? false;
    return v === '1';
  });
  return (
    <Row icon={icon} title={title} control={
      <Toggle on={on} onChange={(v) => {
        setOn(v);
        try { window.localStorage.setItem(storageKey, v ? '1' : '0'); } catch { /* noop */ }
      }}/>
    }/>
  );
}

function KbdRow({ keys }: { keys: string[] }) {
  const t = useTokens();
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {keys.map((k) => (
        <span key={k} style={{
          width: 28, height: 28, borderRadius: 8,
          background: t.bg3, border: `1px solid ${t.glassBorder}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.fontMono, fontSize: 12, color: t.text1,
        }}>{k}</span>
      ))}
    </div>
  );
}

// Use StatusDot to keep imports clean even if section doesn't yet render it
void StatusDot; void Glass;
