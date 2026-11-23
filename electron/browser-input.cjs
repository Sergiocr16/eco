// Primitivas compartidas de la automatización del navegador de las bubbles
// (browser-automation.cjs): errores con código, CDP y el input real (mouse por
// CDP, teclado por las APIs de Electron).

class BrowserError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function cdp(wc, method, params) {
  return wc.debugger.sendCommand(method, params ?? {});
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const MODIFIER_BITS = { alt: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };

function modifierMask(list) {
  let mask = 0;
  for (const m of Array.isArray(list) ? list : []) mask |= MODIFIER_BITS[String(m).toLowerCase()] ?? 0;
  return mask;
}

async function mouseClick(wc, x, y, { button = 'left', clickCount = 1, modifiers = 0 } = {}) {
  const buttons = button === 'right' ? 2 : button === 'middle' ? 4 : 1;
  await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
  for (let i = 1; i <= clickCount; i++) {
    await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount: i, modifiers });
    await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i, modifiers });
  }
}

// El teclado va por las APIs de Electron (sendInputEvent / insertText): los
// Input.dispatchKeyEvent / Input.insertText de CDP no llegan a la página de un
// <webview> (verificado en Electron 44, con y sin foco). El mouse sí va por CDP.
const NAMED_KEYS = {
  enter: { code: 'Enter', char: true },
  return: { code: 'Enter', char: true },
  tab: { code: 'Tab' },
  escape: { code: 'Escape' },
  esc: { code: 'Escape' },
  backspace: { code: 'Backspace' },
  delete: { code: 'Delete' },
  arrowup: { code: 'Up' },
  arrowdown: { code: 'Down' },
  arrowleft: { code: 'Left' },
  arrowright: { code: 'Right' },
  up: { code: 'Up' },
  down: { code: 'Down' },
  left: { code: 'Left' },
  right: { code: 'Right' },
  home: { code: 'Home' },
  end: { code: 'End' },
  pageup: { code: 'PageUp' },
  pagedown: { code: 'PageDown' },
  space: { code: 'Space', char: true },
};

const KEY_MODIFIERS = { alt: 'alt', control: 'control', ctrl: 'control', meta: 'meta', cmd: 'meta', command: 'meta', shift: 'shift' };

function modifierNames(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const name = KEY_MODIFIERS[String(m).toLowerCase()];
    if (!name) throw new BrowserError('invalid_args', `Modificador desconocido: ${m}. Usá Alt, Control, Meta o Shift.`);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function keyDef(name) {
  const named = NAMED_KEYS[String(name).toLowerCase()];
  if (named) return named;
  const ch = String(name);
  if ([...ch].length !== 1) {
    throw new BrowserError('invalid_args', `Tecla desconocida: ${name}. Usá Enter, Tab, Escape, Backspace, Delete, flechas, Home, End, PageUp, PageDown, Space o un carácter.`);
  }
  return { code: ch, char: true };
}

async function pressKey(wc, name, modifiers = []) {
  const k = keyDef(name);
  wc.sendInputEvent({ type: 'keyDown', keyCode: k.code, modifiers });
  // Con Ctrl/Cmd la tecla es un atajo: no debe insertar texto.
  if (k.char && !modifiers.includes('control') && !modifiers.includes('meta')) {
    wc.sendInputEvent({ type: 'char', keyCode: k.code, modifiers });
  }
  wc.sendInputEvent({ type: 'keyUp', keyCode: k.code, modifiers });
  await sleep(15);
}

module.exports = { BrowserError, cdp, sleep, modifierMask, modifierNames, mouseClick, pressKey };
