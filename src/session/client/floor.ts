import type { App } from '../../editor/app.ts';
import type { Command } from '../../editor/commands.ts';
import { bubble, ready } from './bubble.ts';
import type { Client } from './client.ts';
import { bdi } from './dom.ts';
import { presenceOf, type Presence, type Resolved } from './presence.ts';

const SLIDE = new Set(['slide.cut', 'slide.delete', 'slide.draft', 'slide.hide', 'slide.layoutChooser', 'slide.moveDown', 'slide.moveUp', 'slide.moveTo', 'slide.moveSection', 'slide.reset']);
const OF_SLIDES = new Set(['edit.cut', 'element.delete']);
const OF_TEXT = new Set(['element.delete', 'text.bigger', 'text.smaller', 'text.indent', 'text.outdent', 'text.joinBackward', 'text.joinForward', 'text.newParagraph']);
const OF_SPAN = new Set(['text.flow.delete', 'text.flow.newParagraph']);
const BESIDE = new Set(['text.joinBackward', 'text.joinForward', 'text.indent']);
const PASS = /^(view|zoom|go|help|window|file|navigate|selection|shell|toolbar)\.|^edit\.(copy|spelling|startSpeaking|stopSpeaking)$|^find\.(open|next|previous|close|useSelection|matchCase|wholeWords|tex|scope\w+)$|^slide\.(new|newAfter|newSection|copy|selectAll|previewTransition|guides\.copy|duplicate|gallery)$|^slide\.(new|transition)\.|^notes\.zoom|^(preview\.(slide|steps|backdrop|selectBackdrop)|steps\.(preview|playFrom)|backdrop\.preview)$|^play(\.(presenter|customizePresenter|rehearse|useTimings|clearTimings))?$|^insert\.(?!citation$)|^text\.(copyStyle|bold|italic|code|strike|superscript|subscript|tone\.[\w-]+|link|removeLink|clear)$|^table\.(selectRow|selectColumn|selectTable|editCell)$/;

export const refusal = (by: Resolved): (string | Node)[] => [bdi(by.name), ' is typing here. You can do this once they leave it or stop for 30 s.'];

export function install(client: Client): void {
  const presence = presenceOf(client);
  if (!presence) return;
  const { app } = client;
  ready();

  let picked: Element | null = null;
  const pickInside = (ev: PointerEvent, target: Element): void => {
    if (!presence.holds.size || ev.button !== 0 || ev.shiftKey || ev.metaKey || ev.ctrlKey || app.hostOf(target)) return;
    let up = target.parentElement;
    while (up && !presence.holderOf(up)) up = up.parentElement;
    const child = up && client.shell.presence.childIn(up, target);
    if (child && !presence.holderOf(child) && !app.selection.elements().some((s) => child.contains(s))) {
      app.selection.set('elements', [child]);
      picked = child;
    }
  };
  const unpick = (): void => {
    const child = picked;
    picked = null;
    const [only, more] = app.selection.elements();
    if (child && only && !more && only !== child && child.contains(only)) app.selection.set('elements', [child]);
  };
  const pressed = (ev: Event): void => {
    const target = ev.target instanceof Element ? ev.target : null;
    if (ev.type === 'pointerdown') picked = null;
    if (ev.type === 'click') unpick();
    if (target && ev.type === 'pointerdown') pickInside(ev as PointerEvent, target);
  };
  for (const type of ['pointerdown', 'click']) window.addEventListener(type, pressed, true);

  const numbersOf = (el: Element): number[] => {
    const s = el.closest('.reveal .slides > section:not([data-visibility=hidden])');
    return s ? [client.shell.slides.numberOf(s)] : [];
  };
  app.commands.refuse((a: App, c: Command, arg?: unknown) => {
    const by = refused(a, presence, client.shell.presence.spanned, c, arg);
    const el = by?.caret?.el;
    if (!by || !el) return false;
    if (app.current()?.contains(el)) bubble(el, refusal(by));
    else bubble(null, [bdi(by.name), ` is typing${client.shell.onSlides(numbersOf(el))}. You can do this once they leave it or stop for 30 s.`]);
    return true;
  });
  app.history.refused = (entry, way) => {
    const here = entry.els?.find((el) => app.current()?.contains(el)), other = entry.els?.[0];
    bubble(here?.getClientRects().length ? here : null, `Your typing${other?.closest('aside.notes') ? ' in the speaker notes' : ''}${client.shell.onSlides(here || !other ? [] : numbersOf(other))} cannot be ${way === 'undo' ? 'undone' : 'redone'} without changing the letters of another person.`);
  };
}

function refused(app: App, presence: Presence, spanned: () => Element[], c: Command, arg: unknown): Resolved | null {
  const holds = presence.holds;
  if (!holds.size) return null;
  if (c.id === 'slide.moveSection') return holds.values().next().value ?? null;
  const sel = app.selection;
  const holding = (slides: readonly Element[]): Resolved | null => {
    for (const [el, by] of holds) if (slides.some((s) => s.contains(el))) return by;
    return null;
  };
  const moved = (arg as { slides?: unknown } | undefined)?.slides;
  if (c.id === 'slide.moveTo' && Array.isArray(moved)) return holding(moved.filter((s): s is Element => s instanceof Element));
  if (SLIDE.has(c.id) || c.id.startsWith('slide.layout.') || (sel.kind === 'slides' && OF_SLIDES.has(c.id))) {
    const current = app.current();
    return holding(sel.kind === 'slides' ? sel.items : current ? [current] : []);
  }
  if (c.id === 'edit.undo' || c.id === 'edit.redo') {
    const entry = c.id === 'edit.undo' ? app.history.last : app.history.next;
    const parts = entry ? app.history.partsOf(entry) : [];
    const transaction = parts.length !== 1 || parts[0] !== entry;
    for (const part of parts) {
      for (const el of part.touches ?? []) {
        const by = presence.holderOf(el, !part.parents?.includes(el));
        if (by) return by;
      }
      for (const el of transaction ? (part.els ?? []) : []) {
        const by = presence.holderOf(el, false);
        if (by) return by;
      }
      for (const el of part.detaches ?? []) {
        const by = presence.holderOf(el);
        if (by) return by;
      }
    }
    return null;
  }
  const cell = (arg as { cell?: unknown } | null | undefined)?.cell;
  const table = (cell instanceof Element ? cell : sel.kind === 'text' ? sel.items[0] : null)?.closest('table');
  const cells = c.id === 'edit.paste' && (cell instanceof Element || (typeof arg === 'string' && arg.includes('\t')));
  if (table && ((c.undoable && c.id.startsWith('table.')) || cells)) return presence.holderOf(table);
  const retags = ((c.id.startsWith('text.style.') || c.id.startsWith('text.list.')) && c.id !== 'text.list.start') || c.id === 'text.pasteStyle';
  if (sel.kind === 'text' && (OF_SPAN.has(c.id) || OF_TEXT.has(c.id) || retags)) {
    for (const el of spanned()) {
      const by = presence.holderOf(el);
      if (by) return by;
    }
  }
  const els = (arg as { els?: unknown } | null | undefined)?.els;
  if (c.id.startsWith('arrange.') && Array.isArray(els)) {
    for (const el of els) {
      const by = el instanceof Element && presence.holderOf(el);
      if (by) return by;
    }
    return null;
  }
  if (sel.kind === 'text' && BESIDE.has(c.id)) {
    const host = sel.items[0];
    const node = getSelection()?.focusNode;
    const li = (node instanceof Element ? node : node?.parentElement)?.closest('li');
    const beside = li && li !== host && host.contains(li) ? null : c.id === 'text.joinForward' ? host.nextElementSibling : host.previousElementSibling;
    const by = beside && presence.holderOf(beside);
    if (by) return by;
  }
  const given = (arg as { el?: unknown } | null | undefined)?.el;
  const backdrop = given instanceof Element ? given : app.current()?.querySelector(':scope > .backdrop');
  const off = c.id === 'figure.caption' ? sel.items[0]?.closest('figure, .figure-box') : c.id === 'slide.footnote' ? app.current()?.querySelector('.foot:not([data-generated])') : c.id === 'insert.backdrop' || c.id === 'backdrop.builtIn' ? backdrop : null;
  const by = off && presence.holderOf(off);
  if (by) return by;
  if (PASS.test(c.id) || (sel.kind !== 'elements' && (sel.kind !== 'text' || !(OF_TEXT.has(c.id) || retags || c.id.startsWith('arrange.'))))) return null;
  for (const el of sel.items) {
    const by = presence.holderOf(el);
    if (by) return by;
  }
  return null;
}
