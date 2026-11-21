import type { Edit } from '../../editor/merge.ts';
import { shiftOffset } from '../patch.ts';
import { parseVersion, type AppliedOp, type Patch } from '../protocol.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import { callName } from './follow.ts';
import { badge, everyone } from './people.ts';

const MAX = 3;

const CSS = `
.beeson-session-dots { position: absolute; top: 4px; right: 4px; z-index: 1; display: flex; align-items: center; gap: 2px; }
.beeson-edit-nav .row.skip .beeson-session-dots { top: -6px; }
.beeson-session-dots i { box-sizing: border-box; flex: none; width: 10px; height: 10px; border-radius: 5px; background: var(--tone); color: var(--ink); box-shadow: 0 0 0 1.5px var(--ed-panel); font: normal 600 8px/10px var(--ed-font, system-ui); font-style: normal; text-align: center; letter-spacing: -0.2px; }
.beeson-session-dots i.chip { width: auto; min-width: 14px; height: 12px; padding: 0 3px; border-radius: 6px; line-height: 12px; }
.beeson-session-dots i.more { width: auto; height: 12px; padding: 0 3px; border-radius: 6px; background: var(--ed-panel); color: var(--ed-text); line-height: 12px; }
.beeson-edit-sorter .beeson-session-dots { top: 6px; right: 6px; gap: 3px; }
.beeson-edit-sorter .beeson-session-dots i { width: 16px; height: 16px; border-radius: 8px; line-height: 16px; }
.beeson-edit-sorter .beeson-session-dots i.more { width: auto; padding: 0 4px; }
.beeson-session-dots .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

type On = { person: string; name: string; color: number };

function between(a: string, b: string): Patch[] {
  if (a === b) return [];
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  let j = 0;
  while (j < n - i && a.charCodeAt(a.length - 1 - j) === b.charCodeAt(b.length - 1 - j)) j++;
  return [{ start: i, end: a.length - j, text: b.slice(i, b.length - j) }];
}

export function install(client: Client): void {
  const { app } = client;
  const hooks = client.shell.slides;
  style('dots', CSS);
  let frame = 0;
  let ids = 0;
  const drawn = new Map<HTMLElement, string>();
  const by = new Map<Element, string>();

  const sentence = (slide: Element): string => {
    const author = by.get(slide);
    if (!author) return '';
    return author === 'file' ? 'Changed in index.html since you last saw it.' : `Changed by ${callName(client, author)} since you last saw it.`;
  };

  const put = (owner: HTMLElement, on: On[], shared: (color: number) => boolean, big: boolean, changed: string) => {
    const frameEl = owner.querySelector<HTMLElement>(':scope > .frame');
    if (!frameEl) return;
    const key = JSON.stringify([on, on.map((p) => shared(p.color)), changed]);
    if (drawn.get(frameEl) === key) return;
    let box = frameEl.querySelector<HTMLElement>(':scope > .beeson-session-dots');
    if (!on.length && !changed) {
      drawn.delete(frameEl);
      box?.remove();
      if (owner.getAttribute('aria-describedby')?.startsWith('beeson-session-dots-')) owner.removeAttribute('aria-describedby');
      return;
    }
    drawn.set(frameEl, key);
    if (!box) {
      box = make('span', 'beeson-session-dots');
      box.id = `beeson-session-dots-${++ids}`;
      frameEl.append(box);
    }
    owner.setAttribute('aria-describedby', box.id);
    const dot = (cls: string, text: string, label: string) => {
      const el = make('i', cls, text);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', label);
      el.title = label;
      return el;
    };
    const list = on.slice(0, on.length > MAX ? MAX : on.length).map((p) => {
      const look = badge(client, p.person);
      const chip = big || shared(p.color);
      const el = dot(chip && !big ? 'chip' : '', chip ? look.initials : '', p.name);
      el.style.setProperty('--tone', look.tone);
      el.style.setProperty('--ink', look.ink);
      return el;
    });
    const rest = on.slice(MAX);
    if (rest.length) list.push(dot('more', `+${rest.length}`, rest.map((p) => p.name).join(', ')));
    if (changed) list.push(make('span', 'sr', changed));
    box.replaceChildren(...list);
  };

  const draw = () => {
    frame = 0;
    if (client.connection === 'ended') return;
    const all = everyone(client);
    const order = new Map(all.map((p, i) => [p.person, i]));
    const tones = new Map<number, number>();
    for (const p of all) tones.set(((p.color % 4) + 4) % 4, (tones.get(((p.color % 4) + 4) % 4) ?? 0) + 1);
    const shared = (color: number) => (tones.get(((color % 4) + 4) % 4) ?? 0) > 1;
    const on = new Map<Element, On[]>();
    for (const r of client.resolved()) {
      if (r.person === client.person || !r.person || !r.slide?.isConnected) continue;
      const list = on.get(r.slide) ?? [];
      if (!list.some((p) => p.person === r.person)) list.push({ person: r.person, name: r.name, color: r.color });
      on.set(r.slide, list);
    }
    for (const list of on.values()) list.sort((a, b) => (order.get(a.person) ?? 0) - (order.get(b.person) ?? 0));
    if (by.size) {
      const slides = [...app.slides().querySelectorAll(':scope > section')];
      const marked = new Set(hooks.marked().map((n) => slides[n - 1]));
      for (const s of [...by.keys()]) if (!marked.has(s)) by.delete(s);
    }
    const seen = new Set<HTMLElement>();
    const rows = new Set<Element>([...on.keys(), ...by.keys()]);
    for (const slide of rows) {
      const row = hooks.row(slide);
      if (!row) continue;
      const changed = sentence(slide);
      put(row, on.get(slide) ?? [], shared, false, changed);
      const no = row.querySelector<HTMLElement>(':scope > .no');
      if (no && no.title !== changed) no.title = changed;
      seen.add(row.querySelector<HTMLElement>(':scope > .frame')!);
    }
    for (const [slide, tile] of hooks.tiles()) {
      const list = on.get(slide) ?? [];
      if (!list.length && !drawn.has(tile.querySelector<HTMLElement>(':scope > .frame')!)) continue;
      put(tile, list, shared, true, '');
      seen.add(tile.querySelector<HTMLElement>(':scope > .frame')!);
    }
    for (const el of [...drawn.keys()]) {
      if (seen.has(el)) continue;
      const owner = el.parentElement;
      drawn.delete(el);
      el.querySelector(':scope > .beeson-session-dots')?.remove();
      if (owner?.getAttribute('aria-describedby')?.startsWith('beeson-session-dots-')) owner.removeAttribute('aria-describedby');
      const no = owner?.querySelector<HTMLElement>(':scope > .no');
      if (no?.title) no.title = '';
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  let pending: AppliedOp[] = [];
  client.on('ops', (ops) => void pending.push(...ops));
  client.on('applied', () => {
    const base = client.base;
    const at = base && parseVersion(base.v);
    const source = client.shell.presence.source();
    if (!at || source === null) return;
    const done: AppliedOp[] = [];
    pending = pending.filter((op) => {
      const v = parseVersion(op.v);
      if (!v || v.epoch !== at.epoch) return false;
      if (v.n > at.n) return true;
      done.push(op);
      return false;
    });
    if (!done.some((op) => op.author !== client.person)) return;
    done.sort((a, b) => parseVersion(a.v)!.n - parseVersion(b.v)!.n);
    const local = between(base.text, source);
    const ranges = new Map<string, Edit[]>();
    done.forEach((op, i) => {
      if (op.author === client.person) return;
      let delta = 0;
      const own = op.patches.map((p) => {
        const r = { start: p.start + delta, end: p.start + delta + p.text.length, text: '' };
        delta += p.text.length - (p.end - p.start);
        return r;
      });
      for (const later of [...done.slice(i + 1).map((o) => o.patches), local]) {
        for (const r of own) {
          r.start = shiftOffset(r.start, later, false);
          r.end = Math.max(r.start, shiftOffset(r.end, later, true));
        }
      }
      ranges.delete(op.author);
      ranges.set(op.author, own);
    });
    const current = app.current();
    const slides = [...app.slides().querySelectorAll(':scope > section')];
    const marked = new Set(hooks.marked());
    const add: number[] = [];
    for (const [author, list] of ranges) {
      for (const slide of hooks.slidesIn(list)) {
        if (slide === current) continue;
        by.set(slide, author);
        const n = slides.indexOf(slide) + 1;
        if (n && !marked.has(n)) {
          marked.add(n);
          add.push(n);
        }
      }
    }
    if (add.length) hooks.mark(add);
    schedule();
  });

  hooks.onRefresh(schedule);
  client.on('resolved', schedule);
  client.on('people', schedule);
  client.on('known', schedule);
  client.on('me', schedule);
  client.on('state', () => {
    if (client.connection !== 'ended') return;
    cancelAnimationFrame(frame);
    frame = 0;
    for (const el of drawn.keys()) el.querySelector(':scope > .beeson-session-dots')?.remove();
    drawn.clear();
  });
}
