import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckSettled, deckUrl } from '../../scripts/chrome.mjs';

const ready = 'window.BeesonEditor && window.BeesonEditor.ready.then(() => true)';

const BITS = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 };

const NAMED = {
  Enter: ['Enter', 'Enter', 13],
  Escape: ['Escape', 'Escape', 27],
  Tab: ['Tab', 'Tab', 9],
  Backspace: ['Backspace', 'Backspace', 8],
  Delete: ['Delete', 'Delete', 46],
  Space: [' ', 'Space', 32],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37],
  ArrowUp: ['ArrowUp', 'ArrowUp', 38],
  ArrowRight: ['ArrowRight', 'ArrowRight', 39],
  ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  Home: ['Home', 'Home', 36],
  End: ['End', 'End', 35],
  PageUp: ['PageUp', 'PageUp', 33],
  PageDown: ['PageDown', 'PageDown', 34],
};

const US_LAYOUT = [
  ['Backquote', 192, '`~'], ['Digit1', 49, '1!'], ['Digit2', 50, '2@'], ['Digit3', 51, '3#'], ['Digit4', 52, '4$'],
  ['Digit5', 53, '5%'], ['Digit6', 54, '6^'], ['Digit7', 55, '7&'], ['Digit8', 56, '8*'], ['Digit9', 57, '9('],
  ['Digit0', 48, '0)'], ['Minus', 189, '-_'], ['Equal', 187, '=+'], ['BracketLeft', 219, '[{'], ['BracketRight', 221, ']}'],
  ['Backslash', 220, '\\|'], ['Semicolon', 186, ';:'], ['Quote', 222, '\'"'], ['Comma', 188, ',<'], ['Period', 190, '.>'],
  ['Slash', 191, '/?'],
];

const SYMBOLS = {
  ' ': ['Space', 32, 0],
  ...Object.fromEntries(US_LAYOUT.flatMap(([code, keyCode, [plain, shifted]]) => [[plain, [code, keyCode, 0]], [shifted, [code, keyCode, BITS.Shift]]])),
};

function keyOf(name, shift) {
  if (NAMED[name]) return [...NAMED[name], 0];
  if (SYMBOLS[name]) return [name, ...SYMBOLS[name]];
  if (/^[a-z]$/i.test(name)) {
    const upper = name.toUpperCase();
    return [shift ? upper : name.toLowerCase(), `Key${upper}`, upper.charCodeAt(0), 0];
  }
  if (/^F[0-9]+$/.test(name)) return [name, name, 111 + Number(name.slice(1)), 0];
  throw new Error(`the key ${name} is not known to press()`);
}

async function platformOf(page) {
  return page.evaluate(`(() => {
    const p = new URLSearchParams(location.search).get('edit-platform');
    if (p === 'mac' || p === 'other') return p;
    return /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'other';
  })()`);
}

export async function editorPage(browser, { deck = 'test-deck.html', query = 'edit&still', text, page: options, clear = false, client } = {}) {
  const page = await browser.newPage(options);
  if (client) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: client });
  if (clear) await page.send('Storage.clearDataForOrigin', { origin: 'file://', storageTypes: 'local_storage' });
  await page.goto(deckUrl(deck, query));
  await page.waitFor(deckSettled);
  await page.waitFor(ready);
  const source = text ?? readFileSync(deck, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(source)})`);
  assert.deepEqual(status.problems, [], `the blocks of ${deck} are not all paired`);
  page.source = source;
  return page;
}

export async function center(page, selector) {
  const point = await page.evaluate(`(() => {
    const r = [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.getBoundingClientRect()).find((r) => r.width && r.height);
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);
  if (!point) throw new Error(`nothing is shown at ${selector}`);
  return point;
}

const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

export async function click(page, at, { button = 'left', count = 1, modifiers = '' } = {}) {
  const { x, y } = typeof at === 'string' ? await center(page, at) : at;
  const bits = await maskOf(page, modifiers);
  const buttons = button === 'right' ? 2 : 1;
  await mouse(page, 'mouseMoved', x, y, { modifiers: bits });
  for (let n = 1; n <= count; n++) {
    await mouse(page, 'mousePressed', x, y, { button, buttons, clickCount: n, modifiers: bits });
    await mouse(page, 'mouseReleased', x, y, { button, clickCount: n, modifiers: bits });
  }
}

export async function clickText(page, at, options = {}) {
  const point = typeof at === 'string' ? await center(page, at) : at;
  await click(page, point, options);
  if (options.modifiers) return;
  const boxed = `(() => {
    const host = document.elementFromPoint(${point.x}, ${point.y})?.closest('[contenteditable="true"]');
    if (!host || host.contains(document.activeElement)) return false;
    const sel = window.BeesonEditor.selection();
    return sel.length === 1 && sel[0].contains(host) && !sel[0].matches('.shape, div.math') && !sel[0].hasAttribute('data-group');
  })()`;
  if (await page.evaluate(boxed)) await click(page, point, options);
}

export async function selectFigure(page, image) {
  await click(page, image);
}

export async function selectPicture(page, image) {
  await click(page, image);
  await click(page, image);
}

export async function drag(page, from, { dx = 0, dy = 0, steps = 10, modifiers = '', hold = false } = {}) {
  const { x, y } = typeof from === 'string' ? await center(page, from) : from;
  const bits = await maskOf(page, modifiers);
  await mouse(page, 'mouseMoved', x, y, { modifiers: bits });
  await mouse(page, 'mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, modifiers: bits });
  for (let i = 1; i <= steps; i++) {
    await mouse(page, 'mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps, { button: 'left', buttons: 1, modifiers: bits });
  }
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
  if (!hold) await mouse(page, 'mouseReleased', x + dx, y + dy, { button: 'left', clickCount: 1, modifiers: bits });
}

async function maskOf(page, modifiers) {
  const names = modifiers ? modifiers.split('+') : [];
  const mac = names.includes('Mod') && (await platformOf(page)) === 'mac';
  return names.reduce((bits, name) => bits | (name === 'Mod' ? (mac ? BITS.Meta : BITS.Ctrl) : BITS[name] ?? 0), 0);
}

export async function openFormula(page, selector) {
  await page.evaluate(`(() => { const m = document.querySelector(${JSON.stringify(selector)}); m.focus(); return true; })()`);
  await press(page, 'Enter');
}

export async function press(page, keys, { count = 1, command } = {}) {
  const names = keys.split(/\+(?=.)/);
  const name = names.pop();
  for (const m of names) if (m !== 'Mod' && !(m in BITS)) throw new Error(`the modifier ${m} is not known to press()`);
  const [key, code, keyCode, shifted] = keyOf(name, names.includes('Shift'));
  const modifiers = (await maskOf(page, names.join('+'))) | shifted;
  const chord = modifiers & (BITS.Ctrl | BITS.Meta);
  const text = chord ? undefined : key.length === 1 ? key : key === 'Enter' ? '\r' : undefined;
  const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers };
  const down = { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}), ...(command ? { commands: [command] } : {}) };
  const sent = [];
  for (let i = 0; i < count; i++) sent.push(page.send('Input.dispatchKeyEvent', down), page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }));
  await Promise.all(sent);
}

export async function typeKeys(page, text) {
  const sent = [];
  for (const c of text) {
    const [code, keyCode, modifiers] = SYMBOLS[c] ?? [`Key${c.toUpperCase()}`, c.toUpperCase().charCodeAt(0), /[A-Z]/.test(c) ? BITS.Shift : 0];
    const base = { key: c, code, windowsVirtualKeyCode: keyCode, modifiers };
    sent.push(page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: c, unmodifiedText: c }));
    sent.push(page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }));
  }
  await Promise.all(sent);
}

export async function type(page, text) {
  await page.send('Input.insertText', { text });
}

export async function recordPreview(page, read = 'null') {
  await page.evaluate(`(() => {
    const html = document.documentElement;
    window.__previewObserver?.disconnect();
    window.__preview = [];
    window.__previewObserver = new MutationObserver(() => window.__preview.push({ step: html.dataset.previewStep, playing: html.classList.contains('beeson-previewing'), read: ${read} }));
    window.__previewObserver.observe(html, { attributes: true, attributeFilter: ['data-preview-step'] });
    return true;
  })()`);
}

export async function previewFrames(page, timeout = 60000) {
  await page.waitFor(`window.__preview.length > 0 && !document.documentElement.classList.contains('beeson-previewing')`, timeout);
  return page.evaluate('window.__preview');
}

export async function readAtPlay(page, read, start, timeout = 20000) {
  await page.evaluate(`(() => {
    window.__transition = null;
    new MutationObserver((records, observer) => {
      if (document.querySelector('.beeson-edit-preview')?.dataset.phase !== 'play') return;
      observer.disconnect();
      window.__transition = { read: ${read} };
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-phase'] });
    return true;
  })()`);
  await start();
  await page.waitFor(`!!window.__transition && !document.querySelector('.beeson-edit-preview')`, timeout);
  return (await page.evaluate('window.__transition')).read;
}

export async function captured(page, done) {
  const failed = `/\\b(the|this) video\\b|the poster/.test(window.BeesonEditor.status().message)`;
  await page.waitFor(`(${done}) || ${failed}`, 150000);
  const { message } = await page.evaluate('window.BeesonEditor.status()');
  assert.ok(await page.evaluate(done), `the poster is not captured: ${message}`);
}

export async function saveAndReopen(page, name = 'saved.html') {
  const text = await page.evaluate(`(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(${JSON.stringify(name)}, { create: true });
    window.BeesonEditor.attach(handle);
    await window.BeesonEditor.save();
    return (await handle.getFile()).text();
  })()`);
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`);
  assert.deepEqual(status.problems, [], `the blocks of the saved text are not all paired`);
  assert.equal(await page.evaluate('window.BeesonEditor.render()'), text, 'the saved text is not rendered byte for byte');
  return { text, status };
}

export async function byteExact(page, edits = []) {
  let expected = page.source;
  for (const [before, after] of edits) {
    assert.equal(expected.split(before).length, 2, `${before} does not occur once in the deck`);
    expected = expected.replace(before, () => after);
  }
  assert.equal(await page.evaluate('window.BeesonEditor.render()'), expected);
}

export function contrast(fg, bg) {
  const num = (c) => c.match(/[\d.]+/g).map(Number);
  const [r, g, b, a = 1] = num(fg);
  const under = num(bg);
  const top = [r, g, b].map((v, i) => v * a + under[i] * (1 - a));
  const lum = ([x, y, z]) => [x, y, z].map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(top), lum(under)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

export const GROUND = `((el) => {
  const layers = [];
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor.match(/[\\d.]+/g).map(Number);
    const a = c.length > 3 ? c[3] : 1;
    if (a > 0) layers.push([c[0], c[1], c[2], a]);
    if (a === 1) break;
  }
  let rgb = [255, 255, 255];
  for (const [r, g, b, a] of layers.reverse()) rgb = [r, g, b].map((v, i) => v * a + rgb[i] * (1 - a));
  return 'rgb(' + rgb.map(Math.round).join(', ') + ')';
})`;

export const INK = `((el) => {
  const c = getComputedStyle(el).color.match(/[\\d.]+/g).map(Number);
  let a = c.length > 3 ? c[3] : 1;
  for (let e = el; e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity);
  return 'rgba(' + c.slice(0, 3).join(', ') + ', ' + a + ')';
})`;
