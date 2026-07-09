import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, useTokens } from './design/theme';
import { AppSidebar, type Screen } from './components/AppSidebar';
import { BubbleDock } from './components/BubbleDock';
import { Dashboard } from './screens/Dashboard';
import { AgentDetail } from './screens/AgentDetail';
import { Settings, FoldersManager } from './screens/Settings';
import { AdminScreen } from './screens/AdminScreen';
import { FileExplorer } from './screens/FileExplorer';
import { ArchivedScreen } from './screens/ArchivedScreen';
import { useVoice } from './hooks/useVoice';
import { useBubbles } from './hooks/useBubbles';
import { usePtyBusyTracker } from './hooks/usePtyBusyNotifier';
import { useEcoSocket } from './hooks/useEcoSocket';
import { useWorkspaces } from './hooks/useWorkspaces';
import { emit as ecoEmit } from './lib/eco-bus';
import { writeToBubblePty } from './lib/pty-bridge';
import { hydrateDocs, startUserDocListeners } from './lib/user-sync';
import { hydrateCategories } from './hooks/useCategories';
import { hydratePrefs } from './lib/prefs-sync';
import { hydrateReviewAll } from './hooks/useReviewState';
import { hydrateNotesAll } from './components/NotesPanel/types';
import { hydrateWorkspaceConfig, getWorkspaceConfig } from './lib/workspace-config';
import { setRole } from './lib/auth-role';
import { WorkspacePicker } from './components/WorkspacePicker';
import { AuthScreen, DriftingOrbs } from './screens/AuthScreen';
import { LockScreen } from './screens/LockScreen';
import { OnboardingWizard, hasOnboarded } from './screens/OnboardingWizard';
import { useAuth } from './hooks/useAuth';
import { I18nProvider, useI18n, useT } from './hooks/useI18n';
import type { Bubble } from './lib/types';

import { ecoBackend, ecoToken } from './lib/eco-config';
import { getTopInset } from './lib/platform';
import { getSoloBubbleId } from './lib/solo';
import { IconLock } from './design/icons';
import { WindowZoomController } from './components/WindowZoomController';
import { UpdateBanner } from './components/UpdateBanner';
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
  // Lock screen local con PIN: la sesión de Firebase sigue viva; solo gatea la UI.
  if (auth.lockState !== 'unlocked') {
    return (
      <LockScreen
        mode={auth.lockState === 'setup' ? 'setup' : 'locked'}
        username={auth.state.username}
        onUnlock={auth.unlock}
        onCreate={auth.createPin}
        onSkip={auth.skipPinSetup}
        onSignOut={auth.signOut}
      />
    );
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
  // Mantiene un store global del estado busy/idle del PTY de cada bubble
  // (para los indicadores visuales de la UI).
  usePtyBusyTracker();

  // Hidratación cross-device de prefs personales (categorías + tema/idioma) al
  // loguear. Las bubbles las hidrata useBubbles; notas/review por-bubble se
  // cargan al montar su panel.
  useEffect(() => {
    const u = auth.state.userId;
    if (!u) return;
    let cancelled = false;
    void hydrateDocs().then((docs) => {
      if (cancelled) return;
      // Categorías: SIEMPRE reflejan Firestore (si no hay doc, se limpian las
      // locales viejas — Firestore es la única fuente de verdad).
      const cat = docs['categories'];
      hydrateCategories(cat?.value ?? [], cat?.updatedAt ?? Date.now());
      const prefs = docs['prefs'];
      if (prefs) hydratePrefs(prefs.value, prefs.updatedAt);
      hydrateReviewAll(docs);
      hydrateNotesAll(docs);
    });
    // Listeners en vivo de Firestore → push cross-device (reemplaza el WS doc_*).
    const stopListeners = startUserDocListeners(u);
    // Config por workspace (admin define server + base branches; todos leen).
    void hydrateWorkspaceConfig();
    return () => { cancelled = true; stopListeners(); };
  }, [auth.state.userId]);

  // Rol del usuario como singleton de módulo → ServerPanel/NameAgentDialog
  // saben si es admin sin prop-drilling.
  useEffect(() => { setRole(auth.state.role); }, [auth.state.role]);

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
  const socket = useEcoSocket({
    url: BACKEND,
    token: TOKEN,
    handlers: {
      ...bubbleStreamHandlers(bubbles),
      onClientAction: (action) => {
        // Viene del MCP server externo (POST /bubble/create), que ya trae
        // id/workspace/baseBranch resueltos. Si omite baseBranch caemos al
        // default del usuario.
        bubbles.createBubble({
          id: action.id,
          title: action.title,
          focus: action.focus,
          workspace: action.workspace,
          baseBranch: action.baseBranch ?? defaultBaseBranchForWorkspace(),
        });
      },
    },
  });

  function handleIncomingVoiceText(text: string) {
    // El mic solo se enciende en modo dictado a la terminal: todo lo dictado se
    // acumula en el buffer y se muestra como burbuja arriba para revisar antes
    // de enviarlo al PTY.
    if (!dictationActiveRef.current) return;
    const clean = text.trim();
    if (clean) setDictationBuffer((prev) => (prev ? `${prev} ${clean}` : clean));
  }

  const voice = useVoice({
    language: 'es-419',
    onPhrase: (text: string) => handleIncomingVoiceText(text),
    isLongForm: () => true,
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
    // "Bloquear ahora" desde Settings → lock con PIN (no logout).
    const onLockNow = () => { authRef.current.lock(); };
    window.addEventListener('eco:lock-now', onLockNow);

    arm();  // armado inicial

    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, onActivity);
      window.removeEventListener('eco:security-pref-change', onPrefChange);
      window.removeEventListener('eco:lock-now', onLockNow);
    };
  }, []);

  function handleScreenChange(s: Screen) {
    // NO limpiamos detailBubbleId al cambiar de screen — la AgentDetail se
    // mantiene montada con display:none para que la terminal y los
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
  }

  // Deep-link desde la pantalla Archivos: abre la burbuja dueña del cambio y
  // navega al diff (Git → Cambios) o al archivo en el editor (Files). El
  // doble rAF espera a que el AgentDetail monte sus listeners de tab antes de
  // emitir los eventos del bus.
  function openBubbleChange(bubbleId: string, path: string, mode: 'diff' | 'files') {
    handleOpenAgent(bubbleId);
    if (detachedIds.has(bubbleId)) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mode === 'diff') {
        ecoEmit('eco:switch_tab', { tab: 'git', bubbleId });
        ecoEmit('eco:switch_git_subtab', { sub: 'changes', bubbleId });
      } else {
        ecoEmit('eco:switch_tab', { tab: 'files', bubbleId });
        ecoEmit('eco:files:open_path', { bubbleId, path });
      }
    }));
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

  // Helper compartido: devuelve la rama base por defecto para crear un
  // worktree, basada en el workspace default + favoritos del user. Sin
  // workspace default o sin favoritos → undefined (backend cae a HEAD).
  function defaultBaseBranchForWorkspace(): string | undefined {
    try {
      const ws = window.localStorage.getItem('eco.workspace.default') || '';
      if (!ws) return undefined;
      const last = window.localStorage.getItem(`eco.worktree.last_branch.${ws}`);
      if (last) return last;
      const favRaw = getWorkspaceConfig(ws).baseBranches;
      const first = favRaw.split(',').map((s) => s.trim()).filter(Boolean)[0];
      return first || undefined;
    } catch { return undefined; }
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
          onSignOut={auth.signOut}
          onChangePassword={auth.changePassword}
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
                        onRename={(title) => bubbles.renameBubble(b.id, title)}
                        onClose={() => {
                          requestCloseBubble(b.id, { afterClose: handleBackFromDetail });
                        }}
                        onChangeWorkspace={(ws) => bubbles.setBubbleWorkspace(b.id, ws)}
                        onToggleCategory={(catId) => bubbles.toggleBubbleCategory(b.id, catId)}
                        dictationSupported={voice.isSupported}
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
                  <FileExplorer bubbles={bubbles.bubbles} onOpenChange={openBubbleChange}/>
                ) : screen === 'folders' ? (
                  <FoldersManager/>
                ) : screen === 'settings' ? (
                  <Settings role={auth.state.role}/>
                ) : screen === 'admin' ? (
                  <AdminScreen currentUserId={auth.state.userId}/>
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
      <WorkspacePicker
        open={wsPickerForBubble !== null}
        bubbleTitle={wsPickerForBubble ? (bubbles.bubbles.find((b) => b.id === wsPickerForBubble)?.title ?? '') : ''}
        onPick={(ws) => {
          if (wsPickerForBubble) bubbles.setBubbleWorkspace(wsPickerForBubble, ws);
          setWsPickerForBubble(null);
        }}
        onSkip={() => setWsPickerForBubble(null)}
        onClose={() => setWsPickerForBubble(null)}
        canAddFolders
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
      <UpdateBanner/>
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
