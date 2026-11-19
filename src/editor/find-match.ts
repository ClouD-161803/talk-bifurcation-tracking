export type FindOptions = { matchCase: boolean; wholeWords: boolean; tex: boolean };

export type Span = { start: number; end: number };

const WORD = '[\\p{L}\\p{N}_]';

export function pattern(query: string, options: Pick<FindOptions, 'matchCase' | 'wholeWords'>): RegExp | null {
  if (!query) return null;
  const body = query
    .split(/\s+/u)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'))
    .join('\\s+');
  const source = options.wholeWords ? `(?<!${WORD})(?:${body})(?!${WORD})` : body;
  return new RegExp(source, `gu${options.matchCase ? '' : 'i'}`);
}

export function spans(text: string, re: RegExp | null): Span[] {
  if (!re) return [];
  const out: Span[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0].length) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function splice(text: string, from: number, list: Span[], replacement: string): string {
  let out = '';
  let at = 0;
  for (const s of list) {
    const a = Math.max(s.start - from, 0);
    const b = Math.min(s.end - from, text.length);
    if (b < 0 || a > text.length) continue;
    out += text.slice(at, a);
    if (s.start >= from) out += replacement;
    at = Math.max(at, b);
  }
  return out + text.slice(at);
}
