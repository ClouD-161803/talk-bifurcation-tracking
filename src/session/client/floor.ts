// the refusals of the commands of this page that would move or delete a text element that another
// person holds (see presence.ts), or change the slide or the table around it, checked by
// commands.refuse of the editor. a caret, a selection, and typing in a held element are not
// refused, and neither is an apply of the port, e.g. a restore or a change of index.html from outside

import type { App } from '../../editor/app.ts';
import type { Command } from '../../editor/commands.ts';
import { bubble, ready } from './bubble.ts';
import type { Client } from './client.ts';
import { bdi } from './dom.ts';
import { presenceOf, type Presence, type Resolved } from './presence.ts';

// the commands that change a slide as a whole, refused when a held element is on the slide, and
// the commands of the selection that change slides while slides are selected
const SLIDE = new Set(['slide.cut', 'slide.delete', 'slide.hide', 'slide.layoutChooser', 'slide.moveDown', 'slide.moveUp', 'slide.moveTo', 'slide.moveSection', 'slide.reset']);
const OF_SLIDES = new Set(['edit.cut', 'element.delete']);
// the commands of a caret or a text selection that delete, resize, split, or retag its text
// element, or merge it with the element beside it, refused in a held element together with
// arrange.*, text.style.*, and text.list.* apart from Start At
const OF_TEXT = new Set(['element.delete', 'text.bigger', 'text.smaller', 'text.indent', 'text.outdent', 'text.joinBackward', 'text.joinForward', 'text.newParagraph']);
// the commands of a text selection over several text elements, which replace its text and remove
// each text element after the first
const OF_SPAN = new Set(['text.flow.delete', 'text.flow.newParagraph']);
// the commands of a caret that also change the text element before it, or with joinForward after
// it, unless the caret is in a nested item
const BESIDE = new Set(['text.joinBackward', 'text.joinForward', 'text.indent']);
// the commands of a selection that change nothing
const READ = /^(view|zoom|go|help|window|file)\.|^edit\.copy$|^find\.(open|next|previous|close|useSelection)$/;

export const refusal = (by: Resolved): (string | Node)[] => [bdi(by.name), ' is typing here. You can do this once they leave it or stop for 30 s.'];

export function install(client: Client): void {
  const presence = presenceOf(client);
  if (!presence) return;
  const { app } = client;
  ready();

  // a plain press in a container of several objects around a held element, e.g. a plate with a
  // held caption, selects the object under the pointer first, as a second click on the container
  // would. the drag then takes this object, and only a drag of the container or of the object
  // around the held element is refused, as arrange.setPosition with its elements. the editor takes
  // the press as one on a selected object, whose click selects the picture inside it, hence the
  // object is selected again at the click
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

  app.commands.refuse((a: App, c: Command, arg?: unknown) => {
    const by = refused(a, presence, client.shell.presence.spanned, c, arg);
    const el = by?.caret?.el;
    if (!by || !el) return false;
    // a text element on another slide is named by the number of its slide, at the top of the window
    const n = [...app.slides().children].filter((s) => s.tagName === 'SECTION').findIndex((s) => s.contains(el)) + 1;
    if (!n || app.current()?.contains(el)) bubble(el, refusal(by));
    else bubble(null, [bdi(by.name), ` is typing${client.shell.onSlides([n])}. You can do this once they leave it or stop for 30 s.`]);
    return true;
  });
}

// the page that holds an element that command c would change, or null
function refused(app: App, presence: Presence, spanned: () => Element[], c: Command, arg: unknown): Resolved | null {
  const holds = presence.holds;
  if (!holds.size) return null;
  // a section is moved by its head, whose slides are not read here
  if (c.id === 'slide.moveSection') return holds.values().next().value ?? null;
  const sel = app.selection;
  const holding = (slides: readonly Element[]): Resolved | null => {
    for (const [el, by] of holds) if (slides.some((s) => s.contains(el))) return by;
    return null;
  };
  // slide.moveTo of a drag in the navigator or the Slide Sorter names the slides in its argument
  const moved = (arg as { slides?: unknown } | undefined)?.slides;
  if (c.id === 'slide.moveTo' && Array.isArray(moved)) return holding(moved.filter((s): s is Element => s instanceof Element));
  if (SLIDE.has(c.id) || (sel.kind === 'slides' && OF_SLIDES.has(c.id))) {
    const current = app.current();
    return holding(sel.kind === 'slides' ? sel.items : current ? [current] : []);
  }
  // an undo or a redo that moves, deletes, or restructures a held element, i.e. a part that
  // touches or detaches it, or a transaction that names it. typing, a top-level entry with els
  // alone, is undone in a held element
  if (c.id === 'edit.undo' || c.id === 'edit.redo') {
    const entry = c.id === 'edit.undo' ? app.history.last : app.history.next;
    const parts = entry ? app.history.partsOf(entry) : [];
    const transaction = parts.length !== 1 || parts[0] !== entry;
    for (const part of parts) {
      for (const el of [...(transaction ? (part.els ?? []) : []), ...(part.touches ?? [])]) {
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
  // a command of a table and a paste into a cell may change any cell of the table
  const cell = (arg as { cell?: unknown } | null | undefined)?.cell;
  const table = (cell instanceof Element ? cell : sel.kind === 'text' ? sel.items[0] : null)?.closest('table');
  if (table && ((c.undoable && c.id.startsWith('table.')) || c.id.startsWith('edit.paste'))) return presence.holderOf(table);
  // a text selection over several text elements is replaced by its commands and by typing
  if (sel.kind === 'text' && OF_SPAN.has(c.id)) {
    for (const el of spanned()) {
      const by = presence.holderOf(el);
      if (by) return by;
    }
  }
  // a drag names the elements that it moves, resizes, or turns, as the fields of Arrange do
  const els = (arg as { els?: unknown } | null | undefined)?.els;
  if (c.id.startsWith('arrange.') && Array.isArray(els)) {
    for (const el of els) {
      const by = el instanceof Element && presence.holderOf(el);
      if (by) return by;
    }
    return null;
  }
  // a join and Tab at the first level of a list also change the text element beside the caret
  if (sel.kind === 'text' && BESIDE.has(c.id)) {
    const host = sel.items[0];
    const node = getSelection()?.focusNode;
    const li = (node instanceof Element ? node : node?.parentElement)?.closest('li');
    const beside = li && li !== host && host.contains(li) ? null : c.id === 'text.joinForward' ? host.nextElementSibling : host.previousElementSibling;
    const by = beside && presence.holderOf(beside);
    if (by) return by;
  }
  // a selection of elements that contains a held element takes no command that changes it, and a
  // caret or a text selection in one takes the commands of the text that keep the element
  const retags = (c.id.startsWith('text.style.') || c.id.startsWith('text.list.')) && c.id !== 'text.list.start';
  if (READ.test(c.id) || (sel.kind !== 'elements' && (sel.kind !== 'text' || !(OF_TEXT.has(c.id) || retags || c.id.startsWith('arrange.'))))) return null;
  for (const el of sel.items) {
    const by = presence.holderOf(el);
    if (by) return by;
  }
  return null;
}
