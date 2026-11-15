// the avatars of a session in .right of the title bar: a circle with initials per person in the
// tone of the person, the others in the order of joining, at most four, then +N with a list of the
// rest, and the own avatar last. a person with two pages has one avatar. each avatar opens a menu
// on a click, a right-click, a hold of 500 ms, and Enter or Shift+F10 with the focus on it. the
// own menu holds Change Name… and, for a guest, Leave Session. a hidden status region announces
// who joined and who left.
//
// in a title bar too narrow for the menus and the controls of the session in one row, e.g. on a
// phone, menubar.ts sets the class narrow, and the controls of the session take a row of their own
// under the menus. at most two other avatars are shown there

import type { MenuItem, OpenMenu } from '../../editor/ui/menu.ts';
import { COLORS, nameKey, type Person } from '../protocol.ts';
import type { Client } from './client.ts';
import { make, sheet, style } from './dom.ts';
import { askTaken, claimOnReload, initials, nameField, rename } from './join.ts';

export { initials };

// a person of the session with the pages that the person has open, in the order of joining
export type Someone = { person: string; name: string; color: number; host: boolean; pages: Person[] };

// the initials and the colors of the avatar of a person. tone is a CSS color, ink the color of text
// on it
export type Badge = { initials: string; tone: string; ink: string };

const HOLD = 500;
// a move in px of a touch that is a scroll, not a hold
const SLOP = 10;
const OTHERS = 4;
const OTHERS_NARROW = 2;
// announcements less than SAY_GAP ms apart are read together, the last SAID lines of them
const SAY_GAP = 1000;
const SAID = 8;

// the hit area of each control is 32 px, around a circle of 22 px
const CSS = `
.beeson-session-people { display: inline-flex; align-items: center; gap: 10px; flex: none; }
.beeson-edit-titlebar .right button.beeson-session-avatar { position: relative; justify-content: center; width: 22px; min-width: 22px; padding: 0; border-radius: 11px; background: var(--tone); color: var(--ink); font: 600 11px/1 var(--ed-font); letter-spacing: -0.2px; -webkit-touch-callout: none; touch-action: manipulation; }
.beeson-edit-titlebar .right button.beeson-session-avatar.long { font-size: 9px; letter-spacing: -0.3px; }
.beeson-edit-titlebar .right button.beeson-session-avatar:hover { background: var(--tone); filter: brightness(1.08); }
.beeson-edit-titlebar .right button.beeson-session-avatar.more { width: auto; padding: 0 6px; background: var(--ed-pressed); color: var(--ed-text); }
.beeson-edit-titlebar .right button.beeson-session-avatar.me { box-shadow: 0 0 0 1.5px var(--ed-bg), 0 0 0 3px var(--tone); }
.beeson-edit-titlebar .right button.beeson-session-avatar:focus-visible { outline-offset: 3px; }
.beeson-edit-titlebar .right button.beeson-session-avatar::after { content: ''; position: absolute; inset: -5px; }
.beeson-edit-titlebar .right button.beeson-session-avatar.more[data-fit="narrow"] { display: none; }
.beeson-edit-titlebar.narrow .right button.beeson-session-avatar.more[data-fit="wide"], .beeson-edit-titlebar.narrow .right button.beeson-session-avatar.extra { display: none; }
.beeson-edit-titlebar.narrow .right button.beeson-session-avatar.more[data-fit="narrow"] { display: inline-flex; }
.beeson-edit-titlebar.beeson-session-bar.narrow { grid-template-columns: minmax(0, 1fr); grid-template-rows: 28px 36px; height: auto; overflow: visible; }
.beeson-edit-titlebar.beeson-session-bar.narrow .doc { display: none; }
.beeson-edit-titlebar.beeson-session-bar.narrow .beeson-edit-menubar { min-width: 0; overflow-x: auto; scrollbar-width: none; }
.beeson-edit-titlebar.beeson-session-bar.narrow .beeson-edit-menubar::-webkit-scrollbar { display: none; }
.beeson-edit-titlebar.beeson-session-bar.narrow .right { grid-row: 2; min-width: 0; }
.beeson-edit-titlebar.beeson-session-bar.narrow .right button.beeson-session-state { flex: 0 1 auto; min-width: 32px; }
.beeson-edit-titlebar.beeson-session-bar.narrow .right button.beeson-session-state .name { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.beeson-session-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

const morePeople = (n: number) => `${n} more ${n === 1 ? 'person' : 'people'}`;

export const toneOf = (color: number): string => `var(${COLORS[((color % 4) + 4) % 4]})`;
// text on --data-5 is white, and on the other tones near black
export const inkOf = (color: number): string => (((color % 4) + 4) % 4 === 2 ? '#fff' : '#1d1d1f');

// the persons of the session, with the own person, in the order of joining
export function everyone(client: Client): Someone[] {
  const out = new Map<string, Someone>();
  for (const page of client.people) {
    const one = out.get(page.person);
    if (one) {
      one.pages.push(page);
      one.host ||= page.host;
    } else out.set(page.person, { person: page.person, name: page.name, color: page.color, host: page.host, pages: [page] });
  }
  return [...out.values()];
}

// the badge of a person of the session, or of one who joined it before. two people with one tone
// and the same initials differ by a digit, given in the order of joining
export function badge(client: Client, person: string): Badge {
  const present = everyone(client);
  const known = present.find((p) => p.person === person) ?? client.known.find((p) => p.person === person);
  const name = known?.name ?? (person === client.person ? client.name : '');
  const color = known?.color ?? (person === client.person ? client.color : 0);
  let letters = initials(name) || '?';
  const twins = present.filter((p) => p.color === color && initials(p.name) === initials(name));
  const at = twins.findIndex((p) => p.person === person);
  if (at > 0) letters += String(at + 1);
  return { initials: letters, tone: toneOf(color), ink: inkOf(color) };
}

// a circle with the initials of a person, e.g. for a row of the Share dialog
export function disc(client: Client, person: string, size = 22): HTMLElement {
  const b = badge(client, person);
  const el = make('span', 'beeson-session-disc', b.initials);
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `display: inline-grid; place-items: center; flex: none; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${b.tone}; color: ${b.ink}; font: 600 ${b.initials.length > 2 ? 9 : 11}px/1 var(--ed-font, system-ui); letter-spacing: -0.2px;`;
  return el;
}

const extras: ((someone: Someone) => MenuItem[])[] = [];

// items added under the full name in the menu of the avatar of another person, e.g. Follow and Go
// to Slide 7
export function addPersonItems(fn: (someone: Someone) => MenuItem[]): void {
  extras.push(fn);
}

export function personItems(someone: Someone): MenuItem[] {
  return [{ note: someone.name }, ...extras.flatMap((fn) => fn(someone))];
}

let press: ((person: string) => void) | null = null;

// fn runs at a click, a tap, Enter, or Space on the avatar of another person in place of its menu,
// e.g. to follow the person. the menu then opens on the other ways of wireMenu
export function onPersonPress(fn: ((person: string) => void) | null): void {
  press = fn;
}

let openOwner: HTMLElement | null = null;
let openMenu: OpenMenu | null = null;

function showMenu(client: Client, owner: HTMLElement, items: () => MenuItem[], keyboard: boolean): void {
  const menu = client.shell.menu(items(), {
    anchor: owner.getBoundingClientRect(),
    placement: 'below',
    owner,
    keyboard,
    label: owner.getAttribute('aria-label') ?? undefined,
    className: 'beeson-session-avatar-menu',
    onClose: () => {
      if (openMenu === menu) openMenu = openOwner = null;
    },
  });
  openMenu = menu;
  openOwner = owner;
}

// the menu of owner on a press of the mouse, a tap, a hold of a touch or a pen, a right-click, and
// Enter, Space, Down, Shift+F10, or the Menu key. with act, a press, a tap, Enter, and Space run act
export function wireMenu(client: Client, owner: HTMLElement, items: () => MenuItem[], act?: () => void): void {
  if (!act) {
    owner.setAttribute('aria-haspopup', 'menu');
    owner.setAttribute('aria-expanded', 'false');
  }
  const isOpen = () => openOwner === owner && !!openMenu;
  const toggle = (keyboard: boolean) => {
    if (isOpen()) openMenu!.close();
    else showMenu(client, owner, items, keyboard);
  };
  let pointer = '';
  let timer = 0;
  let held = false;
  let from: { x: number; y: number } | null = null;
  const stop = () => {
    clearTimeout(timer);
    from = null;
  };
  owner.addEventListener('pointerdown', (ev) => {
    pointer = ev.pointerType;
    if (ev.pointerType === 'mouse') {
      if (ev.button !== 0) return;
      ev.preventDefault();
      if (!act) toggle(false);
      return;
    }
    // iOS Safari fires no contextmenu at a long press, hence the hold is timed here
    held = false;
    from = { x: ev.clientX, y: ev.clientY };
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      from = null;
      held = true;
      if (!isOpen()) showMenu(client, owner, items, false);
    }, HOLD);
  });
  owner.addEventListener('pointermove', (ev) => {
    if (from && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > SLOP) stop();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) owner.addEventListener(type, stop);
  owner.addEventListener('click', (ev) => {
    if (ev.detail === 0) return act ? act() : toggle(true);
    if (pointer === 'mouse') return act?.();
    if (held) {
      held = false;
      return;
    }
    if (act) act();
    else toggle(false);
  });
  owner.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!isOpen()) showMenu(client, owner, items, false);
  });
  owner.addEventListener('keydown', (ev) => {
    const menuKey = ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey);
    // the click of the button runs act
    if (act && !menuKey && (ev.key === 'Enter' || ev.key === ' ')) return;
    if (!(menuKey || ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown')) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!isOpen()) showMenu(client, owner, items, true);
  });
}

// Change Name…: the field of the join dialog, and the question of the join when another person
// holds the name. Yes takes the person over at a reload, as the join does
async function changeName(client: Client): Promise<void> {
  const field = nameField(client.name);
  field.swatch.style.setProperty('--tone', toneOf(client.color));
  field.swatch.style.setProperty('--ink', inkOf(client.color));
  const dialog = client.shell.dialog({
    title: 'Change your name',
    text: 'The others see this name on your avatar, your edits, and your comments.',
    body: field.body,
    className: `beeson-session-rename ${sheet()}`,
    stay: ['change'],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Change name', value: 'change', primary: true },
    ],
    onButton: (value) => {
      if (value === 'change') void submit();
    },
  });
  const change = dialog.buttons.get('change')!;
  const submit = async () => {
    const name = field.input.value;
    if (!name.trim()) {
      field.note.textContent = 'Type a name first.';
      field.input.focus();
      return;
    }
    change.disabled = true;
    try {
      if ((await rename(client, name)) === 'renamed') {
        dialog.close('change');
        return;
      }
      // the question is asked over the dialog, which stays open for another name
      const holder = client.known.find((p) => nameKey(p.name) === nameKey(name))?.name ?? name.trim();
      if (await askTaken(client, holder)) {
        claimOnReload(holder);
        await Promise.race([client.flush().catch(() => {}), new Promise((done) => setTimeout(done, 2000))]);
        location.reload();
        return;
      }
      field.note.textContent = '';
    } catch (e) {
      field.note.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      change.disabled = false;
    }
    field.input.focus();
    field.input.select();
  };
  const opened = dialog.open();
  field.input.select();
  const off = client.on('state', () => client.connection === 'ended' && dialog.close('cancel'));
  await opened;
  off();
  dialog.el.remove();
}

let leaving = false;

// true from Leave Session until the page has left, for the save state
export const isLeaving = (): boolean => leaving;

// Leave Session of a guest: the edits are sent first, and the page leaves the session. the deck
// stays open in the editor without a session
async function leave(client: Client): Promise<void> {
  if (leaving) return;
  leaving = true;
  client.emit('state');
  await Promise.race([client.flush().catch(() => {}), new Promise((done) => setTimeout(done, 2000))]);
  // a session that the host ended meanwhile is told by end.ts
  if (client.ended) return;
  const acked = client.acked();
  const text = client.port.text();
  client.leave();
  const lines = ['The deck stays open in this page, and your changes no longer reach the others.'];
  if (!acked) lines.push('Your last changes did not reach the host.');
  const dialog = client.shell.dialog({
    title: 'You left the session',
    text: lines.join(' '),
    className: `beeson-session-left ${sheet()}`,
    buttons: [
      { label: 'Download a copy', value: 'download' },
      { label: 'Close', value: 'close' },
      { label: 'Join again', value: 'join', primary: true },
    ],
    stay: ['download'],
    onButton: (value) => {
      if (value === 'download') client.shell.download(text);
      // the page joins again with the name and the person that it keeps
      if (value !== 'join') return;
      // the deck counts as changed after a session, and the browser would ask before the reload
      client.app.dirty = false;
      location.reload();
    },
  });
  void dialog.open('join').then((value) => value !== 'join' && dialog.el.remove());
}

export function install(client: Client): void {
  style('people', CSS);
  const bar = client.shell.bar;
  const row = bar.closest('.beeson-edit-titlebar');
  row?.classList.add('beeson-session-bar');
  const box = make('span', 'beeson-session-people');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'People in this session');
  bar.insertBefore(box, bar.querySelector('.beeson-session-state'));
  const region = () => {
    const el = make('div', 'beeson-session-live');
    el.setAttribute('role', 'status');
    return el;
  };
  const live = region();
  document.body.append(live);
  // the page outside a modal dialog is inert, hence each modal dialog gets a status region when it
  // opens, which the announcements go into while this dialog is the top one
  const modals: HTMLDialogElement[] = [];
  const opened = new MutationObserver((records) => {
    for (const { target: d } of records) {
      if (!(d instanceof HTMLDialogElement)) continue;
      modals.splice(modals.indexOf(d) >>> 0, 1);
      if (!d.open || !d.matches(':modal')) continue;
      modals.push(d);
      if (!d.querySelector(':scope > .beeson-session-live')) d.append(region());
    }
  });
  opened.observe(document.body, { subtree: true, attributeFilter: ['open'] });

  const avatars = new Map<string, HTMLButtonElement>();
  const avatar = (person: string): HTMLButtonElement => {
    let b = avatars.get(person);
    if (!b) {
      const el = (b = make('button', 'beeson-session-avatar'));
      el.type = 'button';
      el.dataset.person = person;
      wireMenu(client, el, () => {
        if (person === client.person) return ownItems();
        const someone = everyone(client).find((p) => p.person === person);
        return someone ? personItems(someone) : [];
      }, press && person !== client.person ? () => press?.(person) : undefined);
      avatars.set(person, el);
    }
    return b;
  };
  const more = (fit: 'wide' | 'narrow'): HTMLButtonElement => {
    const b = make('button', 'beeson-session-avatar more');
    b.type = 'button';
    b.dataset.fit = fit;
    wireMenu(client, b, () => {
      const shown = fit === 'wide' ? OTHERS : OTHERS_NARROW;
      return others().slice(shown).map((p) => ({ label: p.name, items: () => personItems(p) }));
    });
    return b;
  };
  const moreWide = more('wide');
  const moreNarrow = more('narrow');
  const ownItems = (): MenuItem[] => [
    { note: client.name },
    { label: 'Change Name…', run: () => void changeName(client).catch((e) => client.app.fail(e)) },
    ...(client.host || leaving ? [] : [{ label: 'Leave Session', run: () => void leave(client) }]),
  ];
  const others = () => everyone(client).filter((p) => p.person !== client.person);

  let said: string[] = [];
  let saidAt = 0;
  // the lines added to those of an announcement less than SAY_GAP ago, so that a quick second one
  // does not cut the first
  const say = (lines: string[]) => {
    const now = performance.now();
    said = (now - saidAt < SAY_GAP ? [...said, ...lines] : lines).slice(-SAID);
    saidAt = now;
    const top = modals.filter((d) => d.isConnected && d.open).at(-1)?.querySelector<HTMLElement>(':scope > .beeson-session-live') ?? live;
    for (const el of document.querySelectorAll<HTMLElement>('.beeson-session-live')) if (el !== top) el.textContent = '';
    top.textContent = said.join(' ');
  };

  let seen: Map<string, string> | null = null;
  const announce = (all: Someone[]) => {
    const now = new Map(all.filter((p) => p.person !== client.person).map((p) => [p.person, p.name]));
    if (seen) {
      const lines: string[] = [];
      for (const [person, name] of now) if (!seen.has(person)) lines.push(`${name} joined the session.`);
      for (const [person, name] of seen) if (!now.has(person)) lines.push(`${name} left the session.`);
      if (lines.length) say(lines);
    }
    seen = now;
  };

  const paint = (b: HTMLButtonElement, person: string, name: string, label: string) => {
    const look = badge(client, person);
    if (b.textContent !== look.initials) b.textContent = look.initials;
    b.classList.toggle('long', look.initials.length > 2);
    b.style.setProperty('--tone', look.tone);
    b.style.setProperty('--ink', look.ink);
    b.setAttribute('aria-label', label);
    b.title = name;
  };

  const draw = () => {
    if (client.connection === 'ended') return teardown();
    if (!client.person) return;
    const all = everyone(client);
    announce(all);
    const rest = all.filter((p) => p.person !== client.person);
    const list: HTMLButtonElement[] = [];
    rest.slice(0, OTHERS).forEach((p, i) => {
      const b = avatar(p.person);
      paint(b, p.person, p.name, p.name);
      b.classList.toggle('extra', i >= OTHERS_NARROW);
      list.push(b);
    });
    if (rest.length > OTHERS_NARROW) {
      moreNarrow.textContent = `+${rest.length - OTHERS_NARROW}`;
      moreNarrow.setAttribute('aria-label', morePeople(rest.length - OTHERS_NARROW));
      list.push(moreNarrow);
    }
    if (rest.length > OTHERS) {
      moreWide.textContent = `+${rest.length - OTHERS}`;
      moreWide.setAttribute('aria-label', morePeople(rest.length - OTHERS));
      list.push(moreWide);
    }
    const me = avatar(client.person);
    paint(me, client.person, client.name, `${client.name}, you`);
    me.classList.add('me');
    list.push(me);
    // the nodes that left go first, so that the nodes that stay are not moved and keep the focus
    for (const el of [...box.children]) if (!list.includes(el as HTMLButtonElement)) el.remove();
    list.forEach((el, i) => {
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] ?? null);
    });
    for (const [person, el] of avatars) if (!el.isConnected) avatars.delete(person);
  };

  // a change of the width of the controls fits the title bar again, see fit() of menubar.ts
  const watch = new ResizeObserver(() => client.app.report());
  watch.observe(bar);

  let done = false;
  const teardown = () => {
    if (done) return;
    done = true;
    watch.disconnect();
    opened.disconnect();
    if (openOwner && box.contains(openOwner)) openMenu?.close();
    box.remove();
    for (const el of document.querySelectorAll('.beeson-session-live')) el.remove();
    row?.classList.remove('beeson-session-bar');
    client.app.report();
  };
  client.on('people', draw);
  client.on('known', draw);
  client.on('me', draw);
  client.on('state', () => client.connection === 'ended' && teardown());
  draw();
}
