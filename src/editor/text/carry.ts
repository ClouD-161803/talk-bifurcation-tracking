import type { App } from '../app.ts';
import * as textElements from './elements.ts';
import { FORMATS, around, inlineTargets, isTone, setTone, toggle, type FormatName, type Tone } from './inline.ts';

type Caret = { host: Element; node: Node; offset: number; pending: boolean };
type Carry = Caret & { formats: Partial<Record<FormatName, boolean>>; tone?: Tone | null; style?: textElements.ParagraphStyle; list?: textElements.ListKind; small?: boolean; nbsp?: boolean };

const SMALL_CODE = '18px';
let carry: Carry | null = null;

function caretOf(app: App): Caret | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed || !sel.anchorNode) return null;
  const node = sel.anchorNode;
  const el = node instanceof Element ? node : node.parentElement;
  if (!el || el.closest('mjx-container')) return null;
  const pending = el.closest('.beeson-pending[contenteditable="true"]');
  if (pending) return { host: pending, node, offset: sel.anchorOffset, pending: true };
  const host = app.hostOf(el);
  return host ? { host, node, offset: sel.anchorOffset, pending: false } : null;
}

const kindOf = (c: Caret): 'code' | 'foot' | 'text' => (c.host.closest('pre') ? 'code' : c.host.matches('.foot') ? 'foot' : 'text');

function current(app: App): Carry | null {
  const c = caretOf(app);
  if (!c || !carry || carry.host !== c.host || carry.node !== c.node || carry.offset !== c.offset) return null;
  return carry;
}

function ensure(app: App): Carry {
  const now = current(app);
  if (now) return now;
  carry = { ...(caretOf(app) as Caret), formats: {} };
  return carry;
}

function changed(app: App): void {
  app.invalidate('selection');
}

export function canFormat(app: App, notes = false): boolean {
  const c = caretOf(app);
  if (!c || kindOf(c) === 'code' || (!notes && c.host.matches('aside.notes'))) return false;
  return c.pending || inlineTargets(app, notes).length === 0;
}

export function formatOn(app: App, name: FormatName): boolean {
  const kept = current(app)?.formats[name];
  if (kept !== undefined) return kept;
  const c = caretOf(app);
  return !!c && !c.pending && !!around(c.host, c.node, FORMATS[name].match);
}

export function toggleFormat(app: App, name: FormatName): void {
  const on = !formatOn(app, name);
  const k = ensure(app);
  k.formats[name] = on;
  if (on && name === 'superscript') k.formats.subscript = false;
  if (on && name === 'subscript') k.formats.superscript = false;
  changed(app);
}

export function toneOf(app: App): Tone | null {
  const kept = current(app)?.tone;
  if (kept !== undefined) return kept;
  const c = caretOf(app);
  const span = c && !c.pending ? around(c.host, c.node, isTone) : null;
  return span ? (span.classList[0].slice(5) as Tone) : null;
}

export function chooseTone(app: App, tone: Tone | null): void {
  ensure(app).tone = tone;
  changed(app);
}

const pendingText = (app: App): Caret | null => {
  const c = caretOf(app);
  return c?.pending && kindOf(c) !== 'code' ? c : null;
};

export const canStyle = (app: App): boolean => pendingText(app) !== null;

export function styleOf(app: App): textElements.ParagraphStyle | null {
  const c = pendingText(app);
  if (!c) return null;
  return current(app)?.style ?? (kindOf(c) === 'foot' ? 'footnote' : 'body');
}

export function chooseStyle(app: App, style: textElements.ParagraphStyle | ((s: textElements.ParagraphStyle) => textElements.ParagraphStyle)): void {
  const now = styleOf(app);
  if (!now) return;
  ensure(app).style = typeof style === 'function' ? style(now) : style;
  changed(app);
}

export const canStep = (app: App, up: boolean): boolean => {
  const s = styleOf(app);
  return s !== null && textElements.stepped(s, up) !== s;
};

export const canList = (app: App): boolean => {
  const c = pendingText(app);
  return !!c && kindOf(c) === 'text';
};

export const listOf = (app: App): textElements.ListKind | null => (canList(app) ? (current(app)?.list ?? 'none') : null);

export function chooseList(app: App, kind: textElements.ListKind): void {
  ensure(app).list = kind;
  changed(app);
}

function codeBox(app: App): { pre: Element | null; small: boolean } | null {
  const c = caretOf(app);
  if (c && kindOf(c) === 'code') {
    const pre = c.host.closest('pre')!;
    if (c.pending) return { pre: null, small: !!current(app)?.small };
    return { pre, small: (pre as HTMLElement).style.fontSize === SMALL_CODE };
  }
  const el = app.selection.kind === 'elements' ? app.selection.only() : null;
  if (el?.localName === 'pre' && el.querySelector(':scope > code') && app.pairing?.elements.has(el)) return { pre: el, small: (el as HTMLElement).style.fontSize === SMALL_CODE };
  return null;
}

export const canSizeCode = (app: App, up: boolean): boolean => {
  const box = codeBox(app);
  return !!box && box.small === up;
};

export function sizeCode(app: App, up: boolean): void {
  const box = codeBox(app);
  if (!box || box.small !== up) return;
  if (!box.pre) {
    ensure(app).small = !up;
    changed(app);
    return;
  }
  app.doc.setTag(box.pre, { style: { 'font-size': up ? null : SMALL_CODE } }, up ? 'Bigger' : 'Smaller');
  app.markDirty();
  app.invalidate('content');
}

function caretAtLastText(): void {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  const root = range.commonAncestorContainer;
  let last: Text | null = root instanceof Text ? root : null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) if (range.intersectsNode(n) && !n.parentElement?.closest('mjx-container')) last = n;
  if (last) sel.collapse(last, last === range.endContainer ? range.endOffset : last.length);
  else sel.collapseToEnd();
}

function ending(k: Carry): Element | null {
  const off = (Object.keys(k.formats) as FormatName[]).filter((name) => k.formats[name] === false);
  let out: Element | null = null;
  for (let el = k.node instanceof Element ? k.node : k.node.parentElement; el && el !== k.host && k.host.contains(el); el = el.parentElement) {
    if (!off.some((name) => FORMATS[name].match(el))) continue;
    const rest = document.createRange();
    rest.setStart(k.node, k.offset);
    rest.setEnd(el, el.childNodes.length);
    if (!rest.toString()) out = el;
  }
  return out;
}

function firstText(): Text | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const root = range.commonAncestorContainer;
  if (root instanceof Text) return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) if (range.intersectsNode(n) && n.data && !n.parentElement?.closest('mjx-container')) return n;
  return null;
}

function formatSelection(app: App, k: Carry): void {
  const has = (match: (el: Element) => boolean): boolean | null => {
    const text = firstText();
    const host = text ? app.hostOf(text.parentElement) : null;
    return host && text ? !!around(host, text, match) : null;
  };
  if (k.tone !== undefined) {
    const text = firstText();
    const host = text ? app.hostOf(text.parentElement) : null;
    const span = host && text ? around(host, text, isTone) : null;
    if ((span ? span.classList[0].slice(5) : null) !== k.tone) setTone(app, k.tone);
  }
  for (const name of ['code', 'subscript', 'superscript', 'strike', 'underline', 'italic', 'bold'] as const) {
    const want = k.formats[name];
    const now = want === undefined ? null : has(FORMATS[name].match);
    if (now !== null && now !== want) toggle(app, name);
  }
}

export async function applyPending(app: App, from: Element, to: Element): Promise<void> {
  const k = carry && carry.host === from ? carry : null;
  carry = null;
  if (!k) return;
  if (to.localName === 'pre') {
    if (k.small) app.doc.setTag(to, { style: { 'font-size': SMALL_CODE } }, 'Smaller');
    return;
  }
  const selectAll = (el: Element) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(r);
  };
  selectAll(to);
  if (k.list && k.list !== 'none') await textElements.setList(app, k.list);
  if (k.style && textElements.paragraphStyle(app) !== k.style && textElements.canStyle(app)) await textElements.setStyle(app, k.style);
  const anchor = window.getSelection()?.anchorNode;
  const host = anchor ? app.hostOf(anchor instanceof Element ? anchor : anchor.parentElement) : null;
  if (!host) return;
  selectAll(host);
  formatSelection(app, k);
  caretAtLastText();
}

export function install(app: App): void {
  let follow: Carry | null = null;
  document.addEventListener('beforeinput', (ev) => {
    follow = null;
    if (ev.inputType !== 'insertText' || !ev.data || ev.defaultPrevented) return;
    const k = current(app);
    if (!k || k.pending) return;
    if (!ev.data.trim()) {
      const out = ending(k);
      if (!out) {
        follow = k;
        return;
      }
      ev.preventDefault();
      app.history.beforeTyping(k.host);
      const next = out.nextSibling;
      const drawn = next instanceof Text ? /^\S/.test(next.data) : !!next;
      const text = document.createTextNode(drawn ? ev.data : ev.data.replace(/ $/, '\u00a0'));
      out.after(text);
      const sel = window.getSelection()!;
      sel.collapse(text, text.length);
      k.host.normalize();
      app.history.afterTyping(k.host);
      app.markDirty();
      app.invalidate('content');
      carry = { ...k, node: text, offset: sel.anchorOffset, nbsp: !drawn };
      return;
    }
    ev.preventDefault();
    carry = null;
    const host = k.host;
    app.history.beforeTyping(host);
    const sel = window.getSelection()!;
    if (k.nbsp && k.node instanceof Text && k.node.data[k.offset - 1] === '\u00a0') {
      k.node.replaceData(k.offset - 1, 1, ' ');
      sel.collapse(k.node, k.offset);
    }
    const range = sel.getRangeAt(0);
    const text = document.createTextNode(ev.data);
    range.insertNode(text);
    const r = document.createRange();
    r.selectNodeContents(text);
    sel.removeAllRanges();
    sel.addRange(r);
    formatSelection(app, k);
    caretAtLastText();
    host.normalize();
    app.history.afterTyping(host);
    app.markDirty();
    app.invalidate('content');
  }, true);
  document.addEventListener('input', () => {
    const k = follow;
    follow = null;
    const c = k ? caretOf(app) : null;
    if (k && c && c.host === k.host) carry = { ...k, node: c.node, offset: c.offset };
  });
}
