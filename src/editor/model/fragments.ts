import { parseSource, type Source, type SrcEl } from '../source.ts';
import { pairElement, type Pairing } from '../render.ts';
import type { MathLookup } from '../math.ts';

const WRAPPERS: [Set<string>, string, string][] = [
  [new Set(['tr']), '<table><tbody class="slides">', '</tbody></table>'],
  [new Set(['td', 'th']), '<table><tbody><tr class="slides">', '</tr></tbody></table>'],
  [new Set(['thead', 'tbody', 'tfoot', 'caption', 'colgroup']), '<table class="slides">', '</table>'],
];
const DEFAULT: [string, string] = ['<div class="reveal"><div class="slides">', '</div></div>'];

export function rootTag(text: string): string | null {
  return /^(?:\s|<!--[\s\S]*?-->)*<([a-zA-Z][\w-]*)/.exec(text)?.[1].toLowerCase() ?? null;
}

export function parseFragment(text: string, crlf: boolean, home: Element | null): Source {
  const tag = rootTag(text);
  if (!tag) throw new Error('the new content does not start with an element');
  const wrapper = WRAPPERS.find(([tags]) => tags.has(tag));
  const [open, close] = wrapper ? [wrapper[1], wrapper[2]] : DEFAULT;
  const source = parseSource(open + text + close);
  source.crlf = crlf;
  source.fragment = { home };
  if (!fragmentRoot(source)) throw new Error(`the new ${tag} is not read as one element`);
  return source;
}

export function fragmentRoot(source: Source): SrcEl | null {
  return (source.slides.children.find((c) => c.kind === 'element') as SrcEl | undefined) ?? null;
}

const emptyPairing = (): Pairing => ({ texts: [], byLive: new Map(), elements: new Map(), inner: new Map(), sections: [], problems: [], root: null });

export function pairFragment(source: Source, live: Element, math: MathLookup): Pairing {
  const root = fragmentRoot(source);
  if (!root) throw new Error('the fragment does not have an element');
  const out = emptyPairing();
  pairElement(root, live, live.parentElement?.closest('section') ?? null, math, out);
  return out;
}

export function mergePairing(into: Pairing, from: Pairing): void {
  into.texts.push(...from.texts);
  for (const [k, v] of from.byLive) into.byLive.set(k, v);
  for (const [k, v] of from.elements) into.elements.set(k, v);
  for (const [k, v] of from.inner) into.inner.set(k, v);
  into.sections.push(...from.sections);
  into.sections.sort((a, b) => (a.live.compareDocumentPosition(b.live) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  into.problems.push(...from.problems);
}
