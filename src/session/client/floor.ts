// the refusals of the floor rule of presence.ts on a text element that another person holds, with
// one check per kind of action: focusin for a caret put into it, pointerdown for a press that would
// select or drag it, and commands.refuse of the editor for a command. the selection of this page
// drops a locked element, so that a command of the selection does not reach it. an apply of the
// port, e.g. a restore or a change of index.html from outside, is not refused

import type { App } from '../../editor/app.ts';
import type { Command } from '../../editor/commands.ts';
import { bubble } from './bubble.ts';
import type { Client } from './client.ts';
import { bdi, style } from './dom.ts';
import { presenceOf, type Presence, type Resolved } from './presence.ts';

// the commands that change a slide as a whole, refused when the slide holds a locked element, and
// the commands of the selection that change slides while slides are selected
const SLIDE = new Set(['slide.cut', 'slide.delete', 'slide.hide', 'slide.layoutChooser', 'slide.moveDown', 'slide.moveUp', 'slide.moveTo', 'slide.moveSection', 'slide.reset']);
const OF_SLIDES = new Set(['edit.cut', 'element.delete']);
// the commands that change text anywhere in the deck, refused while any text element is held. a
// section is moved by its head, whose slides are not read here
const ANYWHERE = new Set(['find.replaceOne', 'find.replaceAndFind', 'find.replaceAll', 'slide.moveSection']);
// the commands of a selection that change nothing
const READ = /^(view|zoom|go|help|window|file)\.|^edit\.copy$|^find\.(open|next|previous|close|useSelection)$/;

export const refusal = (by: Resolved): (string | Node)[] => [bdi(by.name), ' is typing here. You can edit this text once they leave it or stop for 30 s.'];
export const taken = (by: Resolved): (string | Node)[] => [bdi(by.name), ' is editing this text now.'];

export function install(client: Client): void {
  const presence = presenceOf(client);
  if (!presence) return;
  const { app } = client;
  style('floor', '.beeson-locked, .beeson-locked * { cursor: not-allowed !important; }');
  // the selection is changed by this file, which is not an action of the person
  let filtering = false;

  const out = (host: Element | null): void => {
    const active = document.activeElement as HTMLElement | null;
    if (active && (!host || host.contains(active) || active.contains(host))) active.blur();
    getSelection()?.removeAllRanges();
  };

  document.addEventListener('focusin', (ev) => {
    const host = app.hostOf(ev.target);
    const by = host && presence.holder(host);
    if (!by) return;
    out(host);
    bubble(host, refusal(by));
  }, true);
  // an input that reaches a locked text element in spite of focusin, e.g. by a script
  document.addEventListener('beforeinput', (ev) => {
    const host = app.hostOf(ev.target);
    if (host && presence.holder(host)) ev.preventDefault();
  }, true);

  const pressed = (ev: Event): void => {
    const target = ev.target instanceof Element ? ev.target : null;
    const by = target ? presence.lockOf(target, false) : null;
    if (!by || !target || target.closest('.beeson-edit-titlebar, .beeson-edit-toolbar, .beeson-inspector, dialog')) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (ev.type === 'pointerdown') bubble(target, refusal(by));
  };
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick']) window.addEventListener(type, pressed, true);

  app.selection.listen(() => {
    if (!filtering) drop(app, presence, true, (f) => (filtering = f));
  });

  app.commands.refuse((a: App, c: Command, arg?: unknown) => {
    const by = refused(a, presence, c, arg);
    if (by) bubble(by.held, refusal(by));
    return !!by;
  });

  presence.onLocks(({ yielded, refused: lost }) => {
    drop(app, presence, false, (f) => (filtering = f));
    const by = yielded ?? lost;
    if (!by) return;
    out(by.held);
    if (app.selection.kind === 'text') app.selection.clear();
    bubble(by.held, yielded ? taken(by) : refusal(by));
  });
}

// the locked elements taken out of the selection, with a bubble when the person selected one
function drop(app: App, presence: Presence, acted: boolean, filtering: (on: boolean) => void): void {
  const sel = app.selection;
  if (!presence.locks.size || (sel.kind !== 'elements' && sel.kind !== 'text')) return;
  const items = [...sel.items];
  const kept = items.filter((el) => !presence.lockOf(el));
  if (kept.length === items.length) return;
  const by = presence.lockOf(items.find((el) => !kept.includes(el))!);
  filtering(true);
  try {
    if (kept.length && sel.kind === 'elements') sel.set('elements', kept);
    else sel.clear();
  } finally {
    filtering(false);
  }
  if (acted && by) bubble(by.held, refusal(by));
}

// the page that holds an element that command c would change, or null
function refused(app: App, presence: Presence, c: Command, arg: unknown): Resolved | null {
  const locks = presence.locks;
  if (!locks.size) return null;
  if (ANYWHERE.has(c.id)) return locks.values().next().value ?? null;
  const sel = app.selection;
  const holding = (slides: readonly Element[]): Resolved | null => {
    for (const [el, by] of locks) if (slides.some((s) => s.contains(el))) return by;
    return null;
  };
  // slide.moveTo of a drag in the navigator or the Slide Sorter names the slides in its argument
  const moved = (arg as { slides?: unknown } | undefined)?.slides;
  if (c.id === 'slide.moveTo' && Array.isArray(moved)) return holding(moved.filter((s): s is Element => s instanceof Element));
  if (SLIDE.has(c.id) || (sel.kind === 'slides' && OF_SLIDES.has(c.id))) {
    const current = app.current();
    return holding(sel.kind === 'slides' ? sel.items : current ? [current] : []);
  }
  if (c.id === 'edit.undo') {
    const last = app.history.last;
    for (const el of [...(last?.els ?? []), ...(last?.touches ?? [])]) {
      const by = presence.lockOf(el);
      if (by) return by;
    }
    return null;
  }
  if (READ.test(c.id) || (sel.kind !== 'elements' && sel.kind !== 'text')) return null;
  for (const el of sel.items) {
    const by = presence.lockOf(el);
    if (by) return by;
  }
  return null;
}
