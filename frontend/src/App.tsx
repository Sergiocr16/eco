import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, useTokens } from './design/theme';
import { apiFetch } from './lib/api';
import { AppSidebar, type Screen } from './components/AppSidebar';
import { BubbleDock } from './components/BubbleDock';
import { Dashboard } from './screens/Dashboard';
import { AgentDetail } from './screens/AgentDetail';
import { Settings } from './screens/Settings';
import { AdminScreen } from './screens/AdminScreen';
import { FileExplorer } from './screens/FileExplorer';
import { ArchivedScreen } from './screens/ArchivedScreen';
import { useVoice } from './hooks/useVoice';
import { useTTS } from './hooks/useTTS';
import { useBubbles } from './hooks/useBubbles';
import { usePtyBusyTracker } from './hooks/usePtyBusyNotifier';
import { useEcoSocket } from './hooks/useEcoSocket';
import { useWorkspaces } from './hooks/useWorkspaces';
import { describeAction, parseMetaCommand, stripWakePrefix, type MetaAction } from './lib/meta-commands';
import { emit as ecoEmit } from './lib/eco-bus';
import { getVoiceTarget, writeVoiceToPty } from './lib/voice-router';
import { writeToBubblePty } from './lib/pty-bridge';
import { CommandFeedback, type FeedbackPayload } from './components/CommandFeedback';
import { StatusOverlay } from './components/StatusOverlay';
import { WorkspacePicker } from './components/WorkspacePicker';
import { AuthScreen, DriftingOrbs } from './screens/AuthScreen';
import { OnboardingWizard, hasOnboarded } from './screens/OnboardingWizard';
import { useAuth } from './hooks/useAuth';
import { useBackupScheduler } from './hooks/useBackupScheduler';
import { useTheme } from './design/theme';
import { I18nProvider, useI18n, useT } from './hooks/useI18n';
import type { Bubble, Message, VoiceState } from './lib/types';

import { ecoBackend, ecoToken } from './lib/eco-config';
import { getTopInset } from './lib/platform';
import { getSoloBubbleId } from './lib/solo';
import { IconLock } from './design/icons';
import { WindowZoomController } from './components/WindowZoomController';
import { bubbleStreamHandlers } from './lib/bubble-socket';
import { SoloBubbleShell } from './screens/SoloBubbleShell';
const BACKEND = ecoBackend();
const TOKEN = ecoToken();

export function App() {
  // Toggle clase global cuando la ventana se oculta. El CSS asociado en
  // index.css pausa todas las @keyframes con `animation-play-state: paused`
  // — evita gastar GPU/batería en aurora, partículas, shimmer cuando el user
  // no nos ve.
  useEffect(() => {
    const apply = () => {
      const hidden = document.visibilityState !== 'visible';
      document.body.classList.toggle('eco-hidden', hidden);
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, []);

  return (
    <ThemeProvider>
      <I18nProvider>
        <WindowZoomController/>
        <NativeMenuLabels/>
        <AuthGate/>
      </I18nProvider>
    </ThemeProvider>
  );
}

// Envía las etiquetas traducidas del menú nativo al main process al montar y en
// cada cambio de idioma. El menú es global de la app (uno solo en macOS), así
// que con que la ventana principal lo sincronice alcanza. No-op fuera de Electron.
function NativeMenuLabels() {
  const tr = useT();
  const { lang } = useI18n();
  useEffect(() => {
    void window.electronAPI?.setMenuLabels?.({
      edit: tr('menu.edit'),
      view: tr('menu.view'),
      window: tr('menu.window'),
      zoomIn: tr('menu.zoom_in'),
      zoomOut: tr('menu.zoom_out'),
      zoomActual: tr('menu.zoom_actual'),
    });
  }, [lang, tr]);
  return null;
}

function AuthGate() {
  const auth = useAuth();
  // ?solo=<bubbleId> → ventana aparte que corre un solo bubble (abierta desde
  // Electron para tirarla a otro monitor). Comparte sesión via localStorage,
  // así que el gate de auth es el mismo.
  const soloBubbleId = getSoloBubbleId();
  if (auth.state.status === 'loading') {
    return null; // splash en blanco mientras pinga /auth/status
  }
  // Ventana "solo bubble" de otro monitor: no pide PIN propio. Refleja el
  // bloqueo de la principal — muestra una pantalla de "bloqueado" y espera a
  // que la principal desbloquee (que repone `eco.session` → re-autentica acá).
  if (soloBubbleId) {
    if (auth.state.status !== 'authenticated') return <SoloLockedScreen/>;
    return <SoloBubbleShell bubbleId={soloBubbleId}/>;
  }
  if (auth.state.status !== 'authenticated') {
    return <AuthScreen authState={auth.state} authActions={auth}/>;
  }
  return <Shell auth={auth}/>;
}

// Pantalla de bloqueo de la ventana "solo bubble". No tiene PIN: el desbloqueo
// vive en la ventana principal. Cuando esa repone `eco.session`, el storage
// listener de useAuth re-autentica y esta pantalla desaparece sola.
function SoloLockedScreen() {
  const t = useTokens();
  const tr = useT();
  // Fondo basado en el tema (igual que el PIN). `eco-keep-animating` exime esta
  // pantalla de la pausa global de animaciones. Para que TODAS las ventanas de
  // bloqueo animen —no solo la enfocada— las ventanas satélite se crean con
  // backgroundThrottling off (ver createBubbleWindow en main.cjs); si no,
  // Chromium congela el render de las que están en segundo plano.
  return (
    <div
      className="eco-keep-animating"
      style={{
        position: 'fixed', inset: 0, zIndex: 1, overflow: 'hidden',
        background: t.windowBg, color: t.text0, fontFamily: t.fontSans,
      }}>
      {/* Mismo fondo animado que la pantalla del PIN (auroras + partículas). */}
      <DriftingOrbs/>

      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14, padding: 24,
        width: 'min(380px, calc(100vw - 48px))', textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: t.bg2, border: `1px solid ${t.glassBorder}`, color: t.text2,
          boxShadow: `0 0 44px 8px color-mix(in oklch, ${t.accent} 20%, transparent)`,
        }}>
          <IconLock size={22} strokeWidth={2}/>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: t.text0 }}>{tr('solo.locked.title')}</div>
        <div style={{ fontSize: 13, color: t.text2, lineHeight: 1.5 }}>
          {tr('solo.locked.sub')}
        </div>
      </div>

      {/* eco · version — abajo a la derecha, igual que en el PIN. */}
      <div style={{
        position: 'absolute', bottom: 14, right: 18, zIndex: 2,
        color: t.text3, fontSize: 10.5, fontFamily: t.fontMono,
        pointerEvents: 'none', display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span style={{ color: t.text2, fontWeight: 500 }}>eco</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
}

function Shell({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const t = useTokens();
  const { setMode } = useTheme();
  const { lang } = useI18n();
  const [wakeActive, setWakeActive] = useState(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dictado a la terminal: el botón de la cabecera de la burbuja enciende el
  // mic en modo dictado. Cada frase final se acumula en `dictationBuffer` (en
  // vez de rutearse a chat/pty/meta) y se muestra como burbuja arriba. Con
  // "Enviar a terminal" se escribe en el PTY principal sin Enter.
  const [dictationActive, setDictationActive] = useState(false);
  const [dictationBuffer, setDictationBuffer] = useState('');
  const dictationActiveRef = useRef(false);
  const dictationBubbleIdRef = useRef<string | null>(null);
  useEffect(() => { dictationActiveRef.current = dictationActive; }, [dictationActive]);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [detailBubbleId, setDetailBubbleId] = useState<string | null>(null);
  // IDs de bubbles "visitadas" — mantenemos un AgentDetail montado por cada
  // una para que al volver entre ellas el webview, PTY, chat, etc. NO se
  // recreen. Solo el detailBubbleId es visible; las demás van a display:none.
  const [visitedBubbleIds, setVisitedBubbleIds] = useState<string[]>([]);
  // Bubbles que ahora corren en una ventana aparte (Electron). Mientras estén
  // acá, esta ventana NO renderiza su AgentDetail — su click va a enfocar la
  // ventana. La verdad la tiene el main process (sabe qué ventanas existen).
  const [detachedIds, setDetachedIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<FeedbackPayload | null>(null);
  const [overlay, setOverlay] = useState<'status' | 'help' | null>(null);
  const [wsPickerForBubble, setWsPickerForBubble] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  // Razón por la cual pedimos confirmación antes de cerrar — afecta el mensaje
  // del modal. 'busy' = Claude trabajando; 'dirty' = worktree con cambios sin
  // commitear. Puede ser ambas a la vez (priorizamos 'dirty' en el mensaje
  // porque tiene más impacto: perder código vs. interrumpir un prompt).
  const [confirmCloseReason, setConfirmCloseReason] = useState<'busy' | 'dirty' | 'both'>('busy');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !hasOnboarded());

  const workspacesHook = useWorkspaces();
  const defaultWs = workspacesHook.list.workspaces[0] ?? '';
  const bubbles = useBubbles(defaultWs, auth.state.userId);
  // Mantiene un store global del estado busy/idle del PTY de cada bubble.
  // Dispara desktop notifications al transitar busy → idle (opt-in via
  // setting `eco.notify.on_finish`).
  usePtyBusyTracker(bubbles.bubbles, detailBubbleId);
  // Scheduler de auto-backup diario — chequea cada hora si pasaron 24h
  // desde el último backup y dispara export silencioso al folder configurado.
  useBackupScheduler(auth.state.role);

  // Click en una notificación nativa del .dmg → abrir el agente que terminó.
  useEffect(() => {
    const off = window.electronAPI?.onNotificationClicked?.((payload) => {
      if (payload?.bubbleId) handleOpenAgent(payload.bubbleId);
    });
    return () => { if (off) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Estado "detached": qué bubbles corren en ventana aparte. Seed inicial +
  // suscripción a aperturas/cierres. Cuando una ventana de bubble se cierra,
  // el main process avisa y re-adoptamos el bubble acá.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onBubbleWindowChange) return;
    api.listBubbleWindows?.().then((ids) => {
      if (Array.isArray(ids)) setDetachedIds(new Set(ids));
    }).catch(() => { /* noop */ });
    const off = api.onBubbleWindowChange(({ bubbleId, open }) => {
      setDetachedIds((prev) => {
        const next = new Set(prev);
        if (open) next.add(bubbleId); else next.delete(bubbleId);
        return next;
      });
    });
    return () => { if (off) off(); };
  }, []);
  const tts = useTTS();
  const lastSpokenRef = useRef<string | null>(null);

  function flash(action: MetaAction) {
    const f = describeAction(action, bubbles.bubbles, lang);
    setFeedback({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: f.title,
      detail: f.detail,
      kind: action.kind === 'unknown' ? 'unknown' : 'ok',
    });
  }

  const socket = useEcoSocket({
    url: BACKEND,
    token: TOKEN,
    handlers: {
      ...bubbleStreamHandlers(bubbles),
      onError: () => { /* ya manejado en socket.error */ },
      onClientAction: (sourceBubbleId, action) => {
        if (action.kind === 'open_bubble') {
          // El backend (vía MCP externo) puede pasar id/workspace/baseBranch
          // pre-determinados. El path interno (agent tool open_bubble) los
          // omite y caemos al default del usuario.
          bubbles.createBubble({
            id: action.id,
            title: action.title,
            focus: action.focus,
            workspace: action.workspace,
            baseBranch: action.baseBranch ?? defaultBaseBranchForWorkspace(),
          });
        } else if (action.kind === 'rename_bubble') {
          if (sourceBubbleId) bubbles.renameBubble(sourceBubbleId, action.title);
        } else if (action.kind === 'close_bubble') {
          if (sourceBubbleId) bubbles.removeBubble(sourceBubbleId);
        }
      },
      onInjectPrompt: () => { /* legacy WS path — backend ahora inyecta server-side vía injectPromptToBubble */ },
      onVoiceTranscribed: (text) => handleIncomingVoiceText(text),
    },
  });

  function handleIncomingVoiceText(text: string) {
    // Modo dictado a la terminal: todo lo dictado se acumula en el buffer y se
    // muestra como burbuja arriba. No se rutea a chat/pty/meta.
    if (dictationActiveRef.current) {
      const clean = text.trim();
      if (clean) setDictationBuffer((prev) => (prev ? `${prev} ${clean}` : clean));
      return;
    }

    const { isMeta, rest } = stripWakePrefix(text);
    const inBubble = screen === 'detail' && !!detailBubbleId;

    // Caso 0: el sub-tab Shell del terminal pidió la voz para sí.
    // Sólo desviamos voz "libre" (sin prefijo Eco) — los comandos meta siguen su flujo.
    if (inBubble && !isMeta && getVoiceTarget() === 'pty') {
      if (writeVoiceToPty(text + '\n')) {
        clearWake();
        return;
      }
    }

    // Caso 1: dentro de una burbuja, sin prefijo Eco → input a la conversación
    if (inBubble && !isMeta) {
      sendTo(detailBubbleId!, text);
      clearWake();
      return;
    }

    // Caso 2: dentro de una burbuja con prefijo Eco → comando meta
    // Caso 3: fuera de burbuja (dashboard/files/settings/history) → TODO es comando meta,
    //         con o sin prefijo. Lo que digas se interpreta como navegación.
    const command = isMeta ? rest : text;
    const action = parseMetaCommand(command, bubbles.bubbles, detailBubbleId || bubbles.activeBubbleId, screen);
    flash(action);
    handleMetaAction(action);
    // Comando resuelto (válido o unknown): apaga el indicador de wake si estaba activo.
    clearWake();
  }

  function activateWake() {
    setWakeActive(true);
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    wakeTimerRef.current = setTimeout(() => {
      setWakeActive(false);
      wakeTimerRef.current = null;
    }, 3000);
  }

  function clearWake() {
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    wakeTimerRef.current = null;
    setWakeActive(false);
  }

  useEffect(() => () => { if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current); }, []);

  function handleMetaAction(action: MetaAction): void {
    switch (action.kind) {
      case 'goto_dashboard':
        setScreen('dashboard'); setDetailBubbleId(null); return;
      case 'goto_settings':
        setScreen('settings'); setDetailBubbleId(null); return;
      case 'goto_files':
        setScreen('files'); setDetailBubbleId(null); return;
      case 'goto_history':
        setScreen('history'); setDetailBubbleId(null); return;
      case 'goto_archived':
        setScreen('archived'); setDetailBubbleId(null); return;
      case 'create_bubble':
      case 'open_or_create': {
        const title = action.kind === 'open_or_create' ? action.title : action.title;
        const fresh = bubbles.createBubble({ title, focus: true, baseBranch: defaultBaseBranchForWorkspace() });
        handleOpenAgent(fresh.id);
        return;
      }
      case 'rename_active': {
        const target = detailBubbleId || bubbles.activeBubbleId;
        if (target) bubbles.renameBubble(target, action.title);
        return;
      }
      case 'close_active': {
        const target = detailBubbleId || bubbles.activeBubbleId;
        if (target) {
          bubbles.removeBubble(target);
          setDetailBubbleId(null);
          setScreen('dashboard');
        }
        return;
      }
      case 'focus_bubble':
        handleOpenAgent(action.bubbleId);
        return;
      case 'next_bubble':
      case 'prev_bubble': {
        const list = [...bubbles.bubbles].sort((a, b) => b.updatedAt - a.updatedAt);
        if (list.length === 0) return;
        const currentId = detailBubbleId || bubbles.activeBubbleId;
        const idx = list.findIndex((b) => b.id === currentId);
        const delta = action.kind === 'next_bubble' ? 1 : -1;
        const next = list[(idx + delta + list.length) % list.length];
        if (next) handleOpenAgent(next.id);
        return;
      }
      case 'show_status':
        setOverlay('status'); return;
      case 'pause_active':
      case 'resume_active': {
        const target = detailBubbleId || bubbles.activeBubbleId;
        if (target) {
          bubbles.setBubbleStatus(target, action.kind === 'pause_active' ? 'paused' : 'idle');
        }
        return;
      }
      case 'toggle_voice':
        tts.setEnabled(action.on); return;
      case 'set_theme':
        setMode(action.mode); return;
      case 'scroll':
        ecoEmit('eco:scroll', { dir: action.dir }); return;
      case 'switch_tab':
        // Comando de voz "Eco terminal/chat/..." → aplica a la burbuja
        // del detalle activo.
        ecoEmit('eco:switch_tab', { tab: action.tab, bubbleId: detailBubbleId ?? undefined }); return;
      case 'switch_git_subtab':
        // Comandos "Eco historial/ramas/stash/tags/cambios/prs" — navegan al
        // tab Git y cambian la sub-pestaña. Emitimos ambos eventos para que
        // tanto el AgentDetail (que ve el tab) como el GitPanel (sub) reaccionen.
        ecoEmit('eco:switch_tab', { tab: 'git', bubbleId: detailBubbleId ?? undefined });
        ecoEmit('eco:switch_git_subtab', { sub: action.sub, bubbleId: detailBubbleId ?? undefined });
        return;
      case 'confirm':
        ecoEmit('eco:confirm', { answer: action.answer }); return;
      case 'repeat_last': {
        const focus = detailBubble ?? bubbles.activeBubble;
        const last = focus?.messages.slice().reverse().find((m) => m.role === 'assistant' && m.text);
        if (last) {
          if (!tts.enabled) tts.setEnabled(true);
          // Forzar nueva lectura aunque ya se haya leído
          lastSpokenRef.current = null;
          tts.speak(last.text);
        }
        return;
      }
      case 'tts_rate': {
        const cur = tts.rate ?? 1;
        const next = action.dir === 'faster' ? Math.min(2, cur + 0.2)
                   : action.dir === 'slower' ? Math.max(0.5, cur - 0.2)
                   : 1;
        tts.setRate?.(next);
        return;
      }
      case 'tts_volume': {
        const cur = tts.volume ?? 1;
        const next = action.dir === 'up' ? Math.min(1, cur + 0.15) : Math.max(0, cur - 0.15);
        tts.setVolume?.(next);
        return;
      }
      case 'server_action': {
        const target = detailBubbleId || bubbles.activeBubbleId;
        if (!target) return;
        const targetBubble = bubbles.bubbles.find((b) => b.id === target);
        if (!targetBubble) return;
        const ws = targetBubble.workspace;
        const dual = window.localStorage.getItem(`eco.dev.dual.${target}`) === '1';
        const roles: Array<'main' | 'frontend' | 'backend'> = dual ? ['backend', 'frontend'] : ['main'];
        const subAction = action.action;
        const endpoint = subAction === 'start' ? '/dev/start'
          : subAction === 'stop' ? '/dev/stop'
          : '/dev/restart';
        void (async () => {
          for (const role of roles) {
            const cmd = window.localStorage.getItem(`eco.dev.cmd.${target}.${role}`) ?? '';
            try {
              await apiFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workspace: ws, bubbleId: target, role,
                  ...(subAction === 'start' && cmd ? { command: cmd } : {}),
                }),
              });
            } catch { /* el error visible va al ServerPanel; acá solo disparamos */ }
          }
        })();
        return;
      }
      case 'toggle_remote_control': {
        const target = detailBubbleId || bubbles.activeBubbleId;
        if (!target) return;
        const targetBubble = bubbles.bubbles.find((b) => b.id === target);
        if (!targetBubble) return;
        // El toggle del remote control vive en localStorage (lo lee/escribe
        // el botón del navbar). Disparamos el mismo CustomEvent que usa el
        // botón para que se reconcilie el indicador del nodo en el dashboard.
        const key = `eco.remote.${target}`;
        if (action.on) {
          // Slug por default = primera palabra del título — el botón lo computa
          // mejor; acá ponemos un valor truthy y dejamos que el botón ajuste.
          const slug = targetBubble.title.split(/\s+/)[0]?.toLowerCase() || 'agent';
          window.localStorage.setItem(key, slug);
          window.dispatchEvent(new CustomEvent('eco:remote-changed', { detail: { bubbleId: target, slug } }));
        } else {
          window.localStorage.removeItem(key);
          window.dispatchEvent(new CustomEvent('eco:remote-changed', { detail: { bubbleId: target, slug: null } }));
        }
        return;
      }
      case 'save_to_obsidian': {
        const target = detailBubbleId || bubbles.activeBubbleId;
        if (!target) return;
        const targetBubble = bubbles.bubbles.find((b) => b.id === target);
        if (!targetBubble) return;
        async function saveSession() {
          try {
            await apiFetch('/integrations/obsidian/save-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bubbleId: targetBubble!.id,
                title: targetBubble!.title,
                workspace: targetBubble!.workspace,
                createdAt: targetBubble!.createdAt,
                updatedAt: targetBubble!.updatedAt,
                messages: targetBubble!.messages.map((m) => ({
                  role: m.role,
                  text: m.text,
                  createdAt: m.createdAt ?? Date.now(),
                })),
              }),
            });
          } catch { /* la UI muestra el flash de "guardando"; errores no críticos */ }
        }
        void saveSession();
        return;
      }
      case 'browser_new_tab': {
        // Voz "Eco nueva pestaña" / "Eco pestaña aislada" — switch a Browser
        // + abre un tab del modo pedido en el agente activo.
        const target = detailBubbleId ?? bubbles.activeBubbleId;
        if (!target) return;
        ecoEmit('eco:switch_tab', { tab: 'browser', bubbleId: target });
        ecoEmit('eco:browser:new_tab', { bubbleId: target, mode: action.mode });
        return;
      }
      case 'browser_close_tab': {
        const target = detailBubbleId ?? bubbles.activeBubbleId;
        if (!target) return;
        ecoEmit('eco:switch_tab', { tab: 'browser', bubbleId: target });
        ecoEmit('eco:browser:close_tab', { bubbleId: target });
        return;
      }
      case 'help':
        setOverlay('help'); return;
      case 'unknown':
      default:
        return;
    }
  }

  const voice = useVoice({
    language: 'es-419',
    onPhrase: (text: string) => handleIncomingVoiceText(text),
    onWakeDetected: () => activateWake(),
    isLongForm: () => dictationActiveRef.current,
  });

  // ─── Auto-lock por inactividad ──────────────────────────────────────────
  // Lee `eco.security.lockAfterMin` (default '15'; 'never' = deshabilitado).
  // Cualquier actividad del user (mouse/teclado/touch) re-arma el timer.
  // Al cumplirse el tiempo sin actividad, `auth.lock()` pide el PIN de nuevo.
  // El cambio de preferencia desde Settings emite `eco:security-pref-change`.
  const authRef = useRef(auth);
  useEffect(() => { authRef.current = auth; }, [auth]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArm = 0;

    const readMinutes = (): number => {
      try {
        const v = window.localStorage.getItem('eco.security.lockAfterMin') ?? '15';
        if (v === 'never') return 0;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch { return 0; }
    };

    const arm = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const mins = readMinutes();
      if (mins <= 0) return;  // deshabilitado
      timer = setTimeout(() => { authRef.current.lock(); }, mins * 60_000);
    };

    // Throttle: re-armar como máximo 1x/segundo — mousemove dispara cientos
    // de eventos por segundo y no necesitamos resetear el timer en cada uno.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastArm < 1000) return;
      lastArm = now;
      arm();
    };
    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart',
    ];
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
    // Cambio de preferencia en Settings → re-armar con el nuevo valor.
    const onPrefChange = () => { lastArm = Date.now(); arm(); };
    window.addEventListener('eco:security-pref-change', onPrefChange);

    arm();  // armado inicial

    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, onActivity);
      window.removeEventListener('eco:security-pref-change', onPrefChange);
    };
  }, []);

  // Modo siempre escuchando: arranca automático si el user ya dio permiso
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (voice.state !== 'off') return;
    if (!voice.isSupported) return;
    const prefersAutoListen = window.localStorage?.getItem('eco.voice.autostart') !== '0';
    if (!prefersAutoListen) return;
    autoStartedRef.current = true;
    // start() solicitará permiso; si el user lo deniega, queda en 'off'
    voice.start();
  }, [voice]);

  // Setting de la voz aplicado al ENTRAR a una conversación (cambio de
  // bubble o llegada al detail). El setting es BIDIRECCIONAL:
  //   ON  → si la voz está apagada, la prende.
  //   OFF → si la voz está escuchando, la apaga (evita que el autostart
  //         de boot deje el mic prendido al entrar a una conversación).
  // El effect SOLO depende de `detailBubbleId` para no re-aplicar en cada
  // toggle manual del mic — una vez dentro de la conversación, el user
  // mantiene control con el botón de mic.
  useEffect(() => {
    if (!detailBubbleId) return;
    if (!voice.isSupported) return;
    const prefersPerConversation = window.localStorage?.getItem('eco.voice.autostart_per_conversation') === '1';
    if (prefersPerConversation) {
      if (voice.state === 'off') voice.start();
    } else {
      if (voice.state === 'listening') voice.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailBubbleId]);

  function sendTo(bubbleId: string, text: string) {
    const bubble = bubbles.bubbles.find((b) => b.id === bubbleId);
    if (!bubble) return;
    bubbles.appendMessage(bubbleId, {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user', text, createdAt: Date.now(),
    });
    socket.send({
      bubbleId, text,
      workspace: bubble.workspace || undefined,
      resumeSessionId: bubble.sessionId,
    });
  }

  const detailBubble: Bubble | null = detailBubbleId
    ? bubbles.bubbles.find((b) => b.id === detailBubbleId) ?? null
    : null;

  // TTS automático del último mensaje del assistant cuando termina
  useEffect(() => {
    if (!tts.enabled) return;
    const focusBubble = detailBubble ?? bubbles.activeBubble;
    if (!focusBubble) return;
    if (focusBubble.status !== 'idle') return;
    const last = focusBubble.messages[focusBubble.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.text) return;
    const key = `${focusBubble.id}:${last.id}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    tts.speak(last.text);
  }, [detailBubble, bubbles.activeBubble, tts]);

  // Voice state derivado para el orbe
  const focusBubble = detailBubble ?? bubbles.activeBubble;
  const voiceStateForOrb: VoiceState = (() => {
    if (voice.state === 'listening' && voice.interimText) return 'listening';
    if (focusBubble?.status === 'executing') return 'executing';
    if (focusBubble?.status === 'thinking') return 'thinking';
    if (tts.speaking) return 'speaking';
    if (voice.state === 'listening') return 'listening';
    return 'idle';
  })();

  function handleScreenChange(s: Screen) {
    // NO limpiamos detailBubbleId al cambiar de screen — la AgentDetail se
    // mantiene montada con display:none para que la terminal, el chat y
    // demás paneles no se reseteen al ir al dashboard y volver. Solo se
    // limpia cuando se cierra la burbuja (`confirmCloseNow`).
    setScreen(s);
  }

  function handleOpenAgent(id: string) {
    // Si el bubble está corriendo en una ventana aparte, no lo abrimos acá:
    // traemos esa ventana al frente.
    if (detachedIds.has(id)) {
      void window.electronAPI?.openBubbleWindow?.(id);
      return;
    }
    setDetailBubbleId(id);
    // Mantenemos esta bubble en el set de "visitadas" para que su
    // AgentDetail viva más allá del bubble switch.
    setVisitedBubbleIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    bubbles.focusBubble(id);
    setScreen('detail');
    // Solo arrancamos el mic al entrar si el user no lo apagó explícitamente.
    // El toggle manual del Dashboard persiste su preferencia en localStorage,
    // así que respetamos esa decisión al cambiar de pantalla.
    const wantsAutoListen = window.localStorage?.getItem('eco.voice.autostart') !== '0';
    if (wantsAutoListen && voice.isSupported && voice.state === 'off' && !voice.error) {
      voice.start();
    }
  }

  function handleBackFromDetail() {
    // Volvemos al dashboard pero dejamos detailBubbleId apuntando a la
    // burbuja para que la AgentDetail sobreviva oculta y conserve su PTY,
    // chat y demás state.
    setScreen('dashboard');
  }

  // Abre el bubble en una ventana/pestaña aparte mostrando SOLO esa
  // conversación (?solo=<id> → SoloBubbleShell).
  //  - Electron: ventana nativa aparte. El bubble "se mueve": esta ventana lo
  //    desmonta para soltar PTY/webview/dev servers y la nueva queda como único
  //    cliente. Al cerrarla, se re-adopta acá.
  //  - Web: abre una pestaña nueva del navegador en el mismo origen con
  //    ?solo=<id>. No desmontamos el bubble acá — la pestaña nueva es un cliente
  //    adicional (mismo localStorage + sesión); PTY/WS soportan multi-cliente.
  function handleOpenInNewWindow(id: string) {
    const api = window.electronAPI;
    if (api?.openBubbleWindow) {
      void api.openBubbleWindow(id).then((r) => {
        if (!r?.ok) return;
        setDetachedIds((prev) => new Set(prev).add(id));
        setVisitedBubbleIds((prev) => prev.filter((x) => x !== id));
        if (detailBubbleId === id) { setDetailBubbleId(null); setScreen('dashboard'); }
      }).catch(() => { /* noop */ });
      return;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('solo', id);
      window.open(url.toString(), '_blank', 'noopener');
    } catch { /* noop */ }
  }

  function bubbleIsBusy(id: string): boolean {
    const b = bubbles.bubbles.find((x) => x.id === id);
    if (!b) return false;
    // "Activo" = Claude está procesando algo. Tener un PTY abierto NO basta —
    // un shell idle no es trabajo activo. El server corriendo lo trackeamos
    // por separado en otros lugares (Dashboard).
    return b.status === 'thinking' || b.status === 'executing' || b.status === 'running' || b.status === 'pending';
  }

  function requestCloseBubble(id: string, opts?: { afterClose?: () => void }) {
    const busy = bubbleIsBusy(id);
    // Archivar es seguro (no borra worktree ni pierde cambios) así que solo
    // confirmamos cuando hay procesos en curso para evitar interrumpir trabajo.
    // El estado "dirty" del worktree ya no es problema porque archivar lo
    // conserva intacto.
    if (busy) {
      setConfirmCloseReason('busy');
      setConfirmCloseId(id);
      return;
    }
    bubbles.removeBubble(id);
    setVisitedBubbleIds((prev) => prev.filter((x) => x !== id));
    if (detailBubbleId === id) setDetailBubbleId(null);
    opts?.afterClose?.();
  }

  function confirmCloseNow() {
    if (!confirmCloseId) return;
    const id = confirmCloseId;
    setConfirmCloseId(null);
    bubbles.removeBubble(id);
    setVisitedBubbleIds((prev) => prev.filter((x) => x !== id));
    if (detailBubbleId === id) {
      setDetailBubbleId(null);
      handleBackFromDetail();
    }
  }

  function handleMicToggle() {
    if (voice.state === 'off' || voice.state === 'unsupported') {
      voice.start();
      // El user explícitamente quiere escuchar — persistimos la preferencia.
      try { window.localStorage.setItem('eco.voice.autostart', '1'); } catch { /* noop */ }
    } else {
      voice.stop();
      // El user explícitamente apagó el mic — recordamos la preferencia
      // para no re-encenderlo automáticamente al abrir burbujas o volver al
      // dashboard. Hasta que el user vuelva a apretar Play.
      try { window.localStorage.setItem('eco.voice.autostart', '0'); } catch { /* noop */ }
    }
  }

  function startTerminalDictation(bubbleId: string) {
    dictationBubbleIdRef.current = bubbleId;
    setDictationBuffer('');
    dictationActiveRef.current = true;
    setDictationActive(true);
    if (voice.state !== 'listening') voice.start();
  }

  function cancelTerminalDictation() {
    dictationActiveRef.current = false;
    setDictationActive(false);
    setDictationBuffer('');
    dictationBubbleIdRef.current = null;
    // En la burbuja el mic queda apagado por defecto — lo dejamos como estaba.
    voice.stop();
  }

  function sendDictationToTerminal() {
    const bubbleId = dictationBubbleIdRef.current;
    const text = dictationBuffer.trim();
    const token = ecoToken();
    if (bubbleId && text && token) {
      const bubble = bubbles.bubbles.find((b) => b.id === bubbleId);
      ecoEmit('eco:switch_tab', { tab: 'terminal', bubbleId });
      // Sin '\n': se escribe en el PTY principal (Claude) y el user revisa
      // antes de ejecutar.
      void writeToBubblePty({ bubbleId, workspace: bubble?.workspace ?? '', text, token });
    }
    cancelTerminalDictation();
  }

  function handleDashboardSend(text: string) {
    if (!bubbles.activeBubble) {
      const fresh = bubbles.createBubble({ focus: true, baseBranch: defaultBaseBranchForWorkspace() });
      sendTo(fresh.id, text);
    } else {
      sendTo(bubbles.activeBubble.id, text);
    }
  }

  // Helper compartido: devuelve la rama base por defecto para crear un
  // worktree, basada en el workspace default + favoritos del user. Sin
  // workspace default o sin favoritos → undefined (backend cae a HEAD).
  function defaultBaseBranchForWorkspace(): string | undefined {
    try {
      const ws = window.localStorage.getItem('eco.workspace.default') || '';
      if (!ws) return undefined;
      const last = window.localStorage.getItem(`eco.worktree.last_branch.${ws}`);
      if (last) return last;
      const favRaw = window.localStorage.getItem(`eco.worktree.favorites.${ws}`) || '';
      const first = favRaw.split(',').map((s) => s.trim()).filter(Boolean)[0];
      return first || undefined;
    } catch { return undefined; }
  }

  function handleAgentDetailSend(text: string) {
    if (!detailBubbleId) return;
    sendTo(detailBubbleId, text);
  }

  function handleCreateAgent(title?: string, workspace?: string, baseBranch?: string) {
    // El dialog ahora pasa workspace explícito (selector de carpeta).
    // Si no se pasó (ej. flujo de voz), caemos al default del usuario.
    const ws = workspace
      || (typeof window !== 'undefined' && window.localStorage?.getItem('eco.workspace.default'))
      || '';
    // Si el dialog no pasó baseBranch, caemos al default del workspace
    // (última elegida o primer favorito).
    const finalBase = baseBranch ?? defaultBaseBranchForWorkspace();
    const fresh = bubbles.createBubble({
      title,
      workspace: ws,
      focus: true,
      baseBranch: finalBase,
    });
    handleOpenAgent(fresh.id);
    // Si no hay workspace todavía, abrir picker para elegir
    if (!ws) setWsPickerForBubble(fresh.id);
  }

  const activeCount = bubbles.bubbles.filter((b) =>
    ['running', 'thinking', 'executing', 'waiting'].includes(b.status as string),
  ).length;

  // Inset superior para reservar el área de los traffic lights de macOS
  // cuando corremos como app empaquetada (titleBarStyle: hiddenInset). En
  // fullscreen los traffic lights desaparecen, así que reset a 0.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onFullscreenChange) return;
    const unsub = api.onFullscreenChange((v) => setIsFullscreen(v));
    return () => { try { unsub(); } catch { /* noop */ } };
  }, []);
  const topInset = isFullscreen ? 0 : getTopInset();

  // Inset inferior cuando el dock está activo y hay agentes — reserva ~76px
  // (alto del dock + margen) para que el contenido no quede tapado.
  const dockEnabled = useDockPref();
  const dockVisible = dockEnabled && bubbles.bubbles.length > 0;
  const bottomInset = dockVisible ? 76 : 0;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: t.windowBg,
      }}/>
      {/* Región arrastrable invisible que cubre los traffic lights y el resto
          de la titlebar. -webkit-app-region: drag permite mover la ventana
          de Electron arrastrando desde acá. Va por arriba del shell para
          asegurar que no se "tape" — pero pointerEvents:auto solo en su área. */}
      {topInset > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: topInset,
          zIndex: 9999,
          background: 'transparent',
          // @ts-expect-error — propiedad no-estándar de Electron/Chromium
          WebkitAppRegion: 'drag',
        }}/>
      )}
      {/* Shell del UI: top=topInset empuja TODO 36px abajo, así los traffic
          lights de mac y el frame del sistema viven en el área superior libre. */}
      <div style={{
        position: 'fixed',
        top: topInset, left: 0, right: 0, bottom: bottomInset,
        zIndex: 1,
        display: 'flex',
        transition: 'bottom 200ms ease',
      }}>
        <AppSidebar
          screen={screen === 'detail' ? 'dashboard' : screen}
          onScreenChange={handleScreenChange}
          agentCount={activeCount}
          username={auth.state.username}
          role={auth.state.role}
          onLock={auth.lock}
          onDestroyUser={auth.destroyUser}
        />
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
          <ScreenError error={socket.error}/>
                {/* Una AgentDetail por bubble visitada. Cada una mantiene
                    su propio state (webview, PTY, chat, server, files, etc.)
                    porque tienen `key={bubble.id}` única y nunca se
                    desmontan al cambiar entre bubbles — solo la activa
                    aparece con display:flex; las demás quedan vivas con
                    display:none.

                    Esto resuelve dos problemas a la vez:
                    1. Cambiar de bubble A → B → A NO recarga el browser
                       ni reconecta el PTY de A (su tree sigue vivo).
                    2. State de panels no se cruza entre bubbles (cada
                       AgentDetail tiene su propio mount/useState).

                    Se desmontan solo cuando la bubble se cierra
                    (requestCloseBubble / confirmCloseNow limpian
                    `visitedBubbleIds`). */}
                {visitedBubbleIds.map((id) => {
                  const b = bubbles.bubbles.find((x) => x.id === id);
                  if (!b) return null;
                  // Bubble corriendo en ventana aparte → no lo renderizamos acá
                  // (su AgentDetail vive en la otra ventana, único cliente del PTY).
                  if (detachedIds.has(id)) return null;
                  const isActive = id === detailBubbleId && screen === 'detail';
                  return (
                    <div key={id} style={{
                      position: 'absolute', inset: 0,
                      display: isActive ? 'flex' : 'none',
                      flexDirection: 'column',
                    }}>
                      <AgentDetail
                        bubble={b}
                        workspaces={workspacesHook.list.workspaces}
                        onBack={handleBackFromDetail}
                        onSend={handleAgentDetailSend}
                        onInterrupt={socket.interrupt}
                        onRename={(title) => bubbles.renameBubble(b.id, title)}
                        onClose={() => {
                          requestCloseBubble(b.id, { afterClose: handleBackFromDetail });
                        }}
                        onChangeWorkspace={(ws) => bubbles.setBubbleWorkspace(b.id, ws)}
                        onToggleCategory={(catId) => bubbles.toggleBubbleCategory(b.id, catId)}
                        onMicToggle={handleMicToggle}
                        listening={dictationActive ? false : voice.state === 'listening'}
                        voiceInterim={dictationActive ? '' : voice.interimText}
                        dictationActive={dictationActive && dictationBubbleIdRef.current === b.id}
                        dictationText={dictationActive && dictationBubbleIdRef.current === b.id ? (dictationBuffer + (voice.interimText ? ` ${voice.interimText}` : '')).trim() : ''}
                        onStartDictation={() => startTerminalDictation(b.id)}
                        onSendDictation={sendDictationToTerminal}
                        onCancelDictation={cancelTerminalDictation}
                        onClearDictation={() => setDictationBuffer('')}
                        onOpenInNewWindow={() => handleOpenInNewWindow(b.id)}
                      />
                    </div>
                  );
                })}
                {screen === 'files' ? (
                  <FileExplorer bubbles={bubbles.bubbles}/>
                ) : screen === 'settings' ? (
                  <Settings role={auth.state.role}/>
                ) : screen === 'admin' ? (
                  <AdminScreen currentUserId={auth.state.userId}/>
                ) : screen === 'history' ? (
                  <HistoryScreen bubbles={bubbles.bubbles} onOpen={handleOpenAgent}/>
                ) : screen === 'archived' ? (
                  <ArchivedScreen
                    bubbles={bubbles.bubbles}
                    onUnarchive={(id) => { bubbles.unarchiveBubble(id); }}
                    onDelete={(id) => { bubbles.deletePermanently(id); }}
                    onOpen={(id) => { bubbles.unarchiveBubble(id); handleOpenAgent(id); }}
                  />
                ) : screen === 'dashboard' ? (
                  <Dashboard
                    bubbles={bubbles.bubbles}
                    activeBubbleId={bubbles.activeBubbleId}
                    role={auth.state.role}
                    userId={auth.state.userId}
                    voiceState={voiceStateForOrb}
                    listening={voice.state === 'listening'}
                    wakeActive={wakeActive}
                    interimText={voice.interimText}
                    voiceError={voice.error}
                    onSend={handleDashboardSend}
                    onMicToggle={handleMicToggle}
                    onOpenAgent={handleOpenAgent}
                    onCreateAgent={handleCreateAgent}
                    onFocus={(id) => bubbles.focusBubble(id)}
                    onRename={(id, title) => bubbles.renameBubble(id, title)}
                    onRemove={(id) => requestCloseBubble(id)}
                    onChangeWorkspace={(id, ws) => bubbles.setBubbleWorkspace(id, ws)}
                    onToggleCategory={(id, catId) => bubbles.toggleBubbleCategory(id, catId)}
                    availableWorkspaces={workspacesHook.list.workspaces}
                  />
                ) : null}
        </div>
      </div>

      <ConfirmCloseBubble
        bubble={confirmCloseId ? bubbles.bubbles.find((b) => b.id === confirmCloseId) ?? null : null}
        reason={confirmCloseReason}
        onCancel={() => setConfirmCloseId(null)}
        onConfirm={confirmCloseNow}
      />
      <CommandFeedback payload={feedback}/>
      <StatusOverlay
        open={overlay !== null}
        view={overlay}
        bubbles={bubbles.bubbles}
        onClose={() => setOverlay(null)}
        onSelect={(id) => { setOverlay(null); handleOpenAgent(id); }}
      />
      <WorkspacePicker
        open={wsPickerForBubble !== null}
        bubbleTitle={wsPickerForBubble ? (bubbles.bubbles.find((b) => b.id === wsPickerForBubble)?.title ?? '') : ''}
        onPick={(ws) => {
          if (wsPickerForBubble) bubbles.setBubbleWorkspace(wsPickerForBubble, ws);
          setWsPickerForBubble(null);
        }}
        onSkip={() => setWsPickerForBubble(null)}
        onClose={() => setWsPickerForBubble(null)}
      />
      <FloatingBubbleDock
        bubbles={bubbles.bubbles}
        // En dashboard ningún agente está "activo" en el dock — el dot
        // pertenece al botón Home. Solo cuando estamos dentro del detalle
        // de un agente marcamos esa burbuja.
        activeBubbleId={screen === 'detail' ? detailBubbleId : null}
        onOpenAgent={handleOpenAgent}
        onGoHome={handleBackFromDetail}
        atHome={screen === 'dashboard'}
      />
      {showOnboarding && (
        <OnboardingWizard
          username={auth.state.username}
          onClose={() => setShowOnboarding(false)}
        />
      )}
    </>
  );
}

// Pref del dock — escuchamos cambios del toggle de Ajustes vía custom event
// y storage event (cross-tab). Compartido entre App.tsx (para el inset) y
// FloatingBubbleDock (para renderizar o no).
function useDockPref(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return window.localStorage.getItem('eco.dock.enabled') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    const sync = () => {
      try { setEnabled(window.localStorage.getItem('eco.dock.enabled') !== '0'); } catch { /* noop */ }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('eco:dock-pref-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('eco:dock-pref-change', sync);
    };
  }, []);
  return enabled;
}

// Dock flotante en bottom-center, controlado por la pref `eco.dock.enabled`.
function FloatingBubbleDock({
  bubbles, activeBubbleId, onOpenAgent, onGoHome, atHome,
}: {
  bubbles: ReturnType<typeof useBubbles>['bubbles'];
  activeBubbleId: string | null;
  onOpenAgent: (id: string) => void;
  onGoHome: () => void;
  atHome: boolean;
}) {
  const enabled = useDockPref();
  if (!enabled) return null;
  const visible = bubbles.filter((b) => !b.archived);
  return (
    <BubbleDock
      bubbles={visible} activeBubbleId={activeBubbleId}
      onOpenAgent={onOpenAgent}
      onGoHome={onGoHome}
      atHome={atHome}
    />
  );
}


function ScreenError({ error }: { error: string | null }) {
  const t = useTokens();
  if (!error) return null;
  return (
    <div style={{
      position: 'absolute', top: 12, right: 24, zIndex: 30,
      background: `color-mix(in oklch, ${t.err} 14%, ${t.bg1})`,
      border: `1px solid color-mix(in oklch, ${t.err} 30%, transparent)`,
      color: t.err, padding: '8px 12px', borderRadius: 10,
      fontSize: 12, fontFamily: t.fontSans,
    }}>{error}</div>
  );
}

function HistoryScreen({ bubbles, onOpen }: { bubbles: Bubble[]; onOpen: (id: string) => void }) {
  const t = useTokens();
  const tr = useT();
  const allMsgs: Array<{ bubble: Bubble; msg: Message }> = [];
  for (const b of bubbles) {
    for (const m of b.messages) allMsgs.push({ bubble: b, msg: m });
  }
  allMsgs.sort((a, b) => b.msg.createdAt - a.msg.createdAt);
  return (
    <div style={{ padding: '28px 32px', overflow: 'auto', height: '100%' }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>
        {tr('history.title')}
      </h2>
      <p style={{ margin: '4px 0 22px', fontSize: 13, color: t.text2 }}>
        {tr('history.sub')}
      </p>
      {allMsgs.length === 0 ? (
        <div style={{ fontSize: 13, color: t.text2, padding: 24 }}>{tr('history.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allMsgs.slice(0, 100).map(({ bubble, msg }) => (
            <button
              key={`${bubble.id}-${msg.id}`} type="button"
              onClick={() => onOpen(bubble.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', background: t.bg2, border: `1px solid ${t.glassBorder}`,
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{
                fontFamily: t.fontMono, fontSize: 11, color: t.text2,
                width: 50, flexShrink: 0,
              }}>{relTime(msg.createdAt)}</span>
              <span style={{
                fontFamily: t.fontSans, fontSize: 12.5, color: t.text1, fontWeight: 500,
                width: 120, flexShrink: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{bubble.title}</span>
              <span style={{
                flex: 1, fontFamily: t.fontSans, fontSize: 12.5,
                color: msg.role === 'user' ? t.text0 : t.text1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{msg.role === 'user' ? `${tr('detail.chat.you')}: ` : '→ '}{msg.text.slice(0, 120)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function relTime(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / (60 * 24))}d`;
}

function ConfirmCloseBubble({
  bubble, reason, onCancel, onConfirm,
}: {
  bubble: Bubble | null;
  reason: 'busy' | 'dirty' | 'both';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  // Doble confirmación: el primer click pide la confirmación EXTRA — el user
  // tiene que volver a clickear para perder de verdad. Reset cuando el
  // bubble/reason cambia.
  const [reConfirm, setReConfirm] = useState(false);
  useEffect(() => { setReConfirm(false); }, [bubble?.id, reason]);
  useEffect(() => {
    if (!bubble) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      // Enter ya no auto-confirma: el user debe clickear el botón
      // expresamente, dos veces si hay reason dirty/both.
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bubble, onCancel]);
  if (!bubble) return null;
  const busyLabel = bubble.status === 'thinking' ? 'pensando'
    : bubble.status === 'executing' ? 'ejecutando'
    : bubble.status === 'running' ? 'corriendo'
    : 'con shell abierta';
  const heading = `¿Archivar «${bubble.title}»?`;
  const body = reason === 'dirty'
    ? 'El worktree de esta burbuja tiene archivos modificados sin commitear. Se archiva tal cual; podés restaurarla desde Archivados con todo el state.'
    : reason === 'both'
      ? `La burbuja está ${busyLabel} y tiene cambios sin commitear. Al archivar se interrumpe el trabajo en curso; el worktree y todos los cambios se conservan.`
      : `La burbuja está ${busyLabel}. Al archivar se interrumpe el trabajo en curso; el worktree y todos los cambios se conservan.`;
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 230,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 18, boxShadow: t.shadowLg,
          padding: 24,
        }}>
        <h2 style={{
          margin: 0, fontSize: 17, fontWeight: 600, color: t.text0, letterSpacing: -0.3,
        }}>{heading}</h2>
        <p style={{ margin: '8px 0 18px', fontSize: 13, color: t.text2, lineHeight: 1.5 }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 14px', borderRadius: 10,
              background: t.bg3, color: t.text0,
              border: `1px solid ${t.glassBorder}`,
              cursor: 'pointer',
              fontFamily: t.fontSans, fontSize: 13,
            }}>Cancelar</button>
          <button
            type="button"
            onClick={() => {
              if (!reConfirm) { setReConfirm(true); return; }
              onConfirm();
            }}
            style={{
              padding: '8px 14px', borderRadius: 10,
              background: t.err, color: t.accentOn,
              border: 0, cursor: 'pointer',
              fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
              boxShadow: `0 0 18px color-mix(in oklch, ${t.err} ${reConfirm ? 60 : 30}%, transparent)`,
              animation: reConfirm ? 'eco-shimmer 0.9s ease-in-out infinite' : undefined,
            }}>{reConfirm ? '⚠️  Click otra vez para confirmar' : 'Cerrar igual'}</button>
        </div>
      </div>
    </div>
  );
}
