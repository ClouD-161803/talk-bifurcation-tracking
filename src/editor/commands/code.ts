import type { App } from '../app.ts';
import { insertPlain } from '../text/typing.ts';
import { injectStyle } from '../ui/dom.ts';

type Hljs = {
  highlight(code: string, o: { language: string; ignoreIllegals: boolean }): { value: string };
  highlightAuto(code: string): { value: string; language?: string };
  listLanguages(): string[];
  getLanguage(name: string): { name?: string } | undefined;
};

let lib: Hljs | null | undefined;
export function hljsOf(): Hljs | null {
  if (lib !== undefined) return lib;
  try {
    lib = (window as { RevealHighlight?: () => { hljs?: Hljs } }).RevealHighlight?.().hljs ?? null;
  } catch {
    lib = null;
  }
  return lib;
}

export const COMMON: [string, string][] = [
  ['python', 'Python'], ['julia', 'Julia'], ['matlab', 'MATLAB'], ['cpp', 'C++'], ['c', 'C'], ['fortran', 'Fortran'],
  ['rust', 'Rust'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['bash', 'Bash'], ['json', 'JSON'],
  ['yaml', 'YAML'], ['latex', 'LaTeX'], ['markdown', 'Markdown'], ['xml', 'HTML, XML'],
];
export const PLAIN = 'plaintext';

export function languages(): [string, string][] {
  const hljs = hljsOf();
  if (!hljs) return COMMON;
  return hljs.listLanguages().filter((n) => /^[\w-]+$/.test(n) && n !== PLAIN).map((n): [string, string] => [n, nameOf(n)]).sort((a, b) => a[1].localeCompare(b[1]));
}

export const nameOf = (language: string | null): string => {
  if (language === null) return 'Automatic';
  if (language === PLAIN) return 'Plain Text';
  return COMMON.find(([n]) => n === language)?.[1] ?? hljsOf()?.getLanguage(language)?.name ?? language;
};

export function codeAt(app: App, arg?: unknown): Element | null {
  const given = (arg as { el?: unknown } | undefined)?.el;
  const sel = app.selection;
  const el = given instanceof Element ? given : sel.only() ?? (sel.kind === 'text' ? sel.items[0] ?? null : null);
  const pre = el?.closest('pre');
  const code = pre?.querySelector(':scope > code') ?? null;
  const src = code ? app.pairing?.elements.get(code) ?? app.pairing?.inner.get(code) : null;
  return code && src?.open && code.closest('section') ? code : null;
}

const classesOf = (app: App, code: Element): string[] => app.doc.tagState(code).classes;

export function languageOf(app: App, code: Element): string | null {
  const c = classesOf(app, code).find((c) => /^language-[\w-]+$/.test(c));
  return c ? c.slice('language-'.length) : null;
}

const LINES = 'data-line-numbers';
const NUMBERS_WHY = 'Line steps are shown only with line numbers.';
const SMALL = '18px';

export const isSmall = (app: App, code: Element): boolean => app.doc.tagState(code.closest('pre') as Element).style['font-size']?.trim() === SMALL;

export function stepsOf(app: App, code: Element): { numbers: boolean; groups: string[] } {
  const raw = app.doc.tagState(code).attrs[LINES];
  if (raw === undefined) return { numbers: false, groups: [] };
  const value = raw.replace(/\s+/g, '');
  return { numbers: true, groups: value ? value.split('|') : [] };
}

export function checkGroup(group: string): string {
  const g = group.replace(/\s+/g, '').replace(/–/g, '-');
  if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(g)) throw new Error(`the lines ${group || '(none)'} are not a group of lines, e.g. 3, 1-2, or 1,3-5`);
  for (const part of g.split(',')) {
    const [a, b = a] = part.split('-').map(Number);
    if (a < 1 || b < a) throw new Error(`the lines ${part} are not a range of lines from line 1`);
  }
  return g;
}

function writeSteps(app: App, code: Element, numbers: boolean, groups: string[]): void {
  const value = groups.length ? groups.join('|') : numbers ? '' : null;
  const now = app.doc.tagState(code).attrs[LINES] ?? null;
  if (value !== now) app.doc.setTag(code, { attrs: { [LINES]: value } }, 'line steps');
}

export function selectedLines(code: Element): [number, number] | null {
  const s = document.getSelection();
  if (!s || !s.rangeCount) return null;
  const r = s.getRangeAt(0);
  if (!code.contains(r.startContainer) || !code.contains(r.endContainer)) return null;
  const lineAt = (node: Node, offset: number) => {
    const before = document.createRange();
    before.setStart(code, 0);
    before.setEnd(node, offset);
    const text = before.toString();
    return { line: text.split('\n').length, atStart: text.endsWith('\n') };
  };
  const a = lineAt(r.startContainer, r.startOffset).line;
  const end = lineAt(r.endContainer, r.endOffset);
  const b = end.atStart && end.line > a && !r.collapsed ? end.line - 1 : end.line;
  return [a, Math.max(a, b)];
}

export function shiftGroups(groups: string[], before: string, after: string): string[] {
  const a = before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  if (a.length === b.length) return groups;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const endA = a.length - s;
  const endB = b.length - s;
  const line = (n: number): number => {
    if (n - 1 < p) return n;
    if (n - 1 >= endA) return n + b.length - a.length;
    return endB > p ? Math.min(n - 1, endB - 1) + 1 : Math.max(1, p);
  };
  return groups.map((g) => {
    const parts = g.split(',').map((part) => {
      const [x, y = x] = part.split('-').map(Number);
      const [u, v] = [line(x), line(y)];
      return u === v ? String(u) : `${u}-${v}`;
    });
    return parts.filter((q, k) => q !== parts[k - 1]).join(',');
  });
}

function indentAt(code: Element): string {
  const s = document.getSelection();
  if (!s?.rangeCount || !code.contains(s.getRangeAt(0).startContainer)) return '';
  const r = document.createRange();
  r.setStart(code, 0);
  r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset);
  return /^[ \t]*/.exec(r.toString().split('\n').pop() ?? '')?.[0] ?? '';
}

function addsOrDeletesLines(ev: InputEvent): boolean {
  const type = ev.inputType;
  if (type === 'insertParagraph' || type === 'insertLineBreak' || type.startsWith('insertFrom') || type === 'insertReplacementText' || ev.data?.includes('\n')) return true;
  const text = (r: StaticRange | Range) => {
    const range = document.createRange();
    range.setStart(r.startContainer, r.startOffset);
    range.setEnd(r.endContainer, r.endOffset);
    return range.toString();
  };
  const s = document.getSelection();
  if (s?.rangeCount && !s.isCollapsed && text(s.getRangeAt(0)).includes('\n')) return true;
  return type.startsWith('delete') && ev.getTargetRanges().some((r) => text(r).includes('\n'));
}

export function linesOf(group: string): Set<number> {
  const out = new Set<number>();
  for (const part of group.split(',')) {
    const [a, b = a] = part.split('-').map(Number);
    for (let n = a; n <= Math.min(b, a + 10000); n++) out.add(n);
  }
  return out;
}

const TOKENS: [string, string][] = [
  ['keyword', 'violet'], ['literal', 'violet'], ['meta', 'violet'], ['built_in', 'trajectory-3'], ['title', 'accent'],
  ['params', 'trajectory-6'], ['string', 'trajectory-4'], ['number', 'trajectory-5'], ['comment', 'muted'], ['operator', 'subtle'],
];
const NAME = (token: string) => `beeson-code-${token.replace(/_/g, '-')}`;
const DIM = 'beeson-code-dim';
const NUMBERS = `
html.beeson-editor .reveal pre[data-beeson-lines]::before { content: attr(data-beeson-lines); float: left; margin-right: 1em; white-space: pre; text-align: right; color: var(--muted); pointer-events: none; user-select: none; }
${[1, 2, 3].map((d) => `html.beeson-editor .reveal pre[data-beeson-digits="${d}"]::before { width: ${d}ch; }`).join('\n')}
`;

const STYLE = [
  ...TOKENS.map(([t, color]) => `::highlight(${NAME(t)}) { color: var(--${color}); }`),
  `::highlight(${DIM}) { color: var(--muted); }`,
  NUMBERS,
].join('\n');

function numberLines(app: App): void {
  for (const pre of app.slides().querySelectorAll('pre')) {
    const code = pre.querySelector(':scope > code');
    const on = !!code && code.hasAttribute(LINES);
    const count = on ? Math.max(1, (code!.textContent ?? '').replace(/\n$/, '').split('\n').length) : 0;
    const lines = on ? Array.from({ length: count }, (_, k) => String(k + 1)).join('\n') : null;
    if (lines === null) {
      pre.removeAttribute('data-beeson-lines');
      pre.removeAttribute('data-beeson-digits');
    } else if (pre.getAttribute('data-beeson-lines') !== lines) {
      pre.setAttribute('data-beeson-lines', lines);
      pre.setAttribute('data-beeson-digits', String(Math.min(3, String(count).length)));
    }
  }
}

type Token = [number, number, string];
const cache = new Map<string, Token[]>();

function tokensOf(hljs: Hljs, text: string, language: string | null): Token[] {
  const key = `${language ?? ''}\u0000${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let html = '';
  try {
    html = language && hljs.getLanguage(language) ? hljs.highlight(text, { language, ignoreIllegals: true }).value : language ? '' : hljs.highlightAuto(text).value;
  } catch {
    html = '';
  }
  const out: Token[] = [];
  if (html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const walk = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT);
    let at = 0;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const len = (n.nodeValue ?? '').length;
      let scope: string | undefined;
      for (let up = n.parentElement; up && !scope; up = up.parentElement) scope = TOKENS.find(([s]) => up!.classList.contains(`hljs-${s}`))?.[0];
      if (scope && len) out.push([at, at + len, scope]);
      at += len;
    }
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

function pointAt(nodes: Text[], starts: number[], offset: number): [Text, number] | null {
  for (let k = nodes.length - 1; k >= 0; k--) if (starts[k] <= offset) return [nodes[k], Math.min(offset - starts[k], nodes[k].length)];
  return null;
}

function textNodes(code: Element): { nodes: Text[]; starts: number[]; text: string } {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  const walk = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    nodes.push(n);
    starts.push(text.length);
    text += n.data;
  }
  return { nodes, starts, text };
}

function rangeOf(nodes: Text[], starts: number[], a: number, b: number): Range | null {
  const p = pointAt(nodes, starts, a);
  const q = pointAt(nodes, starts, b);
  if (!p || !q) return null;
  const r = new Range();
  r.setStart(p[0], p[1]);
  r.setEnd(q[0], q[1]);
  return r;
}

type Highlights = { set(name: string, h: unknown): void; delete(name: string): void };
const registry = (): Highlights | null => (typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: Highlights }).highlights : null);
const HighlightOf = (): (new (...r: Range[]) => { priority: number }) | null => (window as unknown as { Highlight?: new (...r: Range[]) => { priority: number } }).Highlight ?? null;

export function paint(app: App): void {
  const reg = registry();
  const H = HighlightOf();
  const hljs = hljsOf();
  if (!reg || !H || !hljs) return;
  const ranges = new Map<string, Range[]>(TOKENS.map(([t]) => [t, []]));
  const slide = app.current();
  for (const code of slide?.querySelectorAll('pre > code') ?? []) {
    const lang = [...code.classList].find((c) => /^language-[\w-]+$/.test(c))?.slice('language-'.length) ?? null;
    if (lang === PLAIN || code.classList.contains('nohighlight')) continue;
    const { nodes, starts, text } = textNodes(code);
    if (!text.trim()) continue;
    for (const [a, b, scope] of tokensOf(hljs, text, lang)) {
      const r = rangeOf(nodes, starts, a, b);
      if (r) ranges.get(scope)?.push(r);
    }
  }
  for (const [t] of TOKENS) reg.set(NAME(t), new H(...(ranges.get(t) ?? [])));
}

export function lineRect(code: Element, n: number): DOMRect | null {
  const { nodes, starts, text } = textNodes(code);
  let at = 0;
  for (let k = 1; k < n; k++) {
    at = text.indexOf('\n', at) + 1;
    if (at <= 0) return null;
  }
  const box = rangeOf(nodes, starts, at, Math.min(text.length, at + 1))?.getClientRects()[0];
  return box && box.height ? box : null;
}

export function dimLines(code: Element | null, group: string | null): void {
  const reg = registry();
  const H = HighlightOf();
  if (!reg || !H) return;
  if (!code || group === null) {
    reg.delete(DIM);
    return;
  }
  const keep = linesOf(group);
  const { nodes, starts, text } = textNodes(code);
  const out: Range[] = [];
  let at = 0;
  text.split('\n').forEach((line, k) => {
    if (!keep.has(k + 1) && line.length) {
      const r = rangeOf(nodes, starts, at, at + line.length);
      if (r) out.push(r);
    }
    at += line.length + 1;
  });
  const h = new H(...out);
  h.priority = 1;
  reg.set(DIM, h);
}

export function install(app: App): void {
  injectStyle('code', STYLE);
  const c = app.commands;
  const need = (a: App, arg: unknown): Element => {
    const code = codeAt(a, arg);
    if (!code) throw new Error('select a code box, i.e. a pre with a code, first');
    return code;
  };
  c.define({
    id: 'code.language',
    label: 'Set Language of Code',
    enabled: (a) => !!codeAt(a),
    undoable: true,
    run: (a, arg) => {
      const code = need(a, arg);
      const language = (arg as { language: string | null }).language;
      if (language !== null && !/^[\w-]+$/.test(language)) throw new Error(`${language} is not the name of a language of highlight.js`);
      const classes: Record<string, boolean> = {};
      for (const k of classesOf(a, code)) if (/^language-/.test(k) && k !== `language-${language}`) classes[k] = false;
      if (language !== null && !classesOf(a, code).includes(`language-${language}`)) classes[`language-${language}`] = true;
      if (Object.keys(classes).length) a.doc.setTag(code, { classes }, 'language');
    },
  });
  c.define({
    id: 'code.numbers',
    label: 'Number the Lines',
    enabled: (a) => {
      const code = codeAt(a);
      return !!code && !stepsOf(a, code).groups.length;
    },
    why: (a) => (codeAt(a) ? NUMBERS_WHY : null),
    checked: (a) => {
      const code = codeAt(a);
      return !!code && stepsOf(a, code).numbers;
    },
    undoable: true,
    run: (a, arg) => {
      const code = need(a, arg);
      const s = stepsOf(a, code);
      writeSteps(a, code, !s.numbers, s.groups);
    },
  });
  c.define({
    id: 'code.small',
    label: 'Small Code',
    enabled: (a) => !!codeAt(a),
    checked: (a) => {
      const code = codeAt(a);
      return !!code && isSmall(a, code);
    },
    undoable: true,
    run: (a, arg) => {
      const code = need(a, arg);
      const given = (arg as { on?: unknown } | undefined)?.on;
      const on = typeof given === 'boolean' ? given : !isSmall(a, code);
      if (on === isSmall(a, code)) return;
      a.doc.setTag(code.closest('pre') as Element, { style: { 'font-size': on ? SMALL : null } }, on ? 'Smaller' : 'Bigger');
    },
  });
  c.define({
    id: 'code.lines',
    label: 'Set Line Steps',
    undoable: true,
    run: (a, arg) => {
      const code = need(a, arg);
      const value = String((arg as { value: string }).value ?? '').trim();
      const groups = value ? value.split('|').map(checkGroup) : [];
      writeSteps(a, code, stepsOf(a, code).numbers || groups.length > 0, groups);
    },
  });
  c.define({
    id: 'code.addGroup',
    label: 'Add Selected Lines as a Step',
    enabled: (a) => {
      const code = codeAt(a);
      return !!code && !!selectedLines(code);
    },
    undoable: true,
    run: (a, arg) => {
      const code = need(a, arg);
      const given = (arg as { lines?: [number, number] } | undefined)?.lines;
      const lines = given ?? selectedLines(code);
      if (!lines) throw new Error('select the lines of the step in the code box first');
      const [from, to] = lines;
      const s = stepsOf(a, code);
      writeSteps(a, code, true, [...s.groups, checkGroup(from === to ? String(from) : `${from}-${to}`)]);
    },
  });
  c.define({
    id: 'code.removeGroup',
    label: 'Remove Line Step',
    undoable: true,
    run: (a, arg) => {
      const code = need(a, arg);
      const index = (arg as { index: number }).index;
      const s = stepsOf(a, code);
      if (!(index >= 0 && index < s.groups.length)) return;
      writeSteps(a, code, true, s.groups.filter((_, k) => k !== index));
    },
  });
  let frame = 0;
  const later = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      numberLines(app);
      paint(app);
    });
  };
  const refresh = () => {
    numberLines(app);
    later();
  };
  let pending: { code: Element; before: string; finish: () => void } | null = null;
  const settle = () => {
    const p = pending;
    if (!p) return;
    pending = null;
    try {
      const s = stepsOf(app, p.code);
      const groups = shiftGroups(s.groups, p.before, p.code.textContent ?? '');
      if (groups.join('|') !== s.groups.join('|')) writeSteps(app, p.code, true, groups);
    } finally {
      p.finish();
    }
  };
  window.addEventListener('beforeinput', (ev) => {
    const host = app.hostOf(ev.target);
    const code = host?.closest('pre')?.querySelector(':scope > code') ?? null;
    if (!host || !code || pending) return;
    if (codeAt(app, { el: code }) && stepsOf(app, code).groups.length && addsOrDeletesLines(ev)) {
      let finish = () => {};
      const done = new Promise<void>((d) => (finish = d));
      pending = { code, before: code.textContent ?? '', finish };
      void app.history.transact('typing', () => done).catch((e) => app.fail(e));
      setTimeout(settle, 0);
    }
    if (ev.inputType === 'insertParagraph' || ev.inputType === 'insertLineBreak') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      app.history.break();
      app.history.beforeTyping(host);
      insertPlain(host, `\n${indentAt(code)}`);
    }
  }, true);
  window.addEventListener('input', settle);
  app.onRefresh(['content', 'slide', 'structure'], refresh);
  app.listen('slide', later);
  document.addEventListener('input', later, true);
  later();
}
