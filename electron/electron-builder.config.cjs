// Config de electron-builder generada en JS para poder CONDICIONAR los filtros
// por plataforma de build — algo imposible en el `build` estático de
// package.json. El problema que resuelve: los prebuilds nativos (node-pty,
// ripgrep del claude-agent-sdk) traen una carpeta por arquitectura; en el .dmg
// de Mac excluimos todo lo que no sea darwin-arm64 para bajar peso, pero en el
// .exe de Windows necesitamos SÍ incluir win32-x64. Acá detectamos el target y
// dejamos pasar solo los prebuilds de esa plataforma.
//
// Lo consumen los scripts build:mac / build:win / build:linux vía
// `electron-builder --config electron-builder.config.cjs`.

const argv = process.argv.join(' ');
const wantWin = /(?:^|\s)--win(?:\s|$)/.test(argv);
const wantMac = /(?:^|\s)--mac(?:\s|$)/.test(argv);
const wantLinux = /(?:^|\s)--linux(?:\s|$)/.test(argv);
const target =
  wantWin ? 'win'
  : wantMac ? 'mac'
  : wantLinux ? 'linux'
  : process.platform === 'win32' ? 'win'
  : process.platform === 'darwin' ? 'mac'
  : 'linux';

// Arquitecturas de los prebuilds y cuál conservamos por target.
const RG_ARCHES = ['arm64-darwin', 'arm64-linux', 'x64-darwin', 'x64-linux', 'x64-win32'];
const RG_KEEP = { mac: 'arm64-darwin', win: 'x64-win32', linux: 'x64-linux' }[target];

const PTY_ARCHES = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'];
const PTY_KEEP = { mac: 'darwin-arm64', win: 'win32-x64', linux: 'linux-x64' }[target];

const BIP39_DROP = [
  'chinese_simplified', 'chinese_traditional', 'czech', 'french', 'italian',
  'japanese', 'korean', 'portuguese', 'spanish',
];

// Filtro para backend/node_modules: arranca incluyendo todo y va restando.
const backendNmFilter = [
  '**/*',
  '!**/*.{md,markdown,ts,map,d.ts.map}',
  '!**/test/**',
  '!**/tests/**',
  '!**/__tests__/**',
  '!**/example/**',
  '!**/examples/**',
  '!**/docs/**',
  '!**/.bin/**',
  '!**/*.tsbuildinfo',
  '!**/LICENSE*',
  '!**/CHANGELOG*',
  '!**/AUTHORS*',
  '!**/CONTRIBUTING*',
  '!**/HISTORY*',
  '!**/.github/**',
  '!**/.vscode/**',
  // ripgrep: solo la arch del target.
  ...RG_ARCHES.filter((a) => a !== RG_KEEP)
    .map((a) => `!**/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/${a}/**`),
  // node-pty: solo la arch del target + fuera fuentes/tooling y símbolos debug.
  ...PTY_ARCHES.filter((a) => a !== PTY_KEEP)
    .map((a) => `!**/node-pty/prebuilds/${a}/**`),
  '!**/node-pty/src/**',
  '!**/node-pty/scripts/**',
  '!**/node-pty/tools/**',
  '!**/node-pty/prebuilds/**/*.pdb',
  // build/ y deps/winpty solo aportan en Windows (winpty + conpty); en mac/linux
  // sobran. En Windows los prebuilds/win32-x64 ya traen los .dll/.node, así que
  // igual los excluimos para no duplicar peso.
  '!**/node-pty/build/**',
  '!**/node-pty/deps/**',
  ...BIP39_DROP.map((w) => `!**/bip39/src/wordlists/${w}.json`),
  '!**/typescript/**',
  '!**/esbuild/**',
  '!**/tsx/**',
  '!**/@types/**',
];

const mcpNmFilter = [
  '**/*',
  '!**/*.{md,markdown,ts,map,d.ts.map}',
  '!**/test/**',
  '!**/tests/**',
  '!**/__tests__/**',
  '!**/example/**',
  '!**/examples/**',
  '!**/docs/**',
  '!**/.bin/**',
  '!**/*.tsbuildinfo',
  '!**/LICENSE*',
  '!**/CHANGELOG*',
  '!**/.github/**',
  '!**/.vscode/**',
];

const extraResources = [
  { from: '../backend/dist', to: 'backend/dist' },
  { from: '../backend/node_modules', to: 'backend/node_modules', filter: backendNmFilter },
  { from: '../backend/package.json', to: 'backend/package.json' },
  { from: '../frontend/dist', to: 'frontend/dist' },
  // eco-stt es un binario solo-macOS (Apple Speech). No lo metemos en Windows/Linux.
  ...(target === 'mac' ? [{ from: 'build/bin', to: 'bin', filter: ['eco-stt'] }] : []),
  { from: '../mcp-server/dist', to: 'mcp-server/dist' },
  { from: '../mcp-server/node_modules', to: 'mcp-server/node_modules', filter: mcpNmFilter },
  { from: '../mcp-server/package.json', to: 'mcp-server/package.json' },
];

module.exports = {
  appId: 'com.aditum.eco',
  productName: 'Eco',
  electronVersion: '33.4.11',
  npmRebuild: false,
  buildDependenciesFromSource: false,
  asar: true,
  asarUnpack: ['**/node-pty/**'],
  // Auto-update vía electron-updater contra GitHub Releases (repo público
  // Sergiocr16/eco → no requiere token en runtime para descargar). El build
  // genera latest.yml (win) / latest-mac.yml (mac) junto a los instaladores;
  // el runtime los lee de este mismo provider.
  // `releaseType: 'release'` es explícito a propósito: el default de
  // electron-builder es 'draft', y un draft NO lo ve electron-updater (lee la
  // última release PUBLICADA). Eso hizo que v1.0.4 y v1.0.5 se subieran en
  // borrador y los usuarios de Windows siguieran en v1.0.3 sin enterarse.
  publish: [{ provider: 'github', owner: 'Sergiocr16', repo: 'eco', releaseType: 'release' }],
  directories: {
    buildResources: 'build',
    output: '../release',
  },
  files: ['main.cjs', 'preload.cjs', 'package.json'],
  extraResources,
  mac: {
    category: 'public.app-category.developer-tools',
    // zip además del dmg: electron-updater consume el .zip + latest-mac.yml para
    // actualizar (el dmg es solo instalación inicial). Inerte hasta firmar/notarizar
    // la app — sin firma el updater de macOS rechaza el paquete (ver UPDATES_ENABLED
    // en main.cjs).
    target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
    icon: 'build/icon.icns',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    identity: null,
    extendInfo: {
      NSMicrophoneUsageDescription: 'Eco usa el micrófono para dictar a la terminal (transcripción local con el motor de Apple en el dispositivo).',
      NSSpeechRecognitionUsageDescription: 'Eco transcribe tu dictado a la terminal usando el reconocimiento on-device de Apple — el audio no sale de tu Mac.',
    },
    electronLanguages: ['en', 'es'],
  },
  dmg: {
    title: 'Eco ${version}',
    icon: 'build/icon.icns',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  win: {
    // .ico multi-resolución pre-generado (16/32/48/256) con resampleo Lanczos.
    // No dejamos que electron-builder auto-convierta el PNG: su downscale dejaba
    // los bordes redondeados con halo/aliasing a 16/32/48 px. Regenerar con
    // `node electron/scripts/make-win-icon.cjs`.
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Eco',
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Development',
    icon: 'build/icon.png',
  },
};
