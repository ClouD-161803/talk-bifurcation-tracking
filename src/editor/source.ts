import { RAW_TEXT, classesOf, tokenize, type Attr, type Range, type Token } from './tokens.ts';

export type Segment = { raw: Range; dec: Range; literal: boolean };

export type Piece = { kind: 'text'; dec: Range } | { kind: 'math'; dec: Range; inner: Range };

export type SrcText = {
  kind: 'text';
  node: Text;
  range: Range;
  lead: number;
  decoded: string;
  segments: Segment[];
  pieces: Piece[] | null;
};
export type SrcComment = { kind: 'comment'; node: Comment; range: Range };
export type SrcEl = {
  kind: 'element';
  node: Element;
  tag: string;
  open: Range | null;
  attrs: Attr[];
  close: Range | null;
  children: SrcNode[];
  parent: SrcEl | null;
  source: Source;
};
export type SrcNode = SrcText | SrcComment | SrcEl;

export type Source = { text: string; crlf: boolean; doc: Document; slides: SrcEl; fragment?: { home: Element | null } };

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const PRE_LIKE = new Set(['pre', 'textarea', 'listing']);

let box: HTMLTextAreaElement | null = null;

export function decode(raw: string): string {
  box ??= document.createElement('textarea');
  box.innerHTML = `.${raw}`;
  return box.value.slice(1);
}

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s).replace(/\n/g, '\\n');

export function parseSource(text: string): Source {
  const tokens = tokenize(text);
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const slides = doc.querySelector('.reveal .slides') ?? doc.querySelector('.slides');
  if (!slides) throw new Error('the file does not have a div.slides element');
  const index = [...doc.querySelectorAll(`${slides.localName}.slides`)].indexOf(slides);
  let seen = -1, at = -1;
  tokens.forEach((t, i) => {
    if (t.type === 'start' && t.name === slides.localName && classesOf(t).includes('slides')) {
      seen += 1;
      if (seen === index) at = i;
    }
  });
  if (at < 0) throw new Error('the start tag of div.slides was not found in the file');
  const source = { text, crlf: text.includes('\r\n'), doc } as Source;
  const root: SrcEl = { kind: 'element', node: slides, tag: slides.localName, open: tokens[at], attrs: [], close: null, children: [], parent: null, source };
  source.slides = root;
  const cursor = { i: at + 1 };
  walkChildren(slides, root, cursor, tokens, text);
  const end = tokens[cursor.i];
  if (end?.type === 'end' && end.name === root.tag) root.close = end;
  return source;
}

function fail(text: string, at: number, what: string): never {
  const line = text.slice(0, at).split('\n').length;
  throw new Error(`the file could not be matched to the page at line ${line}: ${what}`);
}

function walkChildren(el: Element, out: SrcEl, cursor: { i: number }, tokens: Token[], text: string): void {
  const raw = RAW_TEXT.has(el.localName);
  for (const child of el.childNodes) {
    while (tokens[cursor.i]?.type === 'other' && child.nodeType !== Node.COMMENT_NODE) cursor.i += 1;
    const token = tokens[cursor.i];
    if (child.nodeType === Node.ELEMENT_NODE) {
      const e = child as Element;
      const tag = e.localName;
      let open: Range | null = null;
      let attrs: Attr[] = [];
      if (token?.type === 'start' && token.name === tag.toLowerCase()) {
        open = token;
        attrs = token.attrs;
        cursor.i += 1;
      }
      const node: SrcEl = { kind: 'element', node: e, tag, open, attrs, close: null, children: [], parent: out, source: out.source };
      out.children.push(node);
      walkChildren(e, node, cursor, tokens, text);
      const after = tokens[cursor.i];
      if (after?.type === 'end' && after.name === tag.toLowerCase()) {
        node.close = after;
        cursor.i += 1;
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      const data = (child as Text).data;
      if (token?.type !== 'text') fail(text, token?.start ?? text.length, `the text "${short(data)}" is not in the file`);
      const rawText = text.slice(token.start, token.end);
      const decoded = raw || token.raw ? rawText.replace(/\r\n?/g, '\n') : decode(rawText);
      let lead = 0;
      if (decoded !== data) {
        const stripped = PRE_LIKE.has(el.localName) && decoded.startsWith('\n') && decoded.slice(1) === data;
        if (!stripped) fail(text, token.start, `the text "${short(data)}" reads "${short(decoded)}" in the file`);
        lead = rawText.startsWith('\r\n') ? 2 : 1;
      }
      cursor.i += 1;
      const start = token.start + lead;
      out.children.push({
        kind: 'text',
        node: child as Text,
        range: { start: token.start, end: token.end },
        lead,
        decoded: data,
        segments: segmentsOf(text.slice(start, token.end), start, raw || token.raw, data),
        pieces: null,
      });
    } else if (child.nodeType === Node.COMMENT_NODE) {
      if (token?.type !== 'comment' && token?.type !== 'other') fail(text, token?.start ?? text.length, 'a comment is not in the file');
      cursor.i += 1;
      out.children.push({ kind: 'comment', node: child as Comment, range: token });
    }
  }
}

const REFERENCE = /&(?:#[xX][0-9a-fA-F]+;?|#[0-9]+;?|[A-Za-z][A-Za-z0-9]*;?)/y;

export function segmentsOf(raw: string, base: number, isRaw: boolean, decoded: string): Segment[] {
  const out: Segment[] = [];
  const whole: Segment[] = [{ raw: { start: base, end: base + raw.length }, dec: { start: 0, end: decoded.length }, literal: false }];
  let i = 0, d = 0, literalStart = -1;
  const parts: string[] = [];
  const flush = (to: number) => {
    if (literalStart >= 0 && to > literalStart) {
      out.push({ raw: { start: base + literalStart, end: base + to }, dec: { start: d, end: d + to - literalStart }, literal: true });
      parts.push(raw.slice(literalStart, to));
      d += to - literalStart;
    }
    literalStart = -1;
  };
  while (i < raw.length) {
    const c = raw[i];
    if (c === '\r') {
      flush(i);
      const length = raw[i + 1] === '\n' ? 2 : 1;
      out.push({ raw: { start: base + i, end: base + i + length }, dec: { start: d, end: d + 1 }, literal: false });
      parts.push('\n');
      d += 1;
      i += length;
      continue;
    }
    if (c === '&' && !isRaw) {
      REFERENCE.lastIndex = i;
      const m = REFERENCE.exec(raw);
      const value = m ? decode(m[0]) : null;
      if (m && value !== null && value !== m[0]) {
        flush(i);
        out.push({ raw: { start: base + i, end: base + i + m[0].length }, dec: { start: d, end: d + value.length }, literal: false });
        parts.push(value);
        d += value.length;
        i += m[0].length;
        continue;
      }
    }
    if (literalStart < 0) literalStart = i;
    i += 1;
  }
  flush(i);
  return parts.join('') === decoded ? out : whole;
}

export function rawRange(s: SrcText, dec: Range): Range {
  const at = (pos: number, isEnd: boolean): number => {
    for (const seg of s.segments) {
      if (pos < seg.dec.start || pos > seg.dec.end) continue;
      if (seg.literal) return seg.raw.start + (pos - seg.dec.start);
      if (pos === seg.dec.start) return seg.raw.start;
      if (pos === seg.dec.end) return seg.raw.end;
      return isEnd ? seg.raw.end : seg.raw.start;
    }
    return pos <= 0 ? s.range.start + s.lead : s.range.end;
  };
  return { start: at(dec.start, false), end: at(dec.end, true) };
}

export function elementRange(s: SrcEl): Range | null {
  const start = s.open?.start ?? firstStart(s);
  const end = s.close?.end ?? lastEnd(s);
  return start === null || end < start ? null : { start, end };
}

export function contentRange(s: SrcEl): Range | null {
  const start = s.open ? s.open.end : firstStart(s);
  if (start === null) return null;
  return { start, end: s.close ? s.close.start : Math.max(start, lastEnd(s)) };
}

function firstStart(s: SrcEl): number | null {
  for (const c of s.children) {
    if (c.kind !== 'element') return c.range.start;
    const r = elementRange(c);
    if (r) return r.start;
  }
  return null;
}

export function lastEnd(s: SrcEl): number {
  const last = s.children[s.children.length - 1];
  if (!last) return s.open?.end ?? -1;
  if (last.kind === 'element') return last.close ? last.close.end : lastEnd(last);
  return last.range.end;
}

export const isFragmentRoot = (s: SrcEl): boolean => !!s.source.fragment && s.parent === s.source.slides;
