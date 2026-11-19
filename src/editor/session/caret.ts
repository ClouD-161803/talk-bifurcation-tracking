// the caret of a text element kept through an apply that sets the content of the element or moves
// it. the caret is an offset into the text of the element, in which each formula counts as its TeX
// between its delimiters, as in the file, hence the offset is the same before and after MathJax

import type { MathLookup } from '../math.ts';
import { charEdits, shared, type Edit } from '../merge.ts';

// the text of host, and the offset in it of each point (node, at), or -1. with br, a <br> counts as
// one character
function walk(host: Element, math: MathLookup, points: readonly [Node, number][], br = false): { text: string; offsets: number[] } {
  let text = '';
  const offsets = points.map(() => -1);
  const visit = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      points.forEach(([node, at], i) => {
        if (n === node) offsets[i] = text.length + at;
      });
      text += (n as Text).data;
      return;
    }
    if (!(n instanceof Element)) return;
    if (br && n.localName === 'br') {
      text += '\n';
      return;
    }
    const info = n.localName === 'mjx-container' ? math(n) : null;
    if (info) {
      text += info.open + info.tex + info.close;
      points.forEach(([node], i) => {
        if (n.contains(node)) offsets[i] = text.length;
      });
      return;
    }
    n.childNodes.forEach((c, j) => {
      points.forEach(([node, at], i) => {
        if (n === node && j === at) offsets[i] = text.length;
      });
      visit(c);
    });
    points.forEach(([node, at], i) => {
      if (n === node && at >= n.childNodes.length) offsets[i] = text.length;
    });
  };
  visit(host);
  return { text, offsets };
}

// the focus and the anchor of the selection in host, with the text of host, or null when the focus
// is not in host. the anchor is the focus when it lies outside host
export function caretOf(host: Element, math: MathLookup, br = false): { offset: number; anchor: number; text: string } | null {
  const sel = getSelection();
  if (!sel?.rangeCount || !sel.focusNode || !host.contains(sel.focusNode)) return null;
  const points: [Node, number][] = [[sel.focusNode, sel.focusOffset]];
  if (sel.anchorNode && host.contains(sel.anchorNode)) points.push([sel.anchorNode, sel.anchorOffset]);
  const { text, offsets: [offset, anchor = offset] } = walk(host, math, points, br);
  return offset < 0 ? null : { offset, anchor: anchor < 0 ? offset : anchor, text };
}

export const textIn = (host: Element, math: MathLookup, br = false): string => walk(host, math, [], br).text;

// letters, marks, and digits, which make up a word
const WORD = /^[\p{L}\p{M}\p{N}]+$/u;

// the runs of changed characters that turn before into after, one run from the first changed
// character to the last when more than 500 units differ. a run that takes letters out of a word and
// puts only letters in grows to the whole word, and runs in one word become one, hence a caret in a
// word that another person replaces goes to the end of the new word, e.g. after cha in chart to the
// end of graph. an insertion alone keeps its run
export function runsOf(before: string, after: string): Edit[] {
  let runs = charEdits(before, after, 500);
  if (!runs) {
    const [head, tail] = shared(before, after);
    runs = [{ start: head, end: before.length - tail, text: after.slice(head, after.length - tail) }];
  }
  // an insertion that ends with a space after a space starts with this space instead, as the merge
  // reads it, hence a caret after the space goes after a word that another person put in there
  runs = runs.map((r, i) => {
    const c = before.charAt(r.start - 1);
    if (r.start !== r.end || !/[ \u00a0]/.test(c) || !r.text.endsWith(c) || /^\s/.test(r.text) || runs![i - 1]?.end === r.start) return r;
    return { start: r.start - 1, end: r.start - 1, text: c + r.text.slice(0, -1) };
  });
  const letter = (i: number) => WORD.test(before.charAt(i));
  const out: Edit[] = [];
  runs.forEach((r, i) => {
    const p = out.at(-1);
    // letters put in further in a word that a run before replaces belong to the new word
    const gap = p ? before.slice(p.end, r.start) : '';
    let end = r.end;
    while (end < (runs[i + 1]?.start ?? before.length) && letter(end)) end++;
    if (r.end === r.start && p && p.end > p.start && letter(r.start - 1) && WORD.test(before.slice(p.start, p.end) + p.text + gap + r.text)) return void (out[out.length - 1] = { start: p.start, end, text: p.text + gap + r.text + before.slice(r.end, end) });
    if (r.end === r.start || !WORD.test(before.slice(r.start, r.end)) || (r.text && !WORD.test(r.text))) return void out.push(r);
    let { start } = r;
    while (start > (p?.end ?? 0) && letter(start - 1)) start--;
    const grown = { start, end, text: before.slice(start, r.start) + r.text + before.slice(r.end, end) };
    if (p && p.end === start && p.end > p.start && letter(start - 1)) out[out.length - 1] = { start: p.start, end, text: p.text + grown.text };
    else out.push(grown);
  });
  return out;
}

let last: { before: string; after: string; runs: Edit[] } | null = null;

// the offset of the caret moved with a change of before into after: kept before each run of
// runsOf(), moved by its length after it, and put at its end inside it. the runs of the last pair of
// texts are kept, since both ends of a selection are moved with one change
export function mapOffset(offset: number, before: string, after: string): number {
  if (last?.before !== before || last.after !== after) last = { before, after, runs: runsOf(before, after) };
  let shift = 0;
  for (const run of last.runs) {
    if (offset <= run.start) break;
    if (offset < run.end) return run.start + shift + run.text.length;
    shift += run.text.length - (run.end - run.start);
  }
  return offset + shift;
}

// the point at offset into the text of host, after a formula that the offset falls inside, and at
// the end of host past its text. with br, a <br> counts as one character
export function pointIn(host: Element, offset: number, math: MathLookup, br = false): [Node, number] {
  let left = Math.max(0, offset);
  let spot: [Node, number] | null = null;
  const after = (n: Node, k: number): [Node, number] => [n.parentNode!, [...n.parentNode!.childNodes].indexOf(n as ChildNode) + k];
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
    if (br && n.localName === 'br') {
      if (left === 0) {
        spot = after(n, 0);
        return true;
      }
      left--;
      return false;
    }
    const info = n.localName === 'mjx-container' ? math(n) : null;
    if (info) {
      const length = info.open.length + info.tex.length + info.close.length;
      if (left < length) {
        spot = after(n, 1);
        return true;
      }
      left -= length;
      return false;
    }
    for (const c of n.childNodes) if (visit(c)) return true;
    return false;
  };
  visit(host);
  return spot ?? [host, host.childNodes.length];
}

// the caret put at focus into the text of host, with the selection from anchor when it differs
export function putCaret(host: Element, focus: number, math: MathLookup, anchor = focus): void {
  const sel = getSelection();
  if (!sel) return;
  if (document.activeElement !== host && !host.contains(document.activeElement)) (host as HTMLElement).focus?.({ preventScroll: true });
  const [node, at] = pointIn(host, focus, math);
  if (anchor === focus) sel.collapse(node, at);
  else sel.setBaseAndExtent(...pointIn(host, anchor, math), node, at);
}

// the presses and keys of the person, which tell a caret moved by the person from a caret moved by
// MathJax, whose nodes the selection follows
let acts = 0;
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => void (acts += 1), true);

export type Mark = { active: Element | null; acts: number };

export const markOf = (): Mark => ({ active: document.activeElement, acts });

// whether the person moved the caret since mark, i.e. focused another element, pressed, or typed
export const moved = (mark: Mark): boolean => document.activeElement !== mark.active || acts !== mark.acts;
