// Genera electron/build/icon.png (con esquinas TRANSPARENTES) + icon.ico
// (multi-resolución) a partir de electron/build/icon-opaque.png.
//
// El arte fuente es un squircle oscuro sobre fondo BLANCO OPACO (sin alpha).
// En Windows eso se ve como "bordes blancos" en las esquinas del icono. Acá
// recortamos: flood-fill desde las 4 esquinas sobre los píxeles claros y los
// volvemos transparentes (con alpha proporcional en el borde anti-alias). Se
// usa flood-fill — NO un umbral global — porque el anillo teal del logo también
// es claro, pero vive ADENTRO, separado de las esquinas por el cuerpo oscuro,
// así que el fill nunca lo alcanza.
//
// Luego empaquetamos a .ico con png-to-ico (Lanczos, tamaños 16/32/48/256) para
// que se vea nítido en el taskbar.
//
// png-to-ico y pngjs NO están en package.json (solo se usan para regenerar este
// asset). Instalalos on-demand:
//   npm install png-to-ico pngjs --no-save
//   node electron/scripts/make-win-icon.cjs
// Los assets resultantes (build/icon.png transparente + build/icon.ico) se commitean.

const fs = require('node:fs');
const path = require('node:path');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const SRC = path.join(BUILD_DIR, 'icon-opaque.png');
const OUT_PNG = path.join(BUILD_DIR, 'icon.png');
const OUT_ICO = path.join(BUILD_DIR, 'icon.ico');

let PNG, pngToIcoMod;
try { PNG = require('pngjs').PNG; } catch { console.error('[make-win-icon] falta pngjs. npm install pngjs png-to-ico --no-save'); process.exit(1); }
try { pngToIcoMod = require('png-to-ico'); } catch { console.error('[make-win-icon] falta png-to-ico. npm install pngjs png-to-ico --no-save'); process.exit(1); }
const pngToIco = typeof pngToIcoMod === 'function' ? pngToIcoMod : (pngToIcoMod.default || pngToIcoMod.pngToIco);

if (!fs.existsSync(SRC)) { console.error('[make-win-icon] no se encontró', SRC); process.exit(1); }

const FILL_THRESHOLD = 128;   // píxeles con luminancia > esto son "claros" (fondo)
const DARK = { r: 21, g: 23, b: 29 };  // color del cuerpo del squircle (para el borde)
const DARK_LUM = 21;

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: w, height: h, data } = png;
const lumAt = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

// Flood-fill (BFS) desde las 4 esquinas sobre píxeles claros → marca "fondo".
const outside = new Uint8Array(w * h);
const stack = [0, w - 1, (h - 1) * w, h * w - 1];
for (const start of stack) outside[start] = 1;
const queue = [...stack];
while (queue.length) {
  const p = queue.pop();
  const x = p % w, y = (p / w) | 0;
  const neigh = [];
  if (x > 0) neigh.push(p - 1);
  if (x < w - 1) neigh.push(p + 1);
  if (y > 0) neigh.push(p - w);
  if (y < h - 1) neigh.push(p + w);
  for (const n of neigh) {
    if (outside[n]) continue;
    if (lumAt(n * 4) > FILL_THRESHOLD) { outside[n] = 1; queue.push(n); }
  }
}

// A los píxeles "fondo" les damos alpha proporcional a cuánto cubren del
// squircle (blanco puro → transparente; mezcla de borde → dark semi-transparente).
let cleared = 0, edged = 0;
for (let p = 0; p < w * h; p++) {
  if (!outside[p]) continue;
  const i = p * 4;
  const L = lumAt(i);
  let t = (255 - L) / (255 - DARK_LUM);   // 0 = blanco puro, 1 = oscuro
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const a = Math.round(t * 255);
  data[i] = DARK.r; data[i + 1] = DARK.g; data[i + 2] = DARK.b; data[i + 3] = a;
  if (a === 0) cleared++; else edged++;
}

const transparentPng = PNG.sync.write(png);
fs.writeFileSync(OUT_PNG, transparentPng);
console.log(`[make-win-icon] icon.png transparente — ${cleared} px transparentes, ${edged} px de borde`);

pngToIco(transparentPng).then((buf) => {
  fs.writeFileSync(OUT_ICO, buf);
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) { const o = 6 + i * 16; const s = buf.readUInt8(o) || 256; sizes.push(`${s}x${s}`); }
  console.log(`[make-win-icon] icon.ico listo — ${count} tamaños: ${sizes.join(', ')}`);
}).catch((e) => { console.error('[make-win-icon] png-to-ico falló:', e.message); process.exit(1); });
