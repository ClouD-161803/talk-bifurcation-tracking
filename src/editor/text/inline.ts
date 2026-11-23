import type { App } from '../app.ts';
import * as flow from './flow.ts';
import { canSetList, listKind, offsetIn, paragraphStyle, selectedTextElements, selectIn, setList, setStyle, styleOf, textTarget, type ListKind, type ParagraphStyle, type Target } from './elements.ts';

export type Match = (el: Element) => boolean;

const tagIs = (...tags: string[]): Match => (el) => tags.includes(el.localName);

export const TONES = ['accent', 'violet', 'blue', 'red', 'subtle', 'muted', 'text'] as const;
export type Tone = (typeof TONES)[number];

export const isTone: Match = (el) => el.localName === 'span' && el.classList.length === 1 && el.classList[0].startsWith('tone-');

export const FORMATS = {
  bold: { tag: 'strong', match: tagIs('strong', 'b') },
  italic: { tag: 'em', match: tagIs('em', 'i') },
  underline: { tag: 'u', match: tagIs('u') },
  strike: { tag: 's', match: tagIs('s', 'strike') },
  superscript: { tag: 'sup', match: tagIs('sup') },
  subscript: { tag: 'sub', match: tagIs('sub') },
  code: { tag: 'code', match: tagIs('code') },
} as const;
export type FormatName = keyof typeof FORMATS;

export const isLink: Match = tagIs('a');

export const isSmall: Match = (el) => el.localName === 'span' && el.classList.length === 1 && el.classList[0] === 'small';

export const isBoxed: Match = (el) => el.localName === 'span' && el.classList.length === 1 && el.classList[0] === 'boxed';

export const CLEARED: Match = (el) => tagIs('strong', 'b', 'em', 'i', 'sup', 'sub', 'code', 'u', 's', 'strike', 'mark')(el) || isTone(el) || isSmall(el) || isBoxed(el);

const BREAKING = 'ul, ol, li, p, div, table, pre, h1, h2, h3, h4, h5, h6, mjx-container';
const INNER = 'li, p, div, td, th, pre, h1, h2, h3, h4, h5, h6';

const elementOf = (n: Node): Element | null => (n instanceof Element ? n : n.parentElement);

function wordRange(range: Range, edge: boolean): Range {
  if (!range.collapsed || !(range.startContainer instanceof Text)) return range;
  const text = range.startContainer;
  const word = /[\p{L}\p{N}_'’-]/u;
  let start = range.startOffset;
  let end = start;
  if (!edge && (!word.test(text.data[start - 1] ?? '') || !word.test(text.data[end] ?? ''))) return range;
  while (start > 0 && word.test(text.data[start - 1])) start--;
  while (end < text.length && word.test(text.data[end])) end++;
  const r = document.createRange();
  r.setStart(text, start);
  r.setEnd(text, end);
  return r;
}

function trimEnd(range: Range): Range {
  const end = range.endContainer;
  if (range.collapsed || !(end instanceof Text)) return range;
  const from = end === range.startContainer ? range.startOffset : 0;
  let k = range.endOffset;
  while (k > from && /\s/.test(end.data[k - 1])) k--;
  if (k === range.endOffset || (k === from && end === range.startContainer)) return range;
  const r = range.cloneRange();
  r.setEnd(end, k);
  return r;
}

export function inlineTargets(app: App, notes = false, edge = false): Target[] {
  const spanned = flow.spanTargets(app);
  if (spanned.length) return spanned;
  const t = textTarget(app);
  if (t) {
    if (!notes && t.host.matches('aside.notes')) return [];
    const range = trimEnd(wordRange(t.range, edge));
    return range.collapsed ? [] : [{ host: t.host, range }];
  }
  return selectedTextElements(app).map((host) => {
    const range = document.createRange();
    range.selectNodeContents(host);
    return { host, range };
  });
}

function textsIn(range: Range): Node[] {
  const root = range.commonAncestorContainer;
  if (root instanceof Text) return [root];
  const out: Node[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const edge = (n === range.startContainer && range.startOffset === n.length) || (n === range.endContainer && range.endOffset === 0);
    if (range.intersectsNode(n) && !edge && n.data.trim() && !n.parentElement?.closest('mjx-container')) out.push(n);
  }
  return out.length ? out : [range.startContainer];
}

export function around(host: Element, node: Node, match: Match): Element | null {
  for (let el = elementOf(node); el && el !== host && host.contains(el); el = el.parentElement) if (match(el)) return el;
  return null;
}

export function formatted(host: Element, range: Range, match: Match): boolean {
  return textsIn(range).every((n) => around(host, n, match));
}

function lift(host: Element, range: Range, match: Match): Node[] {
  let outer: Element | null = null;
  for (let el = elementOf(range.commonAncestorContainer); el && el !== host && host.contains(el); el = el.parentElement) if (match(el)) outer = el;
  let nodes: Node[];
  if (outer) {
    const start: [Node, number] = [range.startContainer, range.startOffset];
    const tail = document.createRange();
    tail.setStart(range.endContainer, range.endOffset);
    tail.setEnd(outer, outer.childNodes.length);
    const after = outer.cloneNode(false) as Element;
    after.append(tail.extractContents());
    const head = document.createRange();
    head.setStart(outer, 0);
    head.setEnd(...start);
    const before = outer.cloneNode(false) as Element;
    before.append(head.extractContents());
    nodes = [...outer.childNodes];
    const part = (el: Element) => (el.textContent!.trim() || el.querySelector('mjx-container, img, br') ? [el] : [...el.childNodes]);
    outer.before(...part(before));
    outer.after(...part(after));
    outer.replaceWith(...nodes);
  } else {
    const fragment = range.extractContents();
    nodes = [...fragment.childNodes];
    range.insertNode(fragment);
  }
  const out: Node[] = [];
  for (const n of nodes) {
    if (n instanceof Element && !n.matches('mjx-container')) {
      for (const el of [...n.querySelectorAll('*')].filter((e) => match(e) && !e.closest('mjx-container')).reverse()) el.replaceWith(...el.childNodes);
      if (match(n)) {
        const kids = [...n.childNodes];
        n.replaceWith(...kids);
        out.push(...kids);
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

function wrapRuns(nodes: Node[], make: () => Element): void {
  let run: Node[] = [];
  const flush = () => {
    if (run.some((n) => !(n instanceof Text) || n.data.trim())) {
      const el = make();
      run[0].parentNode!.insertBefore(el, run[0]);
      el.append(...run);
    }
    run = [];
  };
  for (const n of nodes) {
    if (n instanceof Element && n.matches(BREAKING) && !n.matches('mjx-container')) {
      flush();
      wrapRuns([...n.childNodes], make);
    } else run.push(n);
  }
  flush();
}

function prune(host: Element): void {
  for (const el of [...host.querySelectorAll('strong, em, b, i, u, s, strike, sup, sub, code, span, a')].reverse()) {
    if ((CLEARED(el) || isLink(el)) && !el.textContent && !el.querySelector('mjx-container, br, img')) el.remove();
  }
}

export function edit(app: App, targets: Target[], change: (host: Element, range: Range) => Node[]): void {
  const t = textTarget(app);
  const spanning = flow.active();
  const caret = t?.range.collapsed ? offsetIn(t.host, t.range.startContainer, t.range.startOffset) : null;
  const kept = app.history.keep(() => {
    const p = flow.places(app);
    return p && (() => flow.select(app, ...p));
  });
  for (const { host, range } of targets) {
    app.history.beforeTyping(host);
    const nodes = change(host, range);
    prune(host);
    if (spanning) {
    } else if (caret !== null && host === t!.host) selectIn(host, caret);
    else if (t && nodes.length) {
      const connected = nodes.filter((n) => n.isConnected);
      (host as HTMLElement).focus({ preventScroll: true });
      const r = document.createRange();
      if (connected.length) {
        r.setStartBefore(connected[0]);
        r.setEndAfter(connected[connected.length - 1]);
      } else r.setStart(range.startContainer, range.startOffset);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    host.normalize();
    app.history.afterTyping(host);
  }
  if (spanning) flow.repaint(app);
  kept();
  app.markDirty();
  app.invalidate('content');
}

function innerParts(host: Element, range: Range): Range[] {
  const groups = new Map<Element, Text[]>();
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const edge = (n === range.startContainer && range.startOffset === n.length) || (n === range.endContainer && range.endOffset === 0);
    if (!range.intersectsNode(n) || edge || !n.data.trim() || n.parentElement?.closest('mjx-container')) continue;
    const inner = n.parentElement!.closest(INNER);
    const key = inner && host.contains(inner) && inner !== host ? inner : host;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  if (groups.size < 2) return [range];
  return [...groups.values()].map((texts) => {
    const [a, b] = [texts[0], texts[texts.length - 1]];
    const r = document.createRange();
    if (a === range.startContainer) r.setStart(a, range.startOffset);
    else r.setStart(a, 0);
    if (b === range.endContainer) r.setEnd(b, range.endOffset);
    else r.setEnd(b, b.length);
    return r;
  });
}

export function setFormat(host: Element, range: Range, match: Match, make: (() => Element) | null): Node[] {
  const parts = innerParts(host, range);
  if (parts.length > 1) return parts.flatMap((r) => setFormat(host, r, match, make));
  const nodes = lift(host, range, match);
  if (make) {
    wrapRuns(nodes, make);
    return nodes.map((n) => (n.parentNode && n.parentNode !== host && (n.parentNode as Element).matches?.(':not([contenteditable])') ? n.parentNode : n)).filter((n, i, a) => a.indexOf(n) === i);
  }
  return nodes;
}

export function toggle(app: App, name: FormatName): void {
  const targets = inlineTargets(app, name === 'bold' || name === 'italic');
  if (!targets.length) return;
  const f = FORMATS[name];
  const on = targets.every((t) => formatted(t.host, t.range, f.match));
  const pair = name === 'superscript' ? FORMATS.subscript.match : name === 'subscript' ? FORMATS.superscript.match : null;
  edit(app, targets, (host, range) => {
    if (on) return setFormat(host, range, f.match, null);
    const match: Match = pair ? (el) => f.match(el) || pair(el) : f.match;
    return setFormat(host, range, match, () => document.createElement(f.tag));
  });
}

const cellTargets = (app: App): Target[] => inlineTargets(app).filter((t) => t.host.matches('td, th'));

export function canSizeInCell(app: App, up: boolean): boolean {
  const targets = cellTargets(app);
  return targets.length > 0 && targets.every((t) => formatted(t.host, t.range, isSmall)) === up;
}

export function sizeInCell(app: App, up: boolean): void {
  edit(app, cellTargets(app), (host, range) => setFormat(host, range, isSmall, up ? null : () => {
    const span = document.createElement('span');
    span.className = 'small';
    return span;
  }));
}

export function boxedOn(app: App): boolean {
  const targets = inlineTargets(app);
  return targets.length > 0 && targets.every((t) => formatted(t.host, t.range, isBoxed));
}

export function toggleBoxed(app: App): void {
  const on = boxedOn(app);
  edit(app, inlineTargets(app), (host, range) => {
    const nodes = setFormat(host, range, isBoxed, on ? null : () => {
      const span = document.createElement('span');
      span.className = 'boxed';
      return span;
    });
    return nodes.map((n) => {
      if (!(n instanceof Element) || !isBoxed(n) || n.childNodes.length !== 1) return n;
      const tone = n.firstElementChild;
      if (!tone || !isTone(tone)) return n;
      n.replaceWith(tone);
      n.append(...tone.childNodes);
      tone.append(n);
      return tone;
    });
  });
}

export function isOn(app: App, name: FormatName): boolean {
  const targets = inlineTargets(app, true);
  return targets.length > 0 && targets.every((t) => formatted(t.host, t.range, FORMATS[name].match));
}

export function toneAt(app: App, targets = inlineTargets(app)): Tone | null {
  const t = targets[0] ?? textTarget(app);
  if (!t) return null;
  const span = around(t.host, textsIn(t.range)[0], isTone);
  return span ? (span.classList[0].slice(5) as Tone) : null;
}

const ownColor = (host: Element): boolean => !!host.parentElement && getComputedStyle(host).color !== getComputedStyle(host.parentElement).color;

export function textColored(app: App, targets = inlineTargets(app)): boolean {
  const t = targets[0] ?? textTarget(app);
  if (!t) return false;
  const span = around(t.host, textsIn(t.range)[0], isTone);
  return span ? span.classList.contains('tone-text') : !ownColor(t.host);
}

export function setTone(app: App, tone: Tone | null, targets = inlineTargets(app)): void {
  edit(app, targets, (host, range) => {
    const t = tone === 'text' && !ownColor(host) ? null : tone;
    return setFormat(host, range, isTone, t ? () => {
      const span = document.createElement('span');
      span.className = `tone-${t}`;
      return span;
    } : null);
  });
}

export function clearFormatting(app: App): void {
  edit(app, inlineTargets(app, true), (host, range) => setFormat(host, range, CLEARED, null));
}

function linkTargets(app: App): Target[] {
  const t = textTarget(app);
  if (t && t.range.collapsed && !t.host.matches('aside.notes')) {
    const a = around(t.host, t.range.startContainer, isLink);
    if (a) {
      const range = document.createRange();
      range.selectNodeContents(a);
      return [{ host: t.host, range }];
    }
  }
  return inlineTargets(app, false, true);
}

export const canLink = (app: App): boolean => linkTargets(app).length > 0;

export function linkAt(app: App): string | null {
  const t = linkTargets(app)[0];
  const a = t ? around(t.host, t.range.startContainer, isLink) ?? around(t.host, textsIn(t.range)[0], isLink) : null;
  return a?.getAttribute('href') ?? null;
}

export function setLink(app: App, href: string): void {
  edit(app, linkTargets(app), (host, range) => setFormat(host, range, isLink, () => {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    return a;
  }));
}

export function removeLink(app: App): void {
  edit(app, linkTargets(app), (host, range) => setFormat(host, range, isLink, null));
}

export type Case = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);

export function recase(text: string, kind: Case, before = ''): string {
  let prev = before.at(-1) ?? '';
  let sentence = !before.trim() || /[.!?]["'”’)\]]*\s*$/.test(before);
  let out = '';
  for (const c of text) {
    const upper = c.toUpperCase();
    const lower = c.toLowerCase();
    if (kind === 'upper') out += upper;
    else if (kind === 'lower') out += lower;
    else if (kind === 'toggle') out += c === upper ? lower : upper;
    else if (kind === 'title') out += isWordChar(prev) || (/['’]/.test(prev) && isWordChar(out.at(-2) ?? before.at(-2) ?? '')) ? lower : upper;
    else out += sentence && upper !== lower ? upper : lower;
    if (/[.!?]/.test(c)) sentence = true;
    else if (isWordChar(c)) sentence = false;
    prev = c;
  }
  return out;
}

export function nextCase(text: string): Case {
  if (text === text.toLowerCase() && text !== text.toUpperCase()) return 'upper';
  if (text === text.toUpperCase() && text !== text.toLowerCase()) return 'title';
  return 'lower';
}

function splitTexts(range: Range): Text[] {
  const { endContainer: ec, endOffset: eo } = range;
  if (ec instanceof Text && eo > 0 && eo < ec.length) ec.splitText(eo);
  const { startContainer: sc, startOffset: so } = range;
  if (sc instanceof Text && so > 0 && so < sc.length) sc.splitText(so);
  const root = range.commonAncestorContainer;
  if (root instanceof Text) return range.collapsed ? [] : [root];
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const edge = (n === range.startContainer && range.startOffset === n.length) || (n === range.endContainer && range.endOffset === 0);
    if (range.intersectsNode(n) && !edge && n.length && !n.parentElement?.closest('mjx-container')) out.push(n);
  }
  return out;
}

function textBefore(host: Element, node: Node): string {
  let out = '';
  const item = elementOf(node)?.closest(INNER);
  const walker = document.createTreeWalker(item && host.contains(item) ? item : host, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n && n !== node; n = walker.nextNode() as Text | null) {
    if (!n.parentElement?.closest('mjx-container')) out += n.data;
  }
  return out;
}

const caseTexts = (range: Range): string => {
  const copy = range.cloneContents();
  for (const m of copy.querySelectorAll('mjx-container')) m.remove();
  return copy.textContent ?? '';
};

export function changeCase(app: App, kind: Case | 'cycle'): void {
  const targets = inlineTargets(app);
  if (!targets.length) return;
  const to = kind === 'cycle' ? nextCase(caseTexts(targets[0].range)) : kind;
  edit(app, targets, (host, range) => {
    const texts = splitTexts(range);
    for (const t of texts) {
      const next = recase(t.data, to, textBefore(host, t));
      if (next !== t.data) t.data = next;
    }
    return texts;
  });
}

export type TextStyle = {
  formats: Record<FormatName, boolean>;
  tone: Tone | null;
  paragraph: ParagraphStyle | null;
  list: ListKind | null;
};

const NAMES = Object.keys(FORMATS) as FormatName[];

function covers(host: Element, range: Range): boolean {
  const all = document.createRange();
  all.selectNodeContents(host);
  return range.toString().trim() === all.toString().trim();
}

export function readStyle(app: App): TextStyle | null {
  const t = textTarget(app);
  if (t && t.host.matches('aside.notes')) return null;
  const target = t ? (inlineTargets(app)[0] ?? t) : inlineTargets(app)[0];
  if (!target) return null;
  const { host, range } = target;
  const texts = t ? [textsIn(range)[0]] : textsIn(range);
  const has = (match: Match) => texts.every((n) => around(host, n, match));
  const formats = Object.fromEntries(NAMES.map((name) => [name, has(FORMATS[name].match)])) as Record<FormatName, boolean>;
  const tones = new Set(texts.map((n) => around(host, n, isTone)?.classList[0] ?? null));
  const tone = tones.size === 1 ? ([...tones][0]?.slice(5) as Tone | undefined) ?? null : null;
  if (t) return { formats, tone, paragraph: paragraphStyle(app), list: listKind(app) };
  const list = host.localName === 'li' && host.parentElement?.matches('ul, ol') ? (host.parentElement.localName as ListKind) : null;
  return { formats, tone, paragraph: styleOf(app, host), list };
}

function joinSame(made: Set<Element>): void {
  const same = (a: Node | null, b: Element): a is Element => a instanceof Element && a.localName === b.localName && a.className === b.className && a.attributes.length === b.attributes.length;
  for (const el of made) {
    if (!el.isConnected) continue;
    for (const [a, b] of [[el.previousSibling, el], [el, el.nextSibling]] as [Node | null, Node | null][]) {
      if (b instanceof Element && same(a, b)) {
        a.append(...b.childNodes);
        b.remove();
      }
    }
  }
}

function paint(host: Element, range: Range, style: TextStyle): Node[] {
  let nodes = setFormat(host, range, CLEARED, null);
  const made = new Set<Element>();
  const wrap = (create: () => Element) => {
    if (!nodes.length) return;
    const r = document.createRange();
    r.setStartBefore(nodes[0]);
    r.setEndAfter(nodes[nodes.length - 1]);
    nodes = setFormat(host, r, () => false, () => {
      const el = create();
      made.add(el);
      return el;
    });
  };
  if (style.tone) {
    const tone = style.tone;
    wrap(() => Object.assign(document.createElement('span'), { className: `tone-${tone}` }));
  }
  for (const name of ['code', 'subscript', 'superscript', 'strike', 'underline', 'italic', 'bold'] as const) {
    if (style.formats[name]) wrap(() => document.createElement(FORMATS[name].tag));
  }
  joinSame(made);
  return nodes.filter((n) => n.isConnected);
}

export const canPaint = (app: App): boolean => inlineTargets(app, false, true).length > 0;

export async function pasteStyle(app: App, style: TextStyle): Promise<void> {
  const targets = inlineTargets(app, false, true);
  if (!targets.length) return;
  const t = textTarget(app);
  const whole = !t || covers(t.host, t.range);
  edit(app, targets, (host, range) => paint(host, range, style));
  if (!whole) return;
  if (t && style.list && listKind(app) !== style.list && canSetList(app, style.list)) await setList(app, style.list);
  if (style.paragraph && paragraphStyle(app) !== null) await setStyle(app, style.paragraph);
}
