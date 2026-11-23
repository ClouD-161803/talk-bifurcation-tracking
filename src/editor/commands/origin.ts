import type { App } from '../app.ts';
import { deckMacros } from '../math.ts';
import { carryFiles } from '../media/carry.ts';
import { nameMacros } from './macros.ts';
import { MARK } from './slide.ts';

export type OriginMacro = { name: string; body: string; args: number; default?: string };
export type Origin = { deck: string; version: string; macros: OriginMacro[]; session?: boolean };

const OPEN = '<!--beeson-origin ';

let served: boolean | null = null;
export const setServed = (on: boolean): void => void (served = on);
const keyed = (): boolean => served ?? new URLSearchParams(location.search).has('session');

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const KEY = /^[A-Za-z0-9_-]{22,128}$/;
export function deckAddress(): string {
  const address = location.href.split(/[?#]/)[0];
  const start = address.indexOf('/', address.indexOf('//') + 2);
  if (!keyed() || start < 0) return address;
  const parts = address.slice(start).split('/');
  return address.slice(0, start) + parts.map((p, i) => (i < parts.length - 1 && KEY.test(p) ? `session-${hash(p)}` : p)).join('/');
}

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

export function originComment(text: string): string {
  const json = JSON.stringify({ deck: deckAddress(), version: themeVersion(), macros: usedMacros(text), ...(keyed() && { session: true }) } satisfies Origin);
  return `${OPEN}${json.replace(/[-<>]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}-->`;
}

function contained(t: string, bracket = false): boolean {
  if (/[\u0000-\u0008\u000a-\u001f\u007f\u2028\u2029]|\^\^/.test(t)) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\') {
      if (++i === t.length) return false;
    } else if (t[i] === '{') depth++;
    else if (t[i] === '}') {
      if (--depth < 0) return false;
    } else if (t[i] === '%' || (bracket && t[i] === ']' && !depth)) return false;
  }
  return !depth;
}

export function originOf(text: string): Origin | null {
  const at = text.indexOf(MARK);
  if (at < 0) return null;
  const rest = text.slice(at + MARK.length).trimStart();
  const end = rest.indexOf('-->');
  if (!rest.startsWith(OPEN) || end < 0) return null;
  try {
    const o = JSON.parse(rest.slice(OPEN.length, end));
    if (typeof o.deck !== 'string' || !/^(https?|file):$/.test(new URL(o.deck).protocol)) return null;
    const macros = (Array.isArray(o.macros) ? o.macros : []).filter(
      (m: OriginMacro | null) => typeof m?.name === 'string' && /^[a-zA-Z]+$/.test(m.name) && typeof m.body === 'string' && contained(m.body) && Number.isInteger(m.args) && m.args >= 0 && m.args <= 9 && (m.default === undefined || (typeof m.default === 'string' && contained(m.default, true))),
    );
    const version = typeof o.version === 'string' && /^[\w.+-]{0,40}$/.test(o.version) ? o.version : '';
    return { deck: o.deck, version, macros: macros.map(({ name, body, args, default: d }: OriginMacro) => ({ name, body, args, default: d })), ...(o.session === true && { session: true }) };
  } catch {
    return null;
  }
}

export type Arrival = { origin: Origin; texts: string[]; notes: string[] };
export type Step = (app: App, arrival: Arrival) => void | Promise<void>;

function nameTheme(_app: App, arrival: Arrival): void {
  const [there, here] = [arrival.origin.version, themeVersion()];
  if (there && here && there !== here) arrival.notes.push(`The deck you pasted from has theme version ${there}, and this deck version ${here}, hence what you pasted may be drawn differently.`);
}

export const BEFORE: Step[] = [carryFiles];
export const AFTER: Step[] = [nameMacros, nameTheme];

export async function arrive<T>(app: App, text: string, texts: string[], insert: (texts: string[]) => Promise<T>): Promise<T> {
  const origin = originOf(text);
  if (!origin || origin.deck === deckAddress()) return insert(texts);
  const arrival: Arrival = { origin, texts, notes: [] };
  for (const step of BEFORE) await step(app, arrival);
  const out = await insert(arrival.texts);
  for (const step of AFTER) await step(app, arrival);
  if (arrival.notes.length)
    void app.history.settle().then(() => {
      app.note = { text: arrival.notes.join(' '), warn: true };
      app.report();
    });
  return out;
}
