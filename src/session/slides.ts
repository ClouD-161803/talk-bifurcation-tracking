// the slides of a deck read from its text with the tokenizer, numbered as the status bar of the
// editor numbers them. a slide is a section without
// a section inside it. a slide at the top is numbered by its place in the show, where a hidden
// slide takes the place of the shown slide after it. a vertical slide of a stack is numbered as
// reveal.js counts it in the status bar, i.e. after every vertical slide and every slide at the top
// before it, leaving out the stacks themselves and the slides with data-visibility="uncounted",
// which the theme sets at run time on a title, section, or closing slide and on the appendix

import { classesOf, decodeAttr, tokenize, type Token } from '../editor/tokens.ts';

export type Slide = {
  // from the start of its start tag to the end of its end tag
  start: number;
  end: number;
  // the end of its start tag
  open: number;
  number: number;
};

const visibility = (t: Token): string => {
  if (t.type !== 'start') return '';
  const a = t.attrs.find((x) => x.name === 'data-visibility');
  return a?.value ? decodeAttr(a.value) : '';
};

type Section = { start: number; open: number; end: number; vis: string; classes: string[]; inner: Section[] };

export function slidesOf(text: string, tokens: Token[] = tokenize(text)): Slide[] {
  const tops: Section[] = [];
  const stack: Section[] = [];
  for (const t of tokens) {
    if (t.type === 'start' && t.name === 'section') {
      const s: Section = { start: t.start, open: t.end, end: text.length, vis: visibility(t), classes: classesOf(t), inner: [] };
      if (stack.length) stack[0].inner.push(s);
      else tops.push(s);
      if (!t.selfClosing) stack.push(s);
    } else if (t.type === 'end' && t.name === 'section' && stack.length) {
      stack.pop()!.end = t.end;
    }
  }
  const out: Slide[] = [];
  // the place in the show of the last shown slide at the top, where a stack counts once
  let place = 0;
  // the slides before, as reveal.js counts them for a vertical slide
  let past = 0;
  let appendix = false;
  for (const top of tops) {
    if (top.vis !== 'hidden') place++;
    const shown = top.vis === 'hidden' ? place + 1 : place;
    const uncounted = top.vis === 'uncounted' || (!top.vis && (appendix || top.classes.some((c) => c === 'title' || c === 'section' || c === 'closing')));
    if (!appendix && top.classes.includes('closing')) appendix = true;
    if (top.inner.length === 0) {
      out.push({ start: top.start, end: top.end, open: top.open, number: shown });
      if (!uncounted) past++;
      continue;
    }
    for (let i = 0; i < top.inner.length; i++) {
      const s = top.inner[i];
      const leaf = !top.inner.some((o, j) => j > i && o.start < s.end);
      if (leaf) out.push({ start: s.start, end: s.end, open: s.open, number: past + 1 });
      if (s.vis !== 'uncounted') past++;
    }
  }
  return out;
}
