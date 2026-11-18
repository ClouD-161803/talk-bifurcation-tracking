// the TeX of an inline formula is shown in its text between its delimiters while the caret is in
// it, as in Obsidian. a click on the formula shows its TeX selected, and an arrow key at the
// formula puts the caret inside the TeX. the formula is typeset again once the selection has left
// the TeX or its text. the TeX is shown as the file has it, hence showing it does not change the
// deck, its history, or a session. a selection across a formula that is not shown draws the
// formula in the color of the selection, since a browser does not draw a selection over an SVG

import type { App } from '../app.ts';
import { mathIn, type MathLookup } from '../math.ts';
import { injectStyle } from '../ui/dom.ts';

const CSS = `
html.beeson-editing .reveal [contenteditable="true"] mjx-container.beeson-math-selected { background: Highlight; }
`;

// the text element whose TeX is shown, and the formulas drawn selected
let shownIn: HTMLElement | null = null;
let selected: Element[] = [];

// the text nodes and the formulas of host in order, each formula with the length of its TeX
// between its delimiters
function unitsOf(host: Element, lookup: MathLookup): { node: Node; length: number }[] {
  const out: { node: Node; length: number }[] = [];
  const walk = (parent: Node) => {
    for (const n of parent.childNodes) {
      if (n instanceof Text) out.push({ node: n, length: n.length });
      else if (n instanceof Element && n.localName === 'mjx-container') {
        const info = lookup(n);
        out.push({ node: n, length: info ? info.open.length + info.tex.length + info.close.length : 0 });
      } else walk(n);
    }
  };
  walk(host);
  return out;
}

const indexOf = (n: Node) => Array.prototype.indexOf.call(n.parentNode!.childNodes, n) as number;

// the offset of the point (node, offset) in the text of host as the file has it. a point inside a
// formula is before it
function texOffset(units: { node: Node; length: number }[], node: Node, offset: number): number {
  const point = document.createRange();
  point.setStart(node, offset);
  let n = 0;
  for (const u of units) {
    if (u.node === node) return n + offset;
    const end = u.node instanceof Text ? point.comparePoint(u.node, u.length) : point.comparePoint(u.node.parentNode!, indexOf(u.node) + 1);
    if (end > 0) return n;
    n += u.length;
  }
  return n;
}

// the point at the offset n in the text of host as the file has it. an offset inside a formula is
// put after it
function texPoint(host: Element, units: { node: Node; length: number }[], n: number): [Node, number] {
  let left = n;
  for (const u of units) {
    if (u.node instanceof Text) {
      if (left <= u.length) return [u.node, left];
    } else if (left === 0) return [u.node.parentNode!, indexOf(u.node)];
    else if (left < u.length) return [u.node.parentNode!, indexOf(u.node) + 1];
    left -= u.length;
  }
  return [host, host.childNodes.length];
}

// whether MathJax typesets TeX in the text node n, which it does not in code
const typesetIn = (n: Node) => !n.parentElement?.closest('code, pre, .mathjax_ignore');

// whether the point (node, offset) of host is in a TeX shown in its text, or at its edge
function inTex(host: Element, node: Node, offset: number): boolean {
  const units = unitsOf(host, () => null).filter((u) => u.node instanceof Text && typesetIn(u.node));
  const at = texOffset(units, node, offset);
  const text = units.map((u) => (u.node as Text).data).join('');
  const before = text.slice(0, at);
  const after = text.slice(at);
  return before.lastIndexOf('\\(') > before.lastIndexOf('\\)') || before.endsWith('\\)') || after.startsWith('\\(') || (before.endsWith('\\') && after.startsWith('('));
}

const isInline = (app: App, container: Element): HTMLElement | null => {
  const host = app.hostOf(container);
  if (!(host instanceof HTMLElement) || host.matches('div.math')) return null;
  const info = mathIn(host)(container);
  return info && !info.display ? host : null;
};

/**
 * Shows the TeX of the inline formula container in its text, with the TeX selected for 'all', or
 * the caret after the opening delimiter for 'start' and before the closing one for 'end'. The
 * result is false for a display formula and a formula that MathJax does not know, which are left
 * as they are.
 */
export function showTex(app: App, container: Element, place: 'all' | 'start' | 'end'): boolean {
  const mj = window.MathJax;
  const host = mj ? isInline(app, container) : null;
  const info = host && mathIn(host)(container);
  if (!mj || !host || !info) return false;
  if (shownIn && shownIn !== host) void typesetAgain(app, shownIn).catch((e) => app.fail(e));
  mj.startup.document.clearMathItemsWithin([container]);
  const text = document.createTextNode(info.open + info.tex + info.close);
  container.replaceWith(text);
  shownIn = host;
  host.focus({ preventScroll: true });
  const s = getSelection();
  if (place === 'all') s?.setBaseAndExtent(text, 0, text, text.length);
  else s?.collapse(text, place === 'start' ? info.open.length : text.length - info.close.length);
  app.invalidate('selection');
  return true;
}

// typesets the TeX shown in host again, with the selection kept at the same places of the text of
// the file. MathJax typesets at once unless it has to load a package for the TeX first, hence
// the caret is not moved back over the keys pressed meanwhile
async function typesetAgain(app: App, host: HTMLElement): Promise<void> {
  if (shownIn === host) shownIn = null;
  const mj = window.MathJax;
  if (!mj?.typesetPromise) return;
  const s = getSelection();
  const inside = () => !!s?.rangeCount && host.contains(s.anchorNode) && host.contains(s.focusNode);
  let ends: [number, number] | null = null;
  if (inside()) {
    const units = unitsOf(host, mathIn(host));
    ends = [texOffset(units, s!.anchorNode!, s!.anchorOffset), texOffset(units, s!.focusNode!, s!.focusOffset)];
  }
  try {
    if (!mj.typeset) throw new Error('MathJax does not typeset at once');
    mj.typeset([host]);
  } catch {
    await mj.typesetPromise([host]);
  }
  app.typing.markMath(host);
  app.invalidate('content');
  if (!ends || !inside()) return;
  const units = unitsOf(host, mathIn(host));
  s!.setBaseAndExtent(...texPoint(host, units, ends[0]), ...texPoint(host, units, ends[1]));
}

export function install(app: App): void {
  injectStyle('shown-tex', CSS);
  // the TeX shown is typeset again once neither end of the selection is in it, or once its text
  // has lost the focus, e.g. at Esc
  let back = false;
  document.addEventListener('keydown', (ev) => void (back = /^(ArrowLeft|ArrowUp|Home|PageUp)$/.test(ev.key)), true);
  const check = () => {
    const host = shownIn;
    if (!host) return;
    const s = getSelection();
    // a delimiter is one step of the caret, which is not left between its backslash and its
    // parenthesis
    const n = s?.isCollapsed ? s.focusNode : null;
    const o = s?.focusOffset ?? 0;
    if (n instanceof Text && host.contains(n) && typesetIn(n) && n.data[o - 1] === '\\' && /[()]/.test(n.data[o] ?? '')) s!.collapse(n, back ? o - 1 : o + 1);
    const held = host.isConnected && document.activeElement === host && !!s?.rangeCount && host.contains(s.anchorNode) && host.contains(s.focusNode) && (inTex(host, s.anchorNode!, s.anchorOffset) || inTex(host, s.focusNode!, s.focusOffset));
    if (!held) void typesetAgain(app, host).catch((e) => app.fail(e));
  };
  document.addEventListener('selectionchange', () => {
    check();
    for (const m of selected) m.classList.remove('beeson-math-selected');
    selected = [];
    const s = getSelection();
    if (!s?.rangeCount || s.isCollapsed) return;
    const r = s.getRangeAt(0);
    const root = r.commonAncestorContainer instanceof Element ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    if (!root || !app.hostOf(root)) return;
    selected = [...root.querySelectorAll('mjx-container')].filter((m) => r.intersectsNode(m));
    for (const m of selected) m.classList.add('beeson-math-selected');
  });
  document.addEventListener('focusout', () => setTimeout(check, 0));
  // Chrome holds back selectionchange while keys come in quick succession
  document.addEventListener('keyup', check);
  document.addEventListener('mouseup', check);
}
