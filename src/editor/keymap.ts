import type { Platform } from './app.ts';

export type { Platform };
export type KeyString = string;
export type Chord = { key: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean };

export type KeyEvent = {
  key: string;
  code?: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  getModifierState?(name: string): boolean;
};

const MODIFIERS = ['Mod', 'Shift', 'Alt', 'Ctrl', 'Meta'];

const NAMED = new Set([
  'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Space', 'ContextMenu',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

const SYMBOLS: Record<string, [string, string]> = {
  Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Backquote: ['`', '~'],
  Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
};

const isLetter = (key: string) => /^[a-z]$/i.test(key);
const isDigit = (key: string) => /^[0-9]$/.test(key);
const isSymbol = (key: string) => key.length === 1 && !isLetter(key) && !isDigit(key);

export function parseKey(value: KeyString, platform: Platform): Chord {
  const parts = value.endsWith('++') ? [...value.slice(0, -2).split('+'), '+'] : value.split('+');
  const raw = parts.pop() ?? '';
  for (const part of parts) if (!MODIFIERS.includes(part)) throw new Error(`the modifier ${part} of ${value} is not known`);
  const key = raw.length === 1 ? raw.toLowerCase() : raw;
  if (!key || (key.length > 1 && !NAMED.has(key))) throw new Error(`the key of ${value} is not known`);
  const mods = new Set(parts);
  return {
    key,
    shift: mods.has('Shift'),
    alt: mods.has('Alt'),
    ctrl: mods.has('Ctrl') || (mods.has('Mod') && platform === 'other'),
    meta: mods.has('Meta') || (mods.has('Mod') && platform === 'mac'),
  };
}

export function allowed(value: KeyString, platform: Platform): boolean {
  const c = parseKey(value, platform);
  return platform === 'mac' || !(c.ctrl && c.alt);
}

function keyMatches(ev: KeyEvent, chord: Chord, platform: Platform): boolean {
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  const code = ev.code ?? '';
  if (isLetter(chord.key)) {
    const ascii = key.length === 1 && key.charCodeAt(0) < 128;
    return ascii ? key === chord.key : code === `Key${chord.key.toUpperCase()}`;
  }
  if (isDigit(chord.key)) return key === chord.key || code === `Digit${chord.key}`;
  if (isSymbol(chord.key)) {
    if (key === chord.key) return true;
    const typed = platform === 'mac' && ev.altKey ? SYMBOLS[code] : undefined;
    return !!typed && typed[ev.shiftKey ? 1 : 0] === chord.key;
  }
  if (chord.key === 'Space') return ev.key === ' ';
  return ev.key === chord.key;
}

export function matches(ev: KeyEvent, value: KeyString, platform: Platform): boolean {
  if (platform === 'other' && ev.getModifierState?.('AltGraph')) return false;
  const chord = parseKey(value, platform);
  if (!keyMatches(ev, chord, platform)) return false;
  if (!isSymbol(chord.key) && ev.shiftKey !== chord.shift) return false;
  return ev.altKey === chord.alt && ev.ctrlKey === chord.ctrl && ev.metaKey === chord.meta;
}

export function fallback(ev: KeyEvent, platform: Platform): KeyEvent | null {
  const get = (name: string) => ev.getModifierState?.(name) ?? false;
  const base = { key: ev.key, code: ev.code, shiftKey: ev.shiftKey, altKey: ev.altKey, getModifierState: get };
  if (platform === 'mac' && ev.ctrlKey && !ev.metaKey) return { ...base, ctrlKey: false, metaKey: true };
  if (platform === 'other' && ev.metaKey && !ev.ctrlKey) return { ...base, ctrlKey: true, metaKey: false };
  return null;
}

const MAC_KEYS: Record<string, string> = {
  Enter: '↩', Escape: '⎋', Tab: '⇥', Backspace: '⌫', Delete: '⌦', Space: 'Space', ContextMenu: 'Menu',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟', '-': '−',
};

const OTHER_KEYS: Record<string, string> = {
  Escape: 'Esc', Space: 'Spacebar', ContextMenu: 'Menu', ArrowUp: 'Up Arrow', ArrowDown: 'Down Arrow', ArrowLeft: 'Left Arrow',
  ArrowRight: 'Right Arrow', PageUp: 'Page Up', PageDown: 'Page Down',
};

export function display(value: KeyString, platform: Platform): string {
  const c = parseKey(value, platform);
  const key = c.key.length === 1 ? c.key.toUpperCase() : c.key;
  if (platform === 'mac') {
    const mods = (c.ctrl ? '⌃' : '') + (c.alt ? '⌥' : '') + (c.shift ? '⇧' : '') + (c.meta ? '⌘' : '');
    return mods + (MAC_KEYS[key] ?? key);
  }
  const mods = [c.ctrl && 'Ctrl', c.meta && 'Meta', c.alt && 'Alt', c.shift && 'Shift'].filter(Boolean);
  return [...mods, OTHER_KEYS[key] ?? key].join('+');
}
