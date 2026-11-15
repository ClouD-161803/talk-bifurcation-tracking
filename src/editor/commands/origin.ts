// the origin of a copy of slides or elements, written in a comment after the mark of
// commands/slide.ts: the address of the deck, the version of its theme, and the macros of the deck
// that the copied text uses. an editor without this comment skips it, as it skips any comment

import { deckMacros } from '../math.ts';
import { MARK } from './slide.ts';

export type OriginMacro = { name: string; body: string; args: number };
export type Origin = { deck: string; version: string; macros: OriginMacro[] };

const OPEN = '<!--beeson-origin ';

// the address of this deck, without its query and its slide
export const deckAddress = (): string => location.href.split(/[?#]/)[0];

// the macros of the deck that text uses, with the macros that their bodies use
function usedMacros(text: string): OriginMacro[] {
  const all = new Map(deckMacros().map((m) => [m.name, m]));
  const out = new Map<string, OriginMacro>();
  const scan = (t: string) => {
    for (const [, name] of t.matchAll(/\\([a-zA-Z]+)/g)) {
      const m = all.get(name);
      if (!m || out.has(name)) continue;
      out.set(name, { name, body: m.body, args: m.args });
      scan(m.body);
    }
  };
  scan(text);
  return [...out.values()];
}

// the comment of the origin of the copied text. a dash and an angle bracket are written as escapes
// of JSON, hence a URL or a macro does not close the comment early
export function originComment(text: string): string {
  const version = (window as unknown as { Beeson?: { version?: string } }).Beeson?.version ?? '';
  const json = JSON.stringify({ deck: deckAddress(), version, macros: usedMacros(text) } satisfies Origin);
  return `${OPEN}${json.replace(/[-<>]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}-->`;
}

// the origin of a text of the clipboard, or null for a text without it, e.g. of an older editor
export function originOf(text: string): Origin | null {
  const at = text.indexOf(MARK);
  if (at < 0) return null;
  const rest = text.slice(at + MARK.length).trimStart();
  const end = rest.indexOf('-->');
  if (!rest.startsWith(OPEN) || end < 0) return null;
  try {
    const o = JSON.parse(rest.slice(OPEN.length, end)) as Origin;
    return typeof o.deck === 'string' && typeof o.version === 'string' && Array.isArray(o.macros) ? o : null;
  } catch {
    return null;
  }
}
