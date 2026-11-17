// the caret of a text element kept through an apply that sets the content of the element or moves
// it. the caret is an offset into the text of the element, in which each formula counts as its TeX
// between its delimiters, as in the file, hence the offset is the same before and after MathJax

import type { MathLookup } from '../math.ts';

// the text of host up to each point, and the offset of the point (node, at) in it, or -1
function walk(host: Element, math: MathLookup, node: Node | null, at: number): { text: string; offset: number } {
  let text = '';
  let offset = -1;
  const visit = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n === node) offset = text.length + at;
      text += (n as Text).data;
      return;
    }
    if (!(n instanceof Element)) return;
    const info = n.localName === 'mjx-container' ? math(n) : null;
    if (info) {
      text += info.open + info.tex + info.close;
      if (node && n.contains(node)) offset = text.length;
      return;
    }
    n.childNodes.forEach((c, i) => {
      if (n === node && i === at) offset = text.length;
      visit(c);
    });
    if (n === node && at >= n.childNodes.length) offset = text.length;
  };
  visit(host);
  return { text, offset };
}

// the caret of the selection in host, with the text of host, or null when it is not in host
export function caretOf(host: Element, math: MathLookup): { offset: number; text: string } | null {
  const sel = getSelection();
  if (!sel?.rangeCount || !sel.focusNode || !host.contains(sel.focusNode)) return null;
  const { text, offset } = walk(host, math, sel.focusNode, sel.focusOffset);
  return offset < 0 ? null : { offset, text };
}

export const textIn = (host: Element, math: MathLookup): string => walk(host, math, null, 0).text;

// the offset of the caret moved with a change of before into after: kept before the change, moved
// by its length after it, and put at its end inside it
export function mapOffset(offset: number, before: string, after: string): number {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  if (offset <= head) return offset;
  if (offset >= before.length - tail) return offset + after.length - before.length;
  return after.length - tail;
}

// the caret put at offset into the text of host, after a formula that the offset falls inside
export function putCaret(host: Element, offset: number, math: MathLookup): void {
  const sel = getSelection();
  if (!sel) return;
  let left = offset;
  let spot = null as [Node, number] | null;
  const visit = (n: Node): boolean => {
    if (n.nodeType === Node.TEXT_NODE) {
      const length = (n as Text).length;
      if (left <= length) {
        spot = [n, left];
        return true;
      }
      left -= length;
      return false;
    }
    if (!(n instanceof Element)) return false;
    const info = n.localName === 'mjx-container' ? math(n) : null;
    if (info) {
      const length = info.open.length + info.tex.length + info.close.length;
      if (left < length) {
        const parent = n.parentNode!;
        spot = [parent, [...parent.childNodes].indexOf(n as ChildNode) + 1];
        return true;
      }
      left -= length;
      return false;
    }
    for (const c of n.childNodes) if (visit(c)) return true;
    return false;
  };
  visit(host);
  if (document.activeElement !== host && !host.contains(document.activeElement)) (host as HTMLElement).focus?.({ preventScroll: true });
  const [node, at] = spot ?? [host, host.childNodes.length];
  sel.collapse(node, at);
}

// the presses and keys of the person, which tell a caret moved by the person from a caret moved by
// MathJax, whose nodes the selection follows
let acts = 0;
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => void (acts += 1), true);

export type Mark = { active: Element | null; acts: number };

export const markOf = (): Mark => ({ active: document.activeElement, acts });

// whether the person moved the caret since mark, i.e. focused another element, pressed, or typed
export const moved = (mark: Mark): boolean => document.activeElement !== mark.active || acts !== mark.acts;
