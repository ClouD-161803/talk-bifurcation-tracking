import type { App } from '../app.ts';
import type { Entry } from '../history.ts';
import { HOST } from '../app.ts';
import type { Command } from '../commands.ts';
import { CONTAINER, RESIZABLE, containerOf, frameRect, linesOf, mediaIn, movableOf, movablesOf, objectsOf, pictureOf, severalOf, turnable } from '../canvas/hit.ts';
import type { Place } from '../canvas/drag.ts';
import { placeOf, record, withCorners, writePlace } from '../canvas/drag.ts';
import { followAgain } from '../model/attach.ts';
import { view, xy } from '../canvas/frames.ts';
import { angleOf, drawnUnder, fieldOf, groupAngle, groupOf, leaveGroup, selectIn } from './order.ts';
import { cornerBoxOf } from './align.ts';
import { nudgeBackdrop, slideBackdrop } from './backdrop.ts';
import { groupsOf } from '../model/groups.ts';
import { onSlides } from './slide.ts';
import { injectStyle } from '../ui/dom.ts';

const CSS = `html.beeson-editing .reveal .slides section .fragment.faint { opacity: 0.25 !important; }`;

const faintEls = (app: App): Element[] => movedEls(app).filter((el) => el.localName !== 'section' && !!app.pairing?.elements.get(el)?.open);
const isFaint = (app: App): boolean => {
  const els = faintEls(app);
  return els.length > 0 && els.every((el) => el.classList.contains('faint'));
};

const PAUSE = 1000;

function onCanvas(): boolean {
  const a = document.activeElement;
  return !a || a === document.body || a.classList.contains('beeson-handle') || (!!a.closest('.reveal .slides') && !a.closest(HOST));
}

const resettable = (els: Element[]) => els.filter((el) => !el.matches('.shape, .backdrop'));

function caretAtEnd(el: Element): void {
  (el as HTMLElement).focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(range);
}

let run: { at: number; changes: { el: Element; from: Place; to: Place }[]; entry: Entry | null } | null = null;

const samePlace = (a: Place, b: Place) => (a.translate?.x ?? 0) === (b.translate?.x ?? 0) && (a.translate?.y ?? 0) === (b.translate?.y ?? 0) && a.width === b.width;

const movedEls = (app: App): Element[] => objectsOf(app, app.selection.elements());
const sizedEls = (app: App): Element[] => movedEls(app).map((el) => (el.matches(CONTAINER) ? pictureOf(el) : el));

function nudge(app: App, dx: number, dy: number): void {
  if (nudgeBackdrop(app, dx, dy)) return;
  const els = movedEls(app);
  if (!els.length) return;
  const now = performance.now();
  const same = !!run && now - run.at < PAUSE && app.history.last === run.entry && run.changes.length === els.length && run.changes.every((c, i) => c.el === els[i] && samePlace(placeOf(c.el), c.to));
  const changes = els.map((el) => {
    const from = placeOf(el);
    writePlace(app, el, { ...from, translate: { x: (from.translate?.x ?? 0) + dx, y: (from.translate?.y ?? 0) + dy } });
    return { el, from, to: placeOf(el) };
  });
  if (same && run) {
    run.at = now;
    run.changes.forEach((c, i) => (c.to = changes[i].to));
    followAgain(app);
  } else {
    const recorded = record(app, 'move', changes);
    run = { at: now, changes: recorded, entry: app.history.last };
  }
  const boxes = els.map(frameRect);
  const c = cornerBoxOf(app, els, els[0]);
  view.readout = { text: xy(c.left, c.top), x: Math.max(...boxes.map((b) => b.left + b.width)) + 6, y: Math.max(...boxes.map((b) => b.top + b.height)) + 10, at: 'frame' };
  app.invalidate('content');
}

function rowsOf(app: App): Element[][] {
  const found = [...movablesOf(app), ...linesOf(app)];
  const els = found.filter((el) => !found.some((o) => o !== el && o.contains(el))).sort((a, b) => (drawnUnder(a, b) ? 1 : -1));
  const rows: Element[][] = [];
  const done = new Set<string>();
  for (const el of els) {
    const g = groupsOf(el)[0];
    const members = g ? els.filter((m) => groupsOf(m)[0] === g) : [];
    if (members.length < 2) rows.push([el]);
    else if (!done.has(g)) {
      done.add(g);
      rows.push(members);
    }
  }
  const ground = slideBackdrop(app);
  return ground ? [...rows, [ground]] : rows;
}

function step(app: App, back: boolean): void {
  const rows = rowsOf(app).reverse();
  if (!rows.length) return;
  const sel = objectsOf(app, app.selection.elements());
  const at = rows.flatMap((r, i) => (r.some((el) => sel.includes(el)) ? [i] : []));
  const i = at.length ? (back ? at[0] - 1 : at[at.length - 1] + 1) : back ? -1 : 0;
  const next = rows[(i + rows.length) % rows.length];
  selectIn(app, [], next);
  if (next[0].classList.contains('beeson-movable')) (next[0] as HTMLElement).focus({ preventScroll: true });
  else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
}

const ARROWS: [string, string, number, number][] = [['left', 'ArrowLeft', -1, 0], ['right', 'ArrowRight', 1, 0], ['up', 'ArrowUp', 0, -1], ['down', 'ArrowDown', 0, 1]];

async function quarter(app: App, by: number): Promise<void> {
  const els = app.selection.elements().filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)));
  const units = new Map<Element | string, Element[]>();
  for (const el of els) units.set(groupOf(el) ?? el, [...(units.get(groupOf(el) ?? el) ?? []), el]);
  for (const unit of units.values()) {
    const deg = unit.length > 1 ? groupAngle(app, unit) : turnable(unit[0]) ? angleOf(unit[0]) : null;
    if (deg !== null) await app.commands.run('arrange.setRotation', { deg: deg + by, els: unit });
  }
}

export function commands(): Command[] {
  const list: Command[] = [
    {
      id: 'selection.all',
      label: 'Select All',
      keys: { mac: ['Mod+A'], other: ['Mod+A'] },
      in: ['canvas', 'text'],
      menu: { bar: 'Edit', group: 'select', order: 31 },
      context: ['canvas'],
      enabled: (app) => (onSlides(app) ? app.commands.enabled('slide.selectAll') : !!fieldOf(app) || (!!app.current() && (onCanvas() || app.selection.kind === 'text'))),
      listedAs: (app) => (onSlides(app) ? 'slide.selectAll' : 'selection.all'),
      runsAs: (app) => (onSlides(app) ? 'slide.selectAll' : 'selection.all'),
      run: (app) => {
        if (onSlides(app)) return app.commands.run('slide.selectAll');
        const field = fieldOf(app);
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field.select();
        if (field) return void getSelection()?.selectAllChildren(field);
        app.selection.selectAll();
      },
    },
    {
      id: 'selection.clear',
      label: 'Deselect',
      keys: { mac: ['Mod+Shift+A', 'Escape'], other: ['Mod+Shift+A', 'Escape'] },
      in: ['canvas'],
      menu: { bar: 'Edit', group: 'select', order: 32 },
      enabled: (app) => app.selection.kind === 'elements' || app.selection.kind === 'text',
      run: (app) => {
        const only = app.selection.only();
        const up = only ? (only.matches(RESIZABLE) ? containerOf(app, only) : severalOf(app, only)) : null;
        const a = document.activeElement;
        if (a instanceof HTMLElement && (app.selection.items.some((el) => el.contains(a)) || a.classList.contains('beeson-handle'))) a.blur();
        if (up) app.selection.set('elements', [up]);
        else if (!leaveGroup(app)) app.selection.clear();
      },
    },
    {
      id: 'selection.clearText',
      label: 'Deselect',
      keys: { mac: ['Mod+Shift+A'], other: ['Mod+Shift+A'] },
      in: ['text'],
      enabled: (app) => app.commands.enabled('selection.clear'),
      run: (app) => app.commands.run('selection.clear'),
    },
    {
      id: 'selection.container',
      label: 'Select Figure',
      menu: { bar: 'Edit', group: 'select', order: 33 },
      context: ['element'],
      enabled: (app) => {
        const only = app.selection.only();
        return !!only && (only.matches(RESIZABLE) ? !!containerOf(app, only) : !!severalOf(app, only));
      },
      run: (app) => {
        const only = app.selection.only();
        const up = only ? (only.matches(RESIZABLE) ? containerOf(app, only) : severalOf(app, only)) : null;
        if (up) app.selection.set('elements', [up]);
      },
    },
    {
      id: 'selection.leaveText',
      label: 'Select Text Element',
      keys: { mac: ['Escape'], other: ['Escape'] },
      in: ['text'],
      enabled: (app) => !!app.hostOf(document.activeElement),
      run: (app) => {
        const host = app.hostOf(document.activeElement) as HTMLElement;
        host.blur();
        app.selection.set('elements', [movableOf(app, host) ?? host]);
      },
    },
    {
      id: 'selection.editText',
      label: 'Edit Text',
      keys: { mac: ['Enter'], other: ['Enter'] },
      in: ['canvas'],
      context: ['element'],
      enabled: (app) => {
        const el = app.selection.only();
        if (!el || document.activeElement?.classList.contains('beeson-handle')) return false;
        return el.matches(HOST) || !!el.querySelector(HOST);
      },
      run: (app) => {
        const el = app.selection.only() as Element;
        const host = el.matches(HOST) ? el : [...el.querySelectorAll(HOST)].at(-1);
        if (host) caretAtEnd(host);
      },
    },
    {
      id: 'selection.selectMedia',
      label: 'Select Image',
      keys: { mac: ['Enter'], other: ['Enter'] },
      in: ['canvas'],
      enabled: (app) => {
        const el = app.selection.only();
        if (!el || document.activeElement?.classList.contains('beeson-handle') || el.querySelector(HOST) || el.hasAttribute('data-locked')) return false;
        return !!mediaIn(el, el.querySelector('img, video'));
      },
      run: (app) => {
        const el = app.selection.only() as Element;
        const media = [...el.querySelectorAll('img, video')].find((m) => m.getBoundingClientRect().width > 0);
        const child = media ? mediaIn(el, media) : null;
        if (child) app.selection.set('elements', [child]);
      },
    },
    {
      id: 'selection.next',
      label: 'Select Next Object',
      keys: { mac: ['Tab'], other: ['Tab'] },
      in: ['canvas'],
      enabled: (app) => onCanvas() && rowsOf(app).length > 0,
      run: (app) => step(app, false),
    },
    {
      id: 'selection.previous',
      label: 'Select Previous Object',
      keys: { mac: ['Shift+Tab'], other: ['Shift+Tab'] },
      in: ['canvas'],
      enabled: (app) => onCanvas() && rowsOf(app).length > 0,
      run: (app) => step(app, true),
    },
    {
      id: 'arrange.faint',
      label: 'Faint',
      in: ['canvas'],
      undoable: true,
      enabled: (app) => faintEls(app).length > 0,
      checked: isFaint,
      run: (app) => {
        const on = !isFaint(app);
        for (const el of faintEls(app)) if (el.classList.contains('faint') !== on) app.doc.setTag(el, { classes: { faint: on } }, 'faint');
        app.markDirty();
        app.invalidate('content');
      },
    },
    {
      id: 'arrange.resetPosition',
      label: 'Reset Position',
      menu: { bar: 'Arrange', group: 'reset', order: 10 },
      context: ['element'],
      enabled: (app) => resettable(movedEls(app)).some((el) => placeOf(el).translate),
      run: (app) => {
        const els = resettable(movedEls(app));
        const changes = els.map((el) => {
          const from = placeOf(el);
          const to = { ...from, translate: null };
          writePlace(app, el, to);
          return { el, from, to };
        });
        record(app, 'move', changes);
      },
    },
    {
      id: 'arrange.resetSize',
      label: 'Reset Size',
      menu: { bar: 'Arrange', group: 'reset', order: 11 },
      context: ['element'],
      undoable: true,
      enabled: (app) => resettable(sizedEls(app)).some((el) => placeOf(el).width !== null || (placeOf(el).height ?? null) !== null),
      run: (app) => {
        const els = resettable(sizedEls(app));
        const changes = withCorners(app, els, () => els.map((el) => {
          const from = placeOf(el);
          const to = { ...from, width: null, ...(from.height !== undefined ? { height: null } : {}) };
          writePlace(app, el, to);
          return { el, from, to };
        }));
        record(app, 'resize', changes);
        for (const el of els) if ((el as HTMLElement).style.objectFit === 'contain') app.doc.setTag(el, { style: { 'object-fit': null } }, 'resize');
        app.invalidate('content');
      },
    },
    ...([['Left', -90], ['Right', 90]] as const).map(([side, by], i): Command => ({
      id: `arrange.rotate${side}`,
      label: `Rotate ${side} 90°`,
      menu: { bar: 'Arrange', group: 'rotate', order: 13 + i / 2 },
      context: ['element'],
      undoable: true,
      enabled: (app) => app.commands.enabled('arrange.setRotation'),
      run: (app) => quarter(app, by),
    })),
  ];
  for (const [name, key, x, y] of ARROWS) {
    for (const far of [false, true]) {
      list.push({
        id: `arrange.nudge.${name}${far ? '.far' : ''}`,
        label: `Nudge ${name[0].toUpperCase()}${name.slice(1)}${far ? ' by 10' : ''}`,
        keys: { mac: [`${far ? 'Shift+' : ''}${key}`], other: [`${far ? 'Shift+' : ''}${key}`] },
        in: ['canvas'],
        enabled: (app) => app.selection.elements().length > 0,
        run: (app) => nudge(app, x * (far ? 10 : 1), y * (far ? 10 : 1)),
      });
    }
  }
  return list;
}

export function install(app: App): void {
  injectStyle('arrange', CSS);
  for (const c of commands()) app.commands.define(c);
  app.selection.listen(() => (run = null));
}
