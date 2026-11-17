// following a person, as in UI.md sections 2 and 5. a click on the avatar of another person, or
// Follow in its menu, follows the person: this page shows the slide of the person and brings the
// selection or the caret of the person into view at its own zoom. a div over the canvas draws an
// inset border in the tone of the person, with a pill at its top. a slide shown by following is not
// an edit, hence it makes no entry of the history and leaves the deck unchanged.
//
// following stops at a click on the avatar or on Stop, at Escape in the pill, at an edit, a
// selection, a slide shown by this page, and when this page presents. a zoom and a scroll do not
// stop it. a person with two pages is followed on the page whose slide, selection, or caret changed
// last, and two people who follow each other both stay where they are. the own avatar counts the
// followers, and this page sends its mode present while it presents

import type { Client } from './client.ts';
import { bdi, make, style, textOf } from './dom.ts';
import { addPersonItems, badge, everyone, onPersonPress } from './people.ts';
import { presenceOf, type Resolved } from './presence.ts';

// in ms, the time that the pill shows a notice, e.g. Stopped following Ana
const NOTICE = 4000;
// in px, the room that a box brought into view keeps from the edge of the canvas, and the
// thickness of a ruler of canvas/rulers.ts
const ROOM = 24;
const RULER = 18;

// the div is an item of the grid of the body over the canvas, as every child of the body, hence it
// is laid out without a read of layout. only the pill takes pointer events
const CSS = `
html.beeson-editor body > .beeson-session-follow { grid-area: canvas; position: relative; z-index: 52; display: flex; justify-content: center; align-items: flex-start; min-width: 0; min-height: 0; pointer-events: none; }
html.beeson-editor body > .beeson-session-follow[hidden], html.beeson-previewing body > .beeson-session-follow { display: none; }
.beeson-session-follow.rulers { margin: ${RULER}px 0 0 ${RULER}px; }
.beeson-session-follow.on { box-shadow: inset 0 0 0 3px var(--tone); }
.beeson-session-follow .pill { pointer-events: auto; display: inline-flex; align-items: center; gap: 8px; box-sizing: border-box; max-width: calc(100% - 16px); min-height: 36px; margin-top: 8px; padding: 2px 2px 2px 14px; border-radius: 18px; background: var(--tone); color: var(--ink); font: 600 12px/1.2 var(--ed-font, system-ui); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28); }
.beeson-session-follow .pill.bare { padding-right: 14px; }
.beeson-session-follow .pill .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.beeson-session-follow .pill button { flex: none; min-width: 32px; min-height: 32px; padding: 0 12px; border: 0; border-radius: 16px; background: var(--ed-bg); color: var(--ed-text); font: 500 12px/1 var(--ed-font, system-ui); cursor: default; }
.beeson-session-follow .pill button:hover { filter: brightness(1.15); }
.beeson-session-follow .pill button[hidden] { display: none; }
.beeson-edit-titlebar .right button.beeson-session-avatar .beeson-session-followers { position: absolute; z-index: 1; right: -7px; bottom: -6px; box-sizing: border-box; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px; background: var(--ed-text); color: var(--ed-bg); box-shadow: 0 0 0 1.5px var(--ed-bg); font: 600 9px/14px var(--ed-font, system-ui); text-align: center; }
.beeson-session-followers::after { content: attr(data-count); }
`;

export type Follow = {
  // the person followed, or null
  readonly target: string | null;
  // in ms, the time that the pill shows a notice, e.g. shortened by a test
  notice: number;
  start(person: string): void;
  stop(): void;
};

let active: Follow | null = null;

// stops following, e.g. at a comment or at Version History of a later pane
export function stopFollowing(): void {
  active?.stop();
}

// the controller of following, e.g. for a test
export function followOf(): Follow | null {
  return active;
}

// the order in which the slide, the selection, or the caret of each other page last changed
const ids = new WeakMap<Element, number>();
let nextId = 0;
const idOf = (el: Element | null | undefined): number => {
  if (!el) return 0;
  let n = ids.get(el);
  if (!n) ids.set(el, (n = ++nextId));
  return n;
};
const moved = new Map<string, { key: string; at: number }>();
let tick = 0;

function track(client: Client): void {
  const now = new Set<string>();
  for (const r of client.resolved()) {
    now.add(r.client);
    const key = [idOf(r.slide), idOf(r.caret?.el), r.caret?.at ?? -1, ...r.selected.map(idOf)].join();
    if (moved.get(r.client)?.key !== key) moved.set(r.client, { key, at: ++tick });
  }
  for (const id of [...moved.keys()]) if (!now.has(id)) moved.delete(id);
}

// the pages of person, the one whose slide, selection, or caret changed last first
export function pagesOf(client: Client, person: string): Resolved[] {
  const at = (r: Resolved) => moved.get(r.client)?.at ?? 0;
  return client.resolved().filter((r) => r.person === person).sort((a, b) => at(b) - at(a));
}

// the first name of a person in a running text, e.g. Following Ana, or the whole name when another
// person present has the same first name
export function callName(client: Client, person: string): string {
  const all = everyone(client);
  const name = all.find((p) => p.person === person)?.name ?? client.known.find((p) => p.person === person)?.name ?? '';
  const first = name.trim().split(/\s+/)[0] ?? '';
  const twin = all.some((p) => p.person !== person && p.name.trim().split(/\s+/)[0] === first);
  return (twin ? name.trim() : first) || name;
}

// the count of the people who follow this person, as a sentence
export function followersText(client: Client): string {
  const people = new Set(client.resolved().filter((r) => r.following === client.person && r.person !== client.person).map((r) => r.person));
  if (!people.size) return '';
  if (people.size > 1) return `${people.size} people are following you`;
  return `${callName(client, [...people][0])} is following you`;
}

export function install(client: Client): void {
  const { app } = client;
  style('follow', CSS);
  const box = make('div', 'beeson-session-follow');
  box.hidden = true;
  const pill = make('div', 'pill');
  const text = make('span', 'text');
  text.id = 'beeson-session-follow-text';
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-labelledby', text.id);
  const button = make('button');
  button.type = 'button';
  pill.append(text, button);
  box.append(pill);
  document.body.append(box);
  const live = make('div', 'beeson-session-live');
  live.setAttribute('role', 'status');
  document.body.append(live);

  let target: string | null = null;
  // a notice after following stopped
  let note: { person: string; left: boolean } | null = null;
  let noteTimer = 0;
  // set while this part changes the slide or the selection
  let guard = false;
  // the slide that following showed, and the current slide at the last change of the slide
  let shown: Element | null = null;
  let prev: Element | null = app.current();
  // the page and the elements last brought into view
  let viewed = '';
  let frame = 0;
  let mode: 'follow' | 'present' | 'history' = 'follow';
  let ended = false;

  const presence = () => presenceOf(client);
  const rulers = () => app.commands.get('view.rulers')?.checked?.(app) === true;

  const render = () => {
    const person = ended ? null : (target ?? note?.person ?? null);
    if (!person) {
      box.hidden = true;
      return;
    }
    const look = badge(client, person);
    box.style.setProperty('--tone', look.tone);
    box.style.setProperty('--ink', look.ink);
    box.classList.toggle('on', !!target);
    box.classList.toggle('rulers', rulers());
    const who = bdi(callName(client, person));
    let label: (string | Node)[];
    let act: string | null = 'Stop';
    if (!target) {
      label = note!.left ? [who, ' left the session'] : ['Stopped following ', who];
      act = note!.left ? null : 'Follow again';
    } else label = mode === 'present' ? [who, ' is presenting'] : mode === 'history' ? [who, ' is viewing the version history'] : ['Following ', who];
    if (text.textContent !== textOf(label)) text.replaceChildren(...label);
    button.textContent = act ?? '';
    button.hidden = !act;
    pill.classList.toggle('bare', !act);
    box.hidden = false;
  };

  const notify = (person: string, left: boolean) => {
    clearTimeout(noteTimer);
    note = { person, left };
    noteTimer = window.setTimeout(() => {
      note = null;
      render();
    }, controller.notice);
  };

  // the own avatar shows the count of the followers, and the avatar of the person followed is
  // pressed. people.ts draws the avatars first, at each change of the people
  const paintAvatars = () => {
    for (const b of document.querySelectorAll<HTMLElement>('.beeson-session-people .beeson-session-avatar[data-person]')) {
      const person = b.dataset.person!;
      if (person !== client.person) {
        b.setAttribute('aria-pressed', String(person === target));
        continue;
      }
      const count = new Set(client.resolved().filter((r) => r.following === person && r.person !== person).map((r) => r.person)).size;
      let dot = b.querySelector<HTMLElement>('.beeson-session-followers');
      if (!count) {
        dot?.remove();
        continue;
      }
      if (!dot) {
        dot = make('span', 'beeson-session-followers');
        dot.setAttribute('aria-hidden', 'true');
        b.append(dot);
      }
      dot.dataset.count = String(count);
      dot.title = followersText(client);
    }
  };

  // the selection or the caret of page in view, scrolled at the own zoom when it is outside the
  // canvas
  const bringIntoView = (page: Resolved) => {
    const els = (page.selected.length ? page.selected : page.caret ? [page.caret.el] : []).filter((el) => el.isConnected);
    const boxes = els.map((el) => el.getBoundingClientRect()).filter((b) => b.width || b.height);
    if (!boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.left)), top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.right)), bottom = Math.max(...boxes.map((b) => b.bottom));
    const v = app.stage.viewport;
    const delta = (lo: number, hi: number, from: number, to: number) => (lo < from + ROOM || hi - lo > to - from - 2 * ROOM ? lo - from - ROOM : hi > to - ROOM ? hi - to + ROOM : 0);
    const dx = delta(left, right, v.left, v.right), dy = delta(top, bottom, v.top, v.bottom);
    if (dx || dy) app.stage.el.scrollBy(Math.round(dx), Math.round(dy));
  };

  const follow = () => {
    if (!target || ended) return render();
    const pages = pagesOf(client, target);
    mode = pages.some((r) => r.mode === 'present') ? 'present' : pages.some((r) => r.mode === 'history') ? 'history' : 'follow';
    const page = pages[0];
    if (mode === 'follow' && page && page.following !== client.person) {
      const slide = page.slide;
      if (slide?.isConnected && slide !== app.current()) {
        guard = true;
        try {
          shown = slide;
          app.showSlide(slide);
        } finally {
          guard = false;
        }
      }
      const key = [page.client, idOf(page.caret?.el), ...page.selected.map(idOf)].join();
      if (key !== viewed && slide === app.current()) {
        viewed = key;
        cancelAnimationFrame(frame);
        // after the slide is laid out
        frame = requestAnimationFrame(() => target && bringIntoView(page));
      }
    }
    render();
  };

  const start = (person: string) => {
    if (ended || person === client.person || !everyone(client).some((p) => p.person === person)) return;
    clearTimeout(noteTimer);
    note = null;
    target = person;
    shown = app.current();
    viewed = '';
    const sel = app.selection;
    if (sel.kind === 'elements' || sel.kind === 'text') {
      guard = true;
      try {
        sel.clear();
      } finally {
        guard = false;
      }
    }
    presence()?.set({ following: person });
    live.textContent = `Following ${callName(client, person)}`;
    paintAvatars();
    follow();
  };

  const stop = (left = false) => {
    if (!target) return;
    const person = target;
    target = null;
    cancelAnimationFrame(frame);
    presence()?.set({ following: null });
    if (!left) live.textContent = `Stopped following ${callName(client, person)}`;
    if (!ended) notify(person, left);
    paintAvatars();
    render();
  };

  const controller: Follow = {
    get target() {
      return target;
    },
    notice: NOTICE,
    start,
    stop: () => stop(),
  };
  active = controller;

  const toggle = (person: string) => (target === person ? stop() : start(person));
  onPersonPress(toggle);
  addPersonItems((someone) => {
    if (someone.person === client.person) return [];
    const slide = pagesOf(client, someone.person)[0]?.slide;
    const n = slide?.isConnected ? client.shell.slides.numberOf(slide) : 0;
    return [
      { label: target === someone.person ? 'Stop Following' : 'Follow', run: () => toggle(someone.person) },
      ...(n ? [{ label: `Go to Slide ${n}`, run: () => slide!.isConnected && app.showSlide(slide!) }] : []),
    ];
  });

  button.addEventListener('click', () => {
    if (target) stop();
    else if (note && !note.left) start(note.person);
  });
  // on the window before the keys of the editor, which may take Escape on its way to the pill
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !pill.contains(document.activeElement) || (!target && !note)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (target) stop();
    else {
      clearTimeout(noteTimer);
      note = null;
      render();
    }
  }, true);

  app.listen('slide', () => {
    const now = app.current();
    // a slide taken off the page, e.g. by an edit of another person, is replaced by another one,
    // which this page did not choose
    const mine = !!prev?.isConnected;
    prev = now;
    if (!guard && target && mine && now !== shown) stop();
  });
  app.selection.listen(() => {
    const kind = app.selection.kind;
    if (!guard && target && (kind === 'elements' || kind === 'text')) stop();
  });
  client.port.onChange(() => stop());
  app.listen('report', () => box.classList.toggle('rulers', rulers()));

  // this page presents while the show is laid over it, or while the presenter view is open
  let playing = false;
  const watched = new WeakSet<Element>();
  const presenter = new MutationObserver(() => played());
  const played = () => {
    const dialog = document.querySelector('dialog.beeson-edit-presenter');
    if (dialog && !watched.has(dialog)) {
      watched.add(dialog);
      presenter.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    }
    const now = !!document.querySelector('body > .beeson-edit-show') || !!dialog?.hasAttribute('open');
    if (now === playing) return;
    playing = now;
    presence()?.set({ mode: now ? 'present' : 'edit' });
    if (now) stop();
  };
  const shows = new MutationObserver(played);
  shows.observe(document.body, { childList: true });

  client.on('resolved', () => {
    track(client);
    paintAvatars();
    follow();
  });
  client.on('people', () => {
    paintAvatars();
    if (target && !client.people.some((p) => p.person === target)) stop(true);
    else render();
  });
  client.on('me', paintAvatars);
  client.on('known', paintAvatars);
  const teardown = () => {
    if (ended) return;
    stop(true);
    ended = true;
    clearTimeout(noteTimer);
    shows.disconnect();
    presenter.disconnect();
    onPersonPress(null);
    box.remove();
    live.remove();
    if (active === controller) active = null;
  };
  client.on('ended', teardown);
  client.on('state', () => client.connection === 'ended' && teardown());
}
