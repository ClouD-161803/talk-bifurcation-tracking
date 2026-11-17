// the commands of the formulas: Inline Formula at the caret of a text, Edit Formula…, the TeX of
// the Formula pane, Hold Through the Next Step of a display, and the color of a symbol or of words
// at a step. words are colored as a symbol is, in a span of a class that starts with hl-. a symbol
// is colored as AGENTS.md describes stepped math: its part of the TeX is marked as
// \class{name}{…}, and a fragment of a later step is given data-highlight with the name and
// data-tone with its tone, orange being the default without data-tone. the step is chosen in the
// step model of steps.ts, and an element shown with the slide can be made the new last step for
// it. each command is one entry of the history, written through app.doc

import type { App } from '../app.ts';
import { HOST } from '../app.ts';
import { classesIn, mathLookup, suggestName, unwrapClass, wrapClass } from '../math.ts';
import { isRuntimeClass } from '../render.ts';
import { textTarget } from '../text/elements.ts';
import { around, edit, formatted, inlineTargets, setFormat } from '../text/inline.ts';
import { setStep, stepAt } from '../shown-steps.ts';
import { describe, modelOf, writePlan, type Model } from '../steps.ts';
import { openInsert, sheetTarget } from '../text/mathpop.ts';
import { openContextMenu } from '../ui/menu.ts';

export type Tone = 'accent' | 'violet' | 'blue' | 'red';
export const TONES: [Tone, string][] = [['accent', 'Orange'], ['violet', 'Violet'], ['blue', 'Blue'], ['red', 'Red']];

// the inline formula focused last in a text, by its text element and its place among the formulas of the
// text element, since a formula is replaced by a new container when its text element is typeset again
let focused: { host: Element; index: number } | null = null;
// the formula of the context menu that is open, which Edit Formula… of this menu edits
let pointed: Element | null = null;

// the mjx-container of the formula of the selection: the formula of the open sheet, a selected
// div.math, the formula of a div.math with the caret, or the inline formula focused last in the
// text with the caret
export function formulaOf(app: App): Element | null {
  const open = sheetTarget();
  if (open?.isConnected && app.hostOf(open)) return open;
  const sel = app.selection;
  if (pointed?.isConnected && sel.items.length === 1 && sel.items[0].contains(pointed)) return pointed;
  const only = sel.only();
  if (only?.matches('div.math')) return only.querySelector('mjx-container');
  if (sel.kind !== 'text') return null;
  const host = sel.items[0];
  if (host.matches('div.math')) return host.querySelector('mjx-container');
  if (focused?.host === host) return host.querySelectorAll('mjx-container')[focused.index] ?? null;
  return null;
}

// the display around a formula, which can be a step and be held
export const displayOf = (container: Element | null): Element | null => container?.closest('div.math') ?? null;

// the text with the caret into which an inline formula can be put: not a display, a code box, or
// the notes
function inlineHost(app: App): Element | null {
  const sel = app.selection;
  if (sel.kind !== 'text') return null;
  const host = sel.items[0];
  if (!host.isConnected || host.matches('div.math') || host.closest('pre, code, aside.notes')) return null;
  return app.current()?.contains(host) ? host : null;
}

// the caret of the selection of the page in host, or the end of host
function caretIn(host: Element): Range {
  const sel = window.getSelection();
  if (sel?.rangeCount) {
    const r = sel.getRangeAt(0);
    if (host.contains(r.startContainer) && host.contains(r.endContainer)) return r.cloneRange();
  }
  const r = document.createRange();
  r.selectNodeContents(host);
  r.collapse(false);
  return r;
}

// a step of the slide at which a symbol can be colored, i.e. a step after the step of its
// formula, with the elements shown at it. an element of with is shown with the slide and is made
// the last step
export type ColorStep = { step: number; label: string; els: Element[] } | { step: null; label: string; with: Element };

const words = (s: string | null | undefined): string[] => (s ?? '').split(/\s+/).filter(Boolean);

// the item of the model whose element holds the formula
function itemOfFormula(m: Model, container: Element): number {
  return m.els.findIndex((el) => el.contains(container));
}

export function colorSteps(app: App, container: Element): ColorStep[] {
  const m = modelOf(app, container.closest('section'));
  if (!m) return [];
  const own = itemOfFormula(m, container);
  const from = own >= 0 ? stepAt(m.plan, own) : -1;
  const out: ColorStep[] = [];
  m.plan.groups.forEach((g, k) => {
    if (k <= from) return;
    const els = g.filter((i) => !m.locked[i] && !m.els[i].contains(container)).map((i) => m.els[i]);
    if (!els.length) return;
    const d = describe(els[0], (el) => mathLookup()(el)?.tex ?? null);
    out.push({ step: k, label: `Step ${k + 1}: ${d.kind}, ${d.text}`, els });
  });
  const textEl = displayOf(container) ?? container.closest(HOST);
  m.els.forEach((el, i) => {
    if (m.locked[i] || stepAt(m.plan, i) >= 0 || el.contains(container) || el.matches('h1, h2, h3, .foot')) return;
    if (textEl && !(textEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    const d = describe(el, (e) => mathLookup()(e)?.tex ?? null);
    out.push({ step: null, label: `New Step: ${d.kind}, ${d.text}`, with: el });
  });
  return out;
}

// the tone of a fragment, orange without data-tone
const toneOf = (app: App, el: Element): Tone => {
  const t = app.doc.tagState(el).attrs['data-tone'];
  return t === 'violet' || t === 'blue' || t === 'red' ? t : 'accent';
};

const highlightOf = (app: App, el: Element): string[] => words(app.doc.tagState(el).attrs['data-highlight']);

const fragments = (app: App, slide: Element): Element[] => [...slide.querySelectorAll('[data-highlight]')].filter((el) => !!app.pairing?.elements.get(el)?.open);

// the paired fragments of slide that color name
const fragmentsColoring = (app: App, slide: Element, name: string): Element[] => fragments(app, slide).filter((el) => highlightOf(app, el).includes(name));

// the tone and the step of the fragment of slide that colors name, null for a class without one
function colorOf(app: App, slide: Element, m: Model | null, name: string): { tone: Tone | null; step: number | null } {
  const f = fragmentsColoring(app, slide, name)[0];
  const i = f && m ? m.els.indexOf(f) : -1;
  return { tone: f ? toneOf(app, f) : null, step: m && i >= 0 && stepAt(m.plan, i) >= 0 ? stepAt(m.plan, i) : null };
}

// the colored symbols of a formula: the name, the body, and the tone and step of the fragment that
// colors it, or null for a class that is not colored by any step
export type Colored = { name: string; body: string; start: number; end: number; tone: Tone | null; step: number | null };

export function coloredOf(app: App, container: Element): Colored[] {
  const info = mathLookup()(container);
  const slide = container.closest('section');
  if (!info || !slide) return [];
  const m = modelOf(app, slide);
  const seen = new Set<string>();
  return classesIn(info.tex).filter((c) => !seen.has(c.name) && !!seen.add(c.name)).map((c) => ({ name: c.name, body: c.body, start: c.bodyStart, end: c.end - 1, ...colorOf(app, slide, m, c.name) }));
}

// the edit of the tag of el that sets its highlighted names and its tone. a fragment without a name
// left loses its tone as well
function highlightEdit(names: string[], tone: Tone | null): { attrs: Record<string, string | null> } {
  if (!names.length) return { attrs: { 'data-highlight': null, 'data-tone': null } };
  return { attrs: { 'data-highlight': names.join(' '), 'data-tone': tone && tone !== 'accent' ? tone : null } };
}

// the step and the tone of a color: a step of the model, or with for the element made the new last
// step
export type StepArg = { tone: Tone; step: number | null; with?: Element };
export type ColorArg = StepArg & { el?: Element; tex?: string; start: number; end: number; name?: string };

// the classes of slide and the names that its fragments highlight, which a new name must not take
function taken(slide: Element): Set<string> {
  const out = new Set<string>();
  for (const c of slide.querySelectorAll('mjx-container')) for (const k of classesIn(mathLookup()(c)?.tex ?? '')) out.add(k.name);
  for (const f of slide.querySelectorAll('[data-highlight]')) for (const n of words(f.getAttribute('data-highlight'))) out.add(n);
  for (const el of slide.querySelectorAll('[class]')) for (const c of el.classList) out.add(c);
  return out;
}

// name colored in arg.tone at arg.step of slide, by a fragment of the step that does not hold an
// element of own, once mark has given the elements of own the class. a fragment of the step that
// colors other names in another tone is refused, since a step has one color
async function colorAt(app: App, slide: Element, own: Element[], name: string, arg: StepArg, mark: () => unknown): Promise<void> {
  const m = modelOf(app, slide);
  if (!m) throw new Error('The slide does not have steps');
  let target: Element | null = null;
  if (arg.step === null) {
    if (!arg.with || !m.els.includes(arg.with)) throw new Error('Choose the element of the new step');
    target = arg.with;
  } else {
    const group = m.plan.groups[arg.step];
    if (!group) throw new Error(`The slide does not have a step ${arg.step + 1}`);
    const els = group.filter((i) => !m.locked[i] && !own.some((o) => m.els[i].contains(o))).map((i) => m.els[i]);
    const fits = (el: Element) => highlightOf(app, el).every((n) => n === name) || toneOf(app, el) === arg.tone;
    target = els.find((el) => fits(el) && highlightOf(app, el).length) ?? els.find(fits) ?? null;
    if (!target) {
      const other = TONES.find(([t]) => t === toneOf(app, els[0]))?.[1] ?? 'another color';
      throw new Error(`Step ${arg.step + 1} colors its symbols in ${other}, and a step has one color. Choose ${other} or another step`);
    }
  }
  await mark();
  if (arg.step === null) {
    const now = modelOf(app, slide)!;
    writePlan(app, now, setStep(now.plan, now.els.indexOf(target), 'last'));
  }
  for (const f of fragmentsColoring(app, slide, name)) {
    if (f === target) continue;
    const rest = highlightOf(app, f).filter((n) => n !== name);
    app.doc.setTag(f, highlightEdit(rest, toneOf(app, f)), 'color');
  }
  const names = [...highlightOf(app, target).filter((n) => n !== name), name];
  app.doc.setTag(target, highlightEdit(names, arg.tone), 'color');
}

// name taken out of the fragments of slide once no element of the slide has the class any more
function dropName(app: App, slide: Element, name: string): void {
  if (slide.querySelector(`.${CSS.escape(name)}`)) return;
  for (const f of fragmentsColoring(app, slide, name)) {
    app.doc.setTag(f, highlightEdit(highlightOf(app, f).filter((n) => n !== name), toneOf(app, f)), 'color');
  }
}

async function color(app: App, arg: ColorArg): Promise<void> {
  const container = arg.el ?? formulaOf(app);
  const info = container ? mathLookup()(container) : null;
  const slide = container?.closest('section');
  if (!container || !info || !slide) throw new Error('Select a formula first');
  const base = arg.tex ?? info.tex;
  const s = Math.min(arg.start, arg.end);
  const e = Math.max(arg.start, arg.end);
  const existing = classesIn(base).find((c) => (c.bodyStart === s && c.end - 1 === e) || (c.start === s && c.end === e));
  const { tex, name } = wrapClass(base, s, e, existing?.name ?? arg.name ?? suggestName(base.slice(s, e), taken(slide)));
  await colorAt(app, slide, [container], name, arg, () => tex !== info.tex && app.math.setMath(container, tex));
}

// the class of name taken out of the TeX of the formula, and out of the fragments of its slide once
// no element of the slide has the class any more
async function uncolor(app: App, arg: { el?: Element; name: string }): Promise<void> {
  const container = arg.el ?? formulaOf(app);
  const info = container ? mathLookup()(container) : null;
  const slide = container?.closest('section');
  if (!container || !info || !slide) throw new Error('Select a formula first');
  const tex = unwrapClass(info.tex, arg.name);
  if (tex !== info.tex) await app.math.setMath(container, tex);
  dropName(app, slide, arg.name);
}

// a span around words with a class that a fragment of its slide highlights
const wordSpan = (app: App, slide: Element) => {
  const names = new Set(fragments(app, slide).flatMap((f) => highlightOf(app, f)));
  return (el: Element): string[] => (el.localName === 'span' ? [...el.classList].filter((c) => names.has(c)) : []);
};

// the spans of words colored at a step that the selection touches, i.e. its words, the word at its
// caret, or the whole text of each selected text element, with their highlighted classes
function wordSpans(app: App): [Element, string[]][] {
  const t = textTarget(app);
  const targets = inlineTargets(app, false, true);
  const out: [Element, string[]][] = [];
  for (const { host, range } of targets.length ? targets : t ? [t] : []) {
    const slide = host.closest('section');
    const names = slide && wordSpan(app, slide);
    if (names) for (const s of host.querySelectorAll('span')) if (names(s).length && range.intersectsNode(s)) out.push([s, names(s)]);
  }
  return out;
}

// the colors at a step of the words of the selection, by class, as coloredOf gives those of a formula
export function wordColors(app: App): { name: string; body: string; tone: Tone | null; step: number | null }[] {
  const seen = new Set<string>();
  const models = new Map<Element, Model | null>();
  return wordSpans(app).flatMap(([s, names]) => names.filter((n) => !seen.has(n) && !!seen.add(n)).map((name) => {
    const slide = s.closest('section')!;
    if (!models.has(slide)) models.set(slide, modelOf(app, slide));
    return { name, body: s.textContent!.trim(), ...colorOf(app, slide, models.get(slide)!, name) };
  }));
}

// the words of the selection colored at a step. words in one span of a color at a step keep its
// class, as a marked symbol keeps its class, and else they are wrapped in a span of a new class
async function colorWords(app: App, arg: StepArg): Promise<void> {
  const targets = inlineTargets(app);
  const slide = targets[0]?.host.closest('section');
  if (!slide) throw new Error('Select words first');
  const names = wordSpan(app, slide);
  const kept = names(around(targets[0].host, targets[0].range.startContainer, (el) => names(el).length > 0) ?? targets[0].host)
    .find((c) => targets.every((t) => formatted(t.host, t.range, (el) => el.localName === 'span' && el.classList.contains(c))));
  const stems = [...taken(slide)].filter((c) => c.startsWith('hl-')).map((c) => c.slice(3)).concat(['target', 'accent', 'violet', 'blue', 'red']);
  const name = kept ?? `hl-${suggestName(targets.map((t) => t.range.toString()).join(' '), stems)}`;
  await colorAt(app, slide, targets.map((t) => t.host), name, arg, () => {
    if (!kept) edit(app, targets, (host, range) => setFormat(host, range, () => false, () => {
      const span = document.createElement('span');
      span.className = name;
      return span;
    }));
  });
}

// the class of name, or every highlighted class, taken off the spans of words that the selection
// touches. a span left without a class of the file is unwrapped
async function uncolorWords(app: App, name?: string): Promise<void> {
  const spans = wordSpans(app).filter(([, n]) => !name || n.includes(name));
  const slide = spans[0]?.[0].closest('section');
  if (!slide) return;
  const gone = name ? [name] : [...new Set(spans.flatMap(([, n]) => n))];
  const hosts = [...new Set(spans.map(([s]) => app.hostOf(s)).filter((h): h is Element => !!h))];
  edit(app, hosts.map((host) => {
    const range = document.createRange();
    range.selectNodeContents(host);
    return { host, range };
  }), (host) => spans.filter(([s]) => host.contains(s)).flatMap(([s]) => {
    for (const c of [...s.classList]) if (gone.includes(c) || isRuntimeClass(c)) s.classList.remove(c);
    if (s.classList.length) return [s];
    const kids = [...s.childNodes];
    s.replaceWith(...kids);
    return kids;
  }));
  for (const n of gone) dropName(app, slide, n);
}

export function install(app: App): void {
  const c = app.commands;

  // the colors of the classes of a slide are applied by applySteps of src/steps.ts, which
  // beeson.js runs again for the slide of a beeson:plot-drawn event. a formula typeset again, or a
  // highlight written or undone, thus gets its color back
  app.onRefresh(['content', 'structure'], () => {
    const slide = app.current();
    if (slide?.querySelector('[data-highlight]')) slide.dispatchEvent(new CustomEvent('beeson:plot-drawn', { bubbles: true }));
  });

  // the inline formula focused last in a text is kept while the focus is in the inspector or the
  // sheet, and dropped once the caret is in the text again
  document.addEventListener('focusin', (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    if (!target) return;
    const host = app.hostOf(target);
    if (target.matches('mjx-container') && host) focused = { host, index: [...host.querySelectorAll('mjx-container')].indexOf(target) };
    else if (host || target.closest('.reveal')) focused = null;
  });

  // a right-click on a formula outside a table selects the object around it and opens its element
  // menu, or the menu of the text that is edited around it, in place of the menu of MathJax. the
  // right press does not focus the formula, since a focused formula is taken for its text
  const formulaAt = (ev: MouseEvent): Element | null => {
    const f = ev.target instanceof Element ? ev.target.closest('mjx-container') : null;
    return f && app.hostOf(f) && !f.closest('td, th') ? f : null;
  };
  document.addEventListener('mousedown', (ev) => {
    if ((ev.button === 2 || (ev.ctrlKey && app.platform === 'mac')) && formulaAt(ev)) ev.preventDefault();
  }, true);
  window.addEventListener('pointerdown', (ev) => {
    if (!(ev.target instanceof Element && ev.target.closest('.beeson-edit-menu'))) pointed = null;
  }, true);
  document.addEventListener('contextmenu', (ev) => {
    const f = formulaAt(ev);
    pointed = null;
    const el = f && app.move.movableOf(f);
    if (!f || !el) return;
    ev.preventDefault();
    ev.stopPropagation();
    const host = app.hostOf(f);
    const text = app.selection.kind === 'text' && app.selection.items[0] === host;
    if (!text && !app.selection.has(el)) app.selection.set('elements', [el]);
    pointed = f;
    openContextMenu(app, text ? 'text' : 'element', text ? host : el, { x: ev.clientX, y: ev.clientY });
  }, true);

  // an inline formula at the caret of a text. its key, Keynote's key of Insert Equation on a Mac and
  // PowerPoint's on Windows, is bound to insert.formula of commands/insert.ts, which runs this
  // command in a text and puts a display on the canvas
  c.define({
    id: 'math.inline',
    label: 'Inline Formula',
    in: ['text'],
    menu: { bar: 'Insert', group: 'element', order: 22.8 },
    context: ['text'],
    enabled: (a) => !!inlineHost(a) && a.region() !== 'dialog',
    run: (a) => {
      const host = inlineHost(a);
      if (host) openInsert(a, host, caretIn(host));
    },
  });
  c.define({
    id: 'math.edit',
    label: 'Edit Formula…',
    context: ['element', 'text'],
    enabled: (a) => !!formulaOf(a) && !a.math.isOpen(),
    run: (a) => {
      const f = formulaOf(a);
      if (f) a.math.open(f);
    },
  });
  // the TeX of the Formula pane, for the formula given in el
  c.define({
    id: 'math.tex',
    label: 'Formula',
    undoable: true,
    run: async (a, arg) => {
      const { el, tex } = arg as { el?: Element; tex: string };
      const target = el?.isConnected ? el : formulaOf(a);
      if (!target) throw new Error('Select a formula first');
      await a.math.setMath(target, tex);
    },
  });
  c.define({
    id: 'math.hold',
    label: 'Hold Through the Next Step',
    enabled: (a) => {
      const d = displayOf(formulaOf(a));
      return !!d && !!a.pairing?.elements.get(d)?.open;
    },
    checked: (a) => {
      const d = displayOf(formulaOf(a));
      return !!d && !!a.pairing?.elements.get(d)?.open && 'data-keep' in a.doc.tagState(d).attrs;
    },
    undoable: true,
    run: (a) => {
      const d = displayOf(formulaOf(a));
      if (!d) return;
      const on = 'data-keep' in a.doc.tagState(d).attrs;
      a.doc.setTag(d, { attrs: { 'data-keep': on ? null : '' } }, 'hold');
    },
  });
  c.define({
    id: 'math.color',
    label: 'Color Symbol at Step',
    enabled: (a) => !!formulaOf(a),
    undoable: true,
    run: (a, arg) => color(a, arg as ColorArg),
  });
  // Color at a Step… of Format > Text Color shows the steps of the Text pane, whose swatches run it
  // with a StepArg
  c.define({
    id: 'text.color',
    label: 'Color at a Step…',
    in: ['text', 'canvas'],
    menu: { bar: 'Format', group: 'step', order: 47, submenu: 'Text Color' },
    undoable: true,
    undo: 'Color Words at Step',
    enabled: (a) => inlineTargets(a).length > 0,
    run: async (a, arg) => {
      if (arg) return colorWords(a, arg as StepArg);
      const { showFormat } = await import('../inspector/inspector.ts');
      showFormat(a, 'text');
      document.querySelector<HTMLElement>('#beeson-edit-panel-format [aria-label="Step of the color"]:not(:disabled)')?.click();
    },
  });
  c.define({
    id: 'text.uncolor',
    label: 'Remove Color at Step',
    in: ['text', 'canvas'],
    menu: { bar: 'Format', group: 'step', order: 48, submenu: 'Text Color' },
    undoable: true,
    enabled: (a) => wordSpans(a).length > 0,
    run: (a, arg) => uncolorWords(a, (arg as { name?: string } | undefined)?.name),
  });
  c.define({
    id: 'math.uncolor',
    label: 'Remove Color of Symbol',
    enabled: (a) => !!formulaOf(a),
    undoable: true,
    run: (a, arg) => uncolor(a, arg as { el?: Element; name: string }),
  });
}
