import type { App } from '../app.ts';
import { TONES as STEP_TONES, colorSteps, wordColors, type ColorStep } from '../commands/math.ts';
import { deckKinds, theoremOf } from '../commands/text.ts';
import { isShape, toneOfShape } from '../commands/shape.ts';
import { kindOf, listKind, type ListKind, selectedTextElements, startList, styleOf, styleWhy } from '../text/elements.ts';
import { around, FORMATS, inlineTargets, isTone, type FormatName } from '../text/inline.ts';
import { injectStyle, make } from '../ui/dom.ts';
import { closeMenus, menuOpen, openMenu, type MenuItem } from '../ui/menu.ts';
import { GLYPHS, button, entering, glyph, keepFocus, note, numberField, row, section, segmented, textField, type Control, type Run } from './controls.ts';
import { COLOR_CSS, coloredItem, openSteps, stepButton, toneName } from './formula.ts';

Object.assign(GLYPHS, {
  'text-left': ['M3.5 5h13', 'M3.5 8.5h9', 'M3.5 12h13', 'M3.5 15.5h9'],
  'text-center': ['M3.5 5h13', 'M5.5 8.5h9', 'M3.5 12h13', 'M5.5 15.5h9'],
  'bullet-arrow': ['M8 5.5l4.5 4.5L8 14.5'],
  'bullet-dot': ['M10 6.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5z'],
  'bullet-dash': ['M5.5 10h9'],
});

const STYLES = ['body', 'small', 'subheading', 'caption', 'footnote'];
const CASES = ['sentence', 'lower', 'upper', 'title', 'toggle'];
const SVG = 'http://www.w3.org/2000/svg';

const CSS = `
.beeson-edit-inspector .ed-seg .u { font: 14px/1 Georgia, "Times New Roman", serif; text-decoration: underline; }
.beeson-edit-inspector .ed-seg .s { font: 14px/1 Georgia, "Times New Roman", serif; text-decoration: line-through; }
.beeson-edit-inspector .ed-btn.painter[aria-pressed="true"] { background: var(--ed-select); color: var(--ed-on-select); }
.beeson-edit-inspector .ed-btn.case .aa { font: 14px/1 Georgia, "Times New Roman", serif; }
.beeson-edit-inspector .ed-seg.bullets button { height: 32px; }
.beeson-edit-inspector .ed-seg.bullets span { display: inline-flex; align-items: center; gap: 6px; }
.beeson-edit-inspector .ed-seg.bullets svg { stroke-width: 2px; }
.beeson-edit-inspector .ed-colored.words .sym { font: 12px/1.3 var(--ed-font); }
`;

function brush(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('beeson-icon');
  for (const [d, fill] of [['M4 3.5h10.5v4H4z', 'none'], ['M14.5 5.5h1.75v4h-6.5v2.5', 'none'], ['M8.5 12h2.5v5h-2.5z', 'currentColor']]) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

function painter(app: App, run: Run): Control {
  const b = make('button', 'ed-btn painter');
  b.type = 'button';
  b.dataset.command = 'text.formatPainter';
  b.title = 'Format Painter';
  b.append(brush(), make('span', '', 'Format Painter'));
  keepFocus(b);
  b.addEventListener('click', (ev) => void run('text.formatPainter', ev.detail === 2 ? { sticky: true } : undefined));
  const sync = () => {
    const s = app.commands.get('text.formatPainter') ? app.commands.state('text.formatPainter') : null;
    b.disabled = !s?.enabled;
    b.setAttribute('aria-pressed', String(!!s?.checked));
  };
  sync();
  return { el: b, sync };
}

function changeCase(app: App): Control {
  const b = make('button', 'ed-btn case');
  b.type = 'button';
  b.title = 'Change Case';
  b.setAttribute('aria-haspopup', 'menu');
  b.append(make('span', 'aa', 'Aa'), make('span', '', 'Change Case'), glyph('chevron-down', 14));
  const ids = CASES.map((c) => `text.case.${c}`).filter((id) => app.commands.get(id));
  const open = (keyboard: boolean) => {
    const items: MenuItem[] = ids.map((command) => ({ command }));
    openMenu(app, items, { anchor: b.getBoundingClientRect(), placement: 'below', owner: b, keyboard, label: 'Change Case', onClose: () => sync() });
  };
  keepFocus(b);
  b.addEventListener('pointerdown', () => open(false));
  b.addEventListener('click', (ev) => {
    if (ev.detail === 0) open(true);
  });
  const sync = () => {
    b.disabled = !ids.some((id) => app.commands.enabled(id));
  };
  sync();
  return { el: b, sync };
}
const TONES: [string, string, string][] = [
  ['text', 'Text', '--text'],
  ['subtle', 'Subtle', '--subtle'],
  ['muted', 'Muted', '--muted'],
  ['accent', 'Accent', '--accent'],
  ['violet', 'Violet', '--violet'],
  ['blue', 'Blue', '--blue'],
  ['red', 'Red', '--red'],
];

function perText<T>(app: App, value: (host: Element, text: Node) => T): T[] | null {
  if (app.selection.kind !== 'elements' || app.selection.elements().length < 2) return null;
  return inlineTargets(app, true).flatMap(({ host, range }) => {
    const out: T[] = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (range.intersectsNode(n) && n.textContent!.trim() && !n.parentElement?.closest('mjx-container')) out.push(value(host, n));
    }
    return out;
  });
}

function formatState(app: App, name: FormatName): () => boolean | 'mixed' | null {
  return () => {
    const on = perText(app, (host, n) => !!around(host, n, FORMATS[name].match));
    if (!on) return app.commands.get(`text.${name}`) ? app.commands.state(`text.${name}`).checked : null;
    return on.length > 0 && on.every(Boolean) ? true : on.some(Boolean) ? 'mixed' : false;
  };
}

const tonesOf = (app: App): Set<string> | null => {
  const shapes = app.selection.elements().filter(isShape);
  const tones = perText(app, (host, n) => (shapes.some((el) => el.contains(host)) ? null : around(host, n, isTone)?.classList[0].slice(5) ?? 'text'));
  return tones && new Set([...tones.filter((t) => t !== null), ...shapes.map(toneOfShape)]);
};

const BULLETS: ListKind[] = ['ul', 'dots', 'dashes'];

function listState(app: App, ...kinds: ListKind[]): () => boolean | 'mixed' | null {
  return () => {
    const els = app.selection.kind === 'elements' ? app.selection.elements() : [];
    if (els.length < 2 || listKind(app) !== null) {
      const ids = kinds.map((k) => `text.list.${k}`).filter((id) => app.commands.get(id));
      return ids.length ? ids.some((id) => app.commands.state(id).checked) : null;
    }
    const found = els.map((el) => (el.matches('ul, ol') ? kindOf(el) : el.localName === 'p' ? 'none' : null));
    return found.includes(null) ? null : found.every((k) => kinds.includes(k!)) ? true : found.some((k) => kinds.includes(k!)) ? 'mixed' : false;
  };
}

function tagName(app: App, textEl?: Element): string {
  const host = textEl ?? (app.selection.kind === 'text' ? app.selection.items[0] : app.selection.only());
  const el = host?.closest('h1, h2, h3, li, td, th, p, div') ?? host;
  switch (el?.localName) {
    case 'h1': return 'Title';
    case 'h2': return 'Heading';
    case 'h3': return 'Subheading';
    case 'li': return 'List Item';
    case 'td': case 'th': return 'Table Cell';
    default: return 'Body';
  }
}

function stylePopup(app: App): Control {
  const b = make('button', 'ed-popup');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-label', 'Paragraph Style');
  b.title = 'Paragraph Style';
  const text = make('span');
  b.append(text, glyph('chevron-down', 16));
  const ids = STYLES.map((s) => `text.style.${s}`).filter((id) => app.commands.get(id));
  const open = (keyboard: boolean) => {
    const items: MenuItem[] = ids.map((command) => ({ command }));
    openMenu(app, items, { anchor: b.getBoundingClientRect(), placement: 'below', owner: b, keyboard, label: 'Paragraph Style', className: 'select', onClose: () => sync() });
  };
  keepFocus(b);
  b.addEventListener('pointerdown', () => open(false));
  b.addEventListener('click', (ev) => {
    if (ev.detail === 0) open(true);
  });
  const sync = () => {
    const on = ids.find((id) => app.commands.state(id).checked);
    const textEls = app.selection.kind === 'elements' && app.selection.elements().length > 1 ? selectedTextElements(app) : [];
    const names = new Set(textEls.map((el) => {
      const s = styleOf(app, el);
      return s && app.commands.get(`text.style.${s}`) ? app.commands.label(`text.style.${s}`) : tagName(app, el);
    }));
    text.textContent = names.size > 1 ? 'Mixed' : on ? app.commands.label(on) : tagName(app);
    b.disabled = !ids.some((id) => app.commands.enabled(id));
    b.title = (b.disabled && styleWhy(app, 'Paragraph Style')) || 'Paragraph Style';
  };
  sync();
  return { el: b, sync };
}

function startField(app: App, run: Run): Control {
  const field = numberField(app, {
    label: 'Start at',
    unit: '',
    refuse: true,
    same: true,
    value: () => startList(app)?.start ?? null,
    enabled: () => app.commands.enabled('text.list.start'),
    why: () => 'Start at is set only on a numbered list',
    command: 'text.list.start',
    commit: (n) => run('text.list.start', { start: n }),
  });
  const input = field.input;
  let typed = false;
  input.addEventListener('focus', () => (typed = false));
  input.addEventListener('input', () => (typed = true));
  const read = (leave: boolean) => {
    const v = Number(input.value.trim().replace(',', '.'));
    if (input.disabled || !input.value.trim()) return false;
    if (!Number.isInteger(v)) input.value = '';
    else if (leave && typed && v === startList(app)?.start) void run('text.list.start', { start: v });
    return !Number.isInteger(v);
  };
  const entry = entering.get(input);
  if (entry) entering.set(input, { ...entry, enter: () => (read(false) ? false : entry.enter()) });
  input.addEventListener('blur', () => read(true), true);
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    read(false);
    typed = false;
  }, true);
  return field;
}

function swatches(app: App, run: Run, step: () => ColorStep | null, fresh: () => ColorStep | null | false): Control {
  const el = make('div', 'ed-swatches');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Text color');
  const buttons = TONES.map(([tone, label, token]) => {
    const b = make('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.dataset.command = `text.tone.${tone}`;
    keepFocus(b);
    b.addEventListener('click', () => {
      const o = fresh();
      if (o === false) return;
      if (!o) return void run(`text.tone.${tone}`);
      void Promise.resolve(run('text.color', { tone, step: o.step, ...(o.step === null ? { with: o.with } : {}) })).then(() => o.step === null && (fresh(), sync()));
    });
    el.append(b);
    return { b, tone, token };
  });
  const sync = () => {
    const slide = app.current() ?? document.querySelector('.reveal');
    const style = slide ? getComputedStyle(slide) : null;
    const tones = tonesOf(app);
    const o = step();
    const at = o && wordColors(app).filter((c) => c.step === o.step);
    for (const { b, tone, token } of buttons) {
      const id = at ? 'text.color' : `text.tone.${tone}`;
      const s = app.commands.get(id) ? app.commands.state(id) : null;
      b.style.setProperty('--swatch', style?.getPropertyValue(token).trim() || 'transparent');
      b.disabled = !s?.enabled || (!!at && !STEP_TONES.some(([t]) => t === tone));
      const on = at ? String(at.some((c) => c.tone === tone)) : tones && tones.size > 1 ? (tones.has(tone) ? 'mixed' : 'false') : String(!!s?.checked);
      b.setAttribute('aria-pressed', b.disabled ? 'false' : on);
    }
  };
  sync();
  return { el, sync };
}

function colorStep(app: App, run: Run, changed: () => void): { step: () => ColorStep | null; fresh: () => ColorStep | null | false; parts: Control[] } {
  let options: ColorStep[] = [];
  let chosen: string | null = null;
  const step = () => options.find((o) => o.label === chosen) ?? null;
  const anchor = (): Element | undefined => {
    const els = app.selection.kind === 'text' ? app.selection.items : app.selection.elements();
    return els[els.length - 1];
  };
  const read = () => {
    const a = anchor();
    options = a?.isConnected ? colorSteps(app, a) : [];
  };
  const first = (o: ColorStep) => (o.step === null ? o.with : o.els[0]);
  const fresh = (): ColorStep | null | false => {
    const was = step();
    if (!was) return null;
    read();
    const made = was.step === null ? was.with : null;
    const o = options.find((o) => o.step === was.step && first(o) === first(was)) ?? options.find((o) => o.step !== null && !!made && o.els.includes(made)) ?? null;
    chosen = o?.label ?? null;
    sync();
    if (!o) app.fail(new Error('The step of the color is not a step of the slide any more'));
    return o ?? false;
  };
  const { el, text } = stepButton((keyboard) => (read(), openSteps(app, el, keyboard, options, step(), (o) => ((chosen = o?.label ?? null), sync(), changed()), true)));
  const list = make('ul', 'ed-colored words');
  list.setAttribute('aria-label', 'Words colored at a step');
  const sync = () => {
    const o = step();
    if (o && !(o.step === null ? [o.with] : o.els).every((e) => e.isConnected)) chosen = null;
    text.textContent = step()?.label ?? 'From the Start';
    el.disabled = !app.commands.enabled('text.color');
    const colored = wordColors(app);
    if (!colored.length && list.hidden) return;
    list.hidden = !colored.length;
    list.replaceChildren(...colored.map((c) => coloredItem(app, c, c.step === null ? 'not colored' : `${toneName(c.tone ?? 'accent')}, Step ${c.step + 1}`, () => void run('text.uncolor', { name: c.name }), 'text.uncolor')));
  };
  list.hidden = true;
  sync();
  return { step, fresh, parts: [row([{ el, sync }], 'Step'), { el: list, sync: () => {} }] };
}

const script = (base: string, mark: string, tag: 'sup' | 'sub') => () => {
  const span = make('span', 'script', base);
  span.append(make(tag, '', mark));
  return span;
};

function theoremSection(app: App, run: Run, el: HTMLElement): Control {
  const kind = () => el.getAttribute('data-kind') || 'theorem';
  const b = make('button', 'beeson-edit-select ed-theorem-kind');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-label', 'Kind');
  const text = make('span', 'value');
  b.append(text, glyph('chevron-down', 14));
  const open = (keyboard: boolean) => {
    const items = Object.entries(deckKinds()).map(([k, { title }]) => ({ label: title, checked: kind() === k, run: () => void run('theorem.kind', { el, value: k }) }));
    openMenu(app, items, { anchor: b.getBoundingClientRect(), placement: 'below', owner: b, keyboard, label: 'Kind', className: 'select' });
  };
  b.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (menuOpen() && b.getAttribute('aria-expanded') === 'true') closeMenus();
    else open(false);
  });
  b.addEventListener('click', (ev) => {
    if (ev.detail === 0) open(true);
  });
  const known = () => Object.hasOwn(deckKinds(), kind());
  const pop: Control = {
    el: b,
    sync: () => {
      b.disabled = !el.isConnected;
      text.textContent = known() ? deckKinds()[kind()].title : kind();
    },
  };
  pop.sync();
  return section('Theorem', [
    row([pop], 'Kind'),
    textField(app, { label: 'Name', name: 'theorem-name', placeholder: 'None', value: () => el.getAttribute('data-name') ?? '', enabled: () => el.isConnected, commit: (value) => run('theorem.name', { el, value }) }),
    note(() => (known() ? '' : `The kind ${kind()} is not defined in the preamble.`), () => true),
  ]);
}

export function textPane(app: App, run: Run): Control[] {
  injectStyle('inspector-text', CSS);
  injectStyle('inspector-color', COLOR_CSS);
  const theorem = theoremOf(app);
  let tones: Control | null = null;
  const color = colorStep(app, run, () => tones?.sync());
  tones = swatches(app, run, color.step, color.fresh);
  const bulleted = listState(app, ...BULLETS);
  const bullet = (kind: ListKind, title: string, icon: string) => ({ command: `text.list.${kind}`, title, text: () => {
    const s = make('span', '', title);
    s.prepend(glyph(icon, 20));
    return s;
  }, pressed: listState(app, kind), off: () => (bulleted() === true ? null : 'A bullet is chosen only for a bulleted list') });
  return [
    stylePopup(app),
    ...(theorem ? [theoremSection(app, run, theorem)] : []),
    section(null, [row([painter(app, run)])]),
    section('Font', [
      row([segmented(app, run, [
        { command: 'text.bold', text: () => make('span', 'b', 'B'), title: 'Bold', pressed: formatState(app, 'bold') },
        { command: 'text.italic', text: () => make('span', 'i', 'I'), title: 'Italic', pressed: formatState(app, 'italic') },
        { command: 'text.underline', text: () => make('span', 'u', 'U'), title: 'Underline', pressed: formatState(app, 'underline') },
        { command: 'text.strike', text: () => make('span', 's', 'S'), title: 'Strikethrough', pressed: formatState(app, 'strike') },
        { command: 'text.code', text: () => make('span', 'mono', '{ }'), title: 'Code', pressed: formatState(app, 'code') },
        { command: 'text.superscript', text: script('x', '2', 'sup'), title: 'Superscript', pressed: formatState(app, 'superscript') },
        { command: 'text.subscript', text: script('x', '2', 'sub'), title: 'Subscript', pressed: formatState(app, 'subscript') },
      ], 'Font')]),
      row([segmented(app, run, [
        { command: 'text.smaller', icon: 'minus', text: 'Smaller' },
        { command: 'text.bigger', icon: 'plus', text: 'Bigger' },
      ], 'Size')], 'Size'),
      row([changeCase(app)], 'Case'),
    ]),
    section('Text Color', [row([tones]), ...color.parts]),
    section('Alignment', [row([segmented(app, run, [
      { command: 'text.align.left', icon: 'text-left', title: 'Align Left' },
      { command: 'text.align.center', icon: 'text-center', title: 'Center' },
    ], 'Alignment')])]),
    section('Bullets & Lists', [
      row([segmented(app, run, [
        { command: 'text.list.none', text: 'Paragraphs', title: 'Paragraphs', pressed: listState(app, 'none') },
        { command: 'text.list.ul', text: 'Bullets', title: 'Bullets', pressed: bulleted, click: () => (bulleted() === true ? undefined : run('text.list.ul')) },
        { command: 'text.list.ol', text: 'Numbers', title: 'Numbers', pressed: listState(app, 'ol') },
      ], 'List')]),
      row([segmented(app, run, [bullet('ul', 'Arrows', 'bullet-arrow'), bullet('dots', 'Dots', 'bullet-dot'), bullet('dashes', 'Dashes', 'bullet-dash')], 'Bullet', 'bullets')]),
      row([segmented(app, run, [
        { command: 'text.outdent', icon: 'outdent', title: 'Decrease Indent Level' },
        { command: 'text.indent', icon: 'indent', title: 'Increase Indent Level' },
      ], 'Indent level')], 'Indent'),
      row([startField(app, run)]),
    ]),
    section('Link', [
      row([
        button(app, run, { command: 'text.link', icon: 'link', text: 'Link…' }),
        button(app, run, { command: 'text.removeLink', text: 'Remove Link' }),
      ]),
      row([button(app, run, { command: 'text.clear', text: 'Clear Formatting' })]),
    ]),
  ];
}
