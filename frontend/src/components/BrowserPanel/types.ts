// Tipos compartidos por los sub-componentes del BrowserPanel multi-tabs.

export type ViewportPreset =
  | 'desktop' | 'tablet' | 'mobile' | 'android_gestures' | 'android_buttons'
  | 'android_tablet_gestures' | 'android_tablet_buttons' | 'custom';

export type BrowserTab = {
  id: string;          // random — usado para partition suffix y como key
  url: string;         // current URL del tab (empty = home/blank)
  title: string;       // del did-navigate/page-title-updated; fallback al hostname
  partition: string;   // 'persist:eco-<bubbleId>' (tab default)
                       // 'persist:eco-<bubbleId>-tab-<id>' (sesión nueva)
                       // o el partition de otra tab si es sesión compartida
  isolated: boolean;   // true si la partition NO es la default de la bubble
  viewport: ViewportPreset;
  customViewport?: { width: number; height: number };
  rotated?: boolean;   // dispositivo acostado (ancho y alto intercambiados)
  deviceModel?: string; // id en DEVICE_MODELS de la familia activa
  frameColor?: string;  // id en DEVICE_COLORS de la familia activa
};

export type NewTabMode = 'shared' | 'isolated';

// Sistema que dibuja el marco: barra de estado arriba y de navegación abajo,
// superpuestas a la página, que ocupa la pantalla completa del dispositivo.
export type DeviceChrome = 'none' | 'ios' | 'android-gestures' | 'android-buttons';
export type DeviceFamily = 'iphone' | 'android' | 'ipad' | 'android_tablet';
export const DEVICE_FAMILIES: DeviceFamily[] = ['iphone', 'ipad', 'android', 'android_tablet'];
// Lo que interrumpe la barra de estado: isla (iPhone), cámara perforada
// (teléfono Android) o nada (las tablets llevan la cámara en el marco).
export type DeviceCutout = 'island' | 'punch' | 'none';

export type DeviceSpec = {
  name?: string;
  // Pantalla completa del dispositivo, en px CSS y en vertical.
  width: number;
  height: number;
  chrome: DeviceChrome;
  cutout?: DeviceCutout;
  tablet?: boolean;
  bezel: number;        // grosor total del marco (canto de color + borde negro)
  band: number;         // parte del marco que es el canto de color
  bandColor: string;
  radius: number;       // radio de la pantalla
  statusBar: number;    // alto de la barra de estado (0 = sin barra)
  navBar: number;       // alto de la barra inferior (0 = sin barra)
  // Lo que la página ve del dispositivo: user agent y env(safe-area-inset-*).
  // Solo se puede aplicar en el <webview> de Electron, no en el iframe web.
  userAgent?: string;
  safeArea?: SafeAreaInsets;
  nativeHints?: NativeHints;
};

// Lo que la app nativa le inyecta a la página además del user agent: clases y
// variables CSS en <html>. Una clase en false se quita.
export type NativeHints = { rootClasses: Record<string, boolean>; rootVars: Record<string, string> };

export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

export type DeviceModel = { id: string; name: string; width: number; height: number; radius: number };
export type DeviceColor = { id: string; labelKey: string; hex: string };

// Medidas en px CSS tomadas de tablas públicas de viewports (no de los
// fabricantes); los tonos de los cantos son aproximados. El primero de cada
// lista es el default de la familia.
export const DEVICE_MODELS: Record<DeviceFamily, DeviceModel[]> = {
  iphone: [
    { id: 'iphone-18-pro',     name: 'iPhone 18 Pro',     width: 402, height: 874, radius: 46 },
    { id: 'iphone-18-pro-max', name: 'iPhone 18 Pro Max', width: 440, height: 956, radius: 48 },
    { id: 'iphone-17',         name: 'iPhone 17',         width: 402, height: 874, radius: 44 },
    { id: 'iphone-16e',        name: 'iPhone 16e',        width: 390, height: 844, radius: 40 },
  ],
  android: [
    { id: 'pixel-10-pro',     name: 'Pixel 10 Pro',     width: 410, height: 914, radius: 34 },
    { id: 'pixel-10',         name: 'Pixel 10',         width: 393, height: 851, radius: 32 },
    { id: 'galaxy-s26-ultra', name: 'Galaxy S26 Ultra', width: 412, height: 924, radius: 20 },
    { id: 'android-compact',  name: 'Android 360',      width: 360, height: 800, radius: 24 },
  ],
  ipad: [
    { id: 'ipad-pro-11',  name: 'iPad Pro 11"',  width: 834,  height: 1210, radius: 18 },
    { id: 'ipad-pro-13',  name: 'iPad Pro 13"',  width: 1032, height: 1376, radius: 18 },
    { id: 'ipad-air-11',  name: 'iPad Air 11"',  width: 820,  height: 1180, radius: 18 },
    { id: 'ipad-mini',    name: 'iPad mini',     width: 744,  height: 1133, radius: 20 },
  ],
  android_tablet: [
    { id: 'pixel-tablet',         name: 'Pixel Tablet',         width: 800, height: 1280, radius: 16 },
    { id: 'galaxy-tab-s11',       name: 'Galaxy Tab S11',       width: 800, height: 1280, radius: 14 },
    { id: 'galaxy-tab-s11-ultra', name: 'Galaxy Tab S11 Ultra', width: 924, height: 1480, radius: 14 },
    { id: 'android-tablet-600',   name: 'Android 600',          width: 600, height: 960,  radius: 12 },
  ],
};

export const DEVICE_COLORS: Record<DeviceFamily, DeviceColor[]> = {
  iphone: [
    { id: 'black',    labelKey: 'browser.device.color.black',    hex: '#2a2a2d' },
    { id: 'silver',   labelKey: 'browser.device.color.silver',   hex: '#d6d7d9' },
    { id: 'glacier',  labelKey: 'browser.device.color.glacier',  hex: '#bcd0de' },
    { id: 'burgundy', labelKey: 'browser.device.color.burgundy', hex: '#6d1f30' },
  ],
  android: [
    { id: 'black',  labelKey: 'browser.device.color.black',  hex: '#26272b' },
    { id: 'silver', labelKey: 'browser.device.color.silver', hex: '#dcdad4' },
    { id: 'blue',   labelKey: 'browser.device.color.blue',   hex: '#7f93ab' },
    { id: 'green',  labelKey: 'browser.device.color.green',  hex: '#9db8a4' },
  ],
  ipad: [
    { id: 'black',  labelKey: 'browser.device.color.black',  hex: '#2a2a2d' },
    { id: 'silver', labelKey: 'browser.device.color.silver', hex: '#d6d7d9' },
    { id: 'blue',   labelKey: 'browser.device.color.blue',   hex: '#8fa6bd' },
  ],
  android_tablet: [
    { id: 'black',  labelKey: 'browser.device.color.black',  hex: '#26272b' },
    { id: 'silver', labelKey: 'browser.device.color.silver', hex: '#dcdad4' },
    { id: 'green',  labelKey: 'browser.device.color.green',  hex: '#9db8a4' },
  ],
};

// `mobile` y `tablet` son los presets históricos de las tabs ya guardadas:
// son las familias iPhone y iPad.
export function deviceFamily(preset: ViewportPreset): DeviceFamily | null {
  if (preset === 'mobile') return 'iphone';
  if (preset === 'tablet') return 'ipad';
  if (preset === 'android_gestures' || preset === 'android_buttons') return 'android';
  if (preset === 'android_tablet_gestures' || preset === 'android_tablet_buttons') return 'android_tablet';
  return null;
}

export function isTabletFamily(family: DeviceFamily): boolean {
  return family === 'ipad' || family === 'android_tablet';
}

export function isAndroidFamily(family: DeviceFamily): boolean {
  return family === 'android' || family === 'android_tablet';
}

export function usesButtons(preset: ViewportPreset): boolean {
  return preset === 'android_buttons' || preset === 'android_tablet_buttons';
}

// Preset con el que se entra a una familia; `buttons` solo cuenta en Android.
export function familyPreset(family: DeviceFamily, buttons: boolean): ViewportPreset {
  if (family === 'iphone') return 'mobile';
  if (family === 'ipad') return 'tablet';
  if (family === 'android') return buttons ? 'android_buttons' : 'android_gestures';
  return buttons ? 'android_tablet_buttons' : 'android_tablet_gestures';
}

// El modelo y el color se guardan por familia: un id que no pertenece a la
// familia activa (quedó de la otra) cae al default.
export function deviceModel(family: DeviceFamily, id?: string): DeviceModel {
  const list = DEVICE_MODELS[family];
  return list.find((m) => m.id === id) ?? list[0]!;
}

export function deviceColor(family: DeviceFamily, id?: string): DeviceColor {
  const list = DEVICE_COLORS[family];
  return list.find((c) => c.id === id) ?? list[0]!;
}

export type DeviceSelection = Pick<BrowserTab, 'viewport' | 'customViewport' | 'rotated' | 'deviceModel' | 'frameColor'>;

const PLAIN = { chrome: 'none' as const, statusBar: 0, navBar: 0, band: 0, bandColor: 'transparent' };
type Bars = { statusBar: number; navBar: number };
const BARS: Record<Exclude<DeviceChrome, 'none'>, Bars> = {
  ios: { statusBar: 59, navBar: 34 },
  'android-gestures': { statusBar: 32, navBar: 24 },
  'android-buttons': { statusBar: 32, navBar: 48 },
};
// Las tablets no tienen isla ni cámara en pantalla: franjas más bajas.
const TABLET_BARS: Record<Exclude<DeviceChrome, 'none'>, Bars> = {
  ios: { statusBar: 24, navBar: 20 },
  'android-gestures': { statusBar: 24, navBar: 24 },
  'android-buttons': { statusBar: 24, navBar: 48 },
};

// User agents de los WebView de las apps móviles. El de Android lleva los
// sufijos que agrega la app de Aditum (aditum-android/MainActivity.java): la
// web los lee para reservar las franjas con env(safe-area-inset-*).
const USER_AGENTS: Record<DeviceFamily, string> = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 '
    + '(KHTML, like Gecko) Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Build/BP2A; wv) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 SWVAndroid AditumEdgeToEdge',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 '
    + '(KHTML, like Gecko) Mobile/15E148',
  // Una tablet Android no lleva "Mobile" en el user agent.
  android_tablet: 'Mozilla/5.0 (Linux; Android 16; Pixel Tablet Build/BP2A; wv) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Safari/537.36 SWVAndroid AditumEdgeToEdge',
};

function androidRootVars(top: number): Record<string, string> {
  return { '--aditum-safe-top': `${top}px` };
}

// Dispositivo emulado, ya rotado si corresponde. null = escritorio (fluido).
// Acostado, los teléfonos esconden la barra de estado, como el sistema real;
// las tablets la conservan.
export function deviceSpec(sel: DeviceSelection): DeviceSpec | null {
  const base = uprightSpec(sel);
  if (!base || !sel.rotated) return base;
  if (base.tablet) return { ...base, width: base.height, height: base.width };
  // Acostado no hay franja arriba; en el iPhone la isla queda a un costado.
  const side = base.chrome === 'ios' ? base.statusBar : 0;
  return {
    ...base, width: base.height, height: base.width, statusBar: 0,
    safeArea: base.safeArea && { top: 0, right: side, bottom: base.navBar, left: side },
    nativeHints: base.nativeHints && { ...base.nativeHints, rootVars: androidRootVars(0) },
  };
}

function uprightSpec(sel: DeviceSelection): DeviceSpec | null {
  if (sel.viewport === 'desktop') return null;
  if (sel.viewport === 'custom') {
    return { ...(sel.customViewport ?? { width: 1200, height: 800 }), bezel: 0, radius: 8, ...PLAIN };
  }
  const family = deviceFamily(sel.viewport) ?? 'iphone';
  const model = deviceModel(family, sel.deviceModel);
  const tablet = isTabletFamily(family);
  const android = isAndroidFamily(family);
  const chrome: DeviceChrome = !android ? 'ios'
    : usesButtons(sel.viewport) ? 'android-buttons' : 'android-gestures';
  const bars = (tablet ? TABLET_BARS : BARS)[chrome];
  return {
    name: model.name, width: model.width, height: model.height, radius: model.radius,
    chrome, ...bars, tablet,
    cutout: tablet ? 'none' : android ? 'punch' : 'island',
    userAgent: USER_AGENTS[family],
    safeArea: { top: bars.statusBar, right: 0, bottom: bars.navBar, left: 0 },
    // Igual que aditum-android (MainActivity.injectSafeAreaInsets): con 3
    // botones la web pinta un velo de cristal detrás de ellos
    // (device-safe-area.css de aditum-jh). Con gestos no hay velo.
    nativeHints: android ? {
      rootClasses: { 'ad-android-nav-buttons': chrome === 'android-buttons' },
      rootVars: androidRootVars(bars.statusBar),
    } : undefined,
    bezel: tablet ? 18 : family === 'iphone' ? 13 : 10,
    band: 4,
    bandColor: deviceColor(family, sel.frameColor).hex,
  };
}

export function genTabId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultPartition(bubbleId: string): string {
  return `persist:eco-${bubbleId}`;
}

export function isolatedPartition(bubbleId: string, tabId: string): string {
  return `persist:eco-${bubbleId}-tab-${tabId}`;
}
