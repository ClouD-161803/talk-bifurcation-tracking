import type { MathLookup } from '../math.ts';
import { charEdits, shared, type Edit } from '../merge.ts';

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

export function caretOf(host: Element, math: MathLookup, br = false): { offset: number; anchor: number; text: string } | null {
  const sel = getSelection();
  if (!sel?.rangeCount || !sel.focusNode || !host.contains(sel.focusNode)) return null;
  const points: [Node, number][] = [[sel.focusNode, sel.focusOffset]];
  if (sel.anchorNode && host.contains(sel.anchorNode)) points.push([sel.anchorNode, sel.anchorOffset]);
  const { text, offsets: [offset, anchor = offset] } = walk(host, math, points, br);
  return offset < 0 ? null : { offset, anchor: anchor < 0 ? offset : anchor, text };
}

export const textIn = (host: Element, math: MathLookup, br = false): string => walk(host, math, [], br).text;

const WORD = /^[\p{L}\p{M}\p{N}]+$/u;

export function runsOf(before: string, after: string): Edit[] {
  let runs = charEdits(before, after, 500);
  if (!runs) {
    const [head, tail] = shared(before, after);
    runs = [{ start: head, end: before.length - tail, text: after.slice(head, after.length - tail) }];
  }
  const letter = (i: number) => WORD.test(before.charAt(i));
  const out: Edit[] = [];
  runs.forEach((r, i) => {
    const p = out.at(-1);
    if (r.end === r.start || !WORD.test(before.slice(r.start, r.end)) || (r.text && !WORD.test(r.text))) return void out.push(r);
    let { start, end } = r;
    while (start > (p?.end ?? 0) && letter(start - 1)) start--;
    while (end < (runs[i + 1]?.start ?? before.length) && letter(end)) end++;
    const grown = { start, end, text: before.slice(start, r.start) + r.text + before.slice(r.end, end) };
    if (p && p.end === start && p.end > p.start && letter(start - 1)) out[out.length - 1] = { start: p.start, end, text: p.text + grown.text };
    else out.push(grown);
  });
  return out;
}

let last: { before: string; after: string; runs: Edit[] } | null = null;

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

export function putCaret(host: Element, focus: number, math: MathLookup, anchor = focus): void {
  const sel = getSelection();
  if (!sel) return;
  if (document.activeElement !== host && !host.contains(document.activeElement)) (host as HTMLElement).focus?.({ preventScroll: true });
  const [node, at] = pointIn(host, focus, math);
  if (anchor === focus) sel.collapse(node, at);
  else sel.setBaseAndExtent(...pointIn(host, anchor, math), node, at);
}

let acts = 0;
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => void (acts += 1), true);

export type Mark = { active: Element | null; acts: number };

export const markOf = (): Mark => ({ active: document.activeElement, acts });

export const moved = (mark: Mark): boolean => document.activeElement !== mark.active || acts !== mark.acts;
