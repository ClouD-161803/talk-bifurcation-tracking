// the origin of a copy of slides or elements, written in a comment after the mark of
// commands/slide.ts: the address of the deck, the version of its theme, and the macros of the deck
// that the copied text uses. an editor without this comment skips it, as it skips any comment.
// a paste of a text from another deck runs the steps of arrive()

import type { App } from '../app.ts';
import { deckMacros } from '../math.ts';
import { carryFiles } from '../media/carry.ts';
import { nameMacros } from './macros.ts';
import { MARK } from './slide.ts';

export type OriginMacro = { name: string; body: string; args: number; default?: string };
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
      out.set(name, { name, body: m.body, args: m.args, default: m.default });
      scan(m.body);
    }
  };
  scan(text);
  return [...out.values()];
}

const themeVersion = (): string => (window as unknown as { Beeson?: { version?: string } }).Beeson?.version ?? '';

// the comment of the origin of the copied text. a dash and an angle bracket are written as escapes
// of JSON, hence a URL or a macro does not close the comment early
export function originComment(text: string): string {
  const json = JSON.stringify({ deck: deckAddress(), version: themeVersion(), macros: usedMacros(text) } satisfies Origin);
  return `${OPEN}${json.replace(/[-<>]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}-->`;
}

// the origin of a text of the clipboard, or null for a text without it, e.g. of an older editor.
// any page can write the clipboard, hence a deck that is not an address of http, https, or file
// gives null, and a macro that theme/macros.js would not read as one is dropped
export function originOf(text: string): Origin | null {
  const at = text.indexOf(MARK);
  if (at < 0) return null;
  const rest = text.slice(at + MARK.length).trimStart();
  const end = rest.indexOf('-->');
  if (!rest.startsWith(OPEN) || end < 0) return null;
  try {
    const o = JSON.parse(rest.slice(OPEN.length, end));
    if (!/^(https?|file):$/.test(new URL(o.deck).protocol)) return null;
    const macros = (Array.isArray(o.macros) ? o.macros : []).filter(
      (m: OriginMacro | null) => typeof m?.name === 'string' && /^[a-zA-Z]+$/.test(m.name) && typeof m.body === 'string' && Number.isInteger(m.args) && m.args >= 0 && m.args <= 9 && ['undefined', 'string'].includes(typeof m.default),
    );
    const version = typeof o.version === 'string' && /^[\w.+-]{0,40}$/.test(o.version) ? o.version : '';
    return { deck: o.deck, version, macros: macros.map(({ name, body, args, default: d }: OriginMacro) => ({ name, body, args, default: d })) };
  } catch {
    return null;
  }
}

// a paste from another deck: its origin, the texts of its slides or elements, which a step before
// the insert may rewrite, and the sentences that the editor shows in one note after the paste
export type Arrival = { origin: Origin; texts: string[]; notes: string[] };
export type Step = (app: App, arrival: Arrival) => void | Promise<void>;

// the step that names a theme of another version, which may draw a slide otherwise
function nameTheme(_app: App, arrival: Arrival): void {
  const [there, here] = [arrival.origin.version, themeVersion()];
  if (there && here && there !== here) arrival.notes.push(`The deck you pasted from has theme version ${there}, and this deck version ${here}, hence what you pasted may be drawn differently.`);
}

// the steps of a paste from another deck, run in this order before and after its insert, in the
// entry of the history of the paste
export const BEFORE: Step[] = [carryFiles];
export const AFTER: Step[] = [nameMacros, nameTheme];

// texts inserted by insert, with the steps of a paste from another deck when text names one
export async function arrive<T>(app: App, text: string, texts: string[], insert: (texts: string[]) => Promise<T>): Promise<T> {
  const origin = originOf(text);
  if (!origin || origin.deck === deckAddress()) return insert(texts);
  const arrival: Arrival = { origin, texts, notes: [] };
  for (const step of BEFORE) await step(app, arrival);
  const out = await insert(arrival.texts);
  for (const step of AFTER) await step(app, arrival);
  if (arrival.notes.length) {
    app.note = { text: arrival.notes.join(' '), warn: true };
    app.report();
  }
  return out;
}
