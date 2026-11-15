// the presence of the other people on the canvas, as in UI.md section 3: a frame in the tone of a
// person around each element of the shown slide that the person selected, a name flag on its upper
// left corner, and the caret bar of a person in a text element. the boxes are read in one animation
// frame in fractions of the slide, and shell/canvas.ts lays .beeson-presence over the slide with the
// custom properties of .reveal, hence a pointer move, a scroll, or a zoom does not read layout

import type { Shape } from '../../editor/session/presence.ts';
import type { Client } from './client.ts';
import { bdi, make, style } from './dom.ts';
import { badge } from './people.ts';
import type { Resolved } from './presence.ts';

// in ms, the time that a flag shows the name before it collapses to a chip with initials
const NAMED = 3000;
// the flags of an element before the rest are counted in +N, and the px that the frame of each of
// them stands outside the frame of frames.ts
const FLAGS = 2;
const OUT = [4, 8];
// the side of the hit area of a chip in px
const HIT = 32;

const CSS = `
.beeson-presence { position: fixed; left: var(--ed-slide-x, 0px); top: var(--ed-slide-y, 0px); width: var(--ed-slide-w, 0px); height: var(--ed-slide-h, 0px); clip-path: var(--ed-clip, none); z-index: 50; pointer-events: none; --edge: #fff; }
html[data-theme="light"] .beeson-presence { --edge: #1d1d1f; }
html.beeson-previewing .beeson-presence, html.beeson-playing .beeson-presence, html:not(.beeson-editor) .beeson-presence { visibility: hidden; }
.beeson-presence .c0 { --tone: var(--data-2); --on: #1d1d1f; }
.beeson-presence .c1 { --tone: var(--data-3); --on: #1d1d1f; }
.beeson-presence .c2 { --tone: var(--data-5); --on: #fff; }
.beeson-presence .c3 { --tone: var(--data-7); --on: #1d1d1f; }
.beeson-presence .frame { position: absolute; box-sizing: border-box; border: 2px solid var(--tone); box-shadow: 0 0 0 1px var(--edge); border-radius: 2px; }
.beeson-presence .flags { position: absolute; display: flex; gap: 2px; align-items: flex-end; transform: translateY(calc(-100% - 3px)); white-space: nowrap; }
.beeson-presence .flag { box-sizing: border-box; height: 18px; max-width: 160px; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; border-radius: 4px 4px 4px 0; background: var(--tone); color: var(--on); box-shadow: 0 0 0 1px var(--edge); font: 600 11px/18px system-ui, sans-serif; }
.beeson-presence .flag.more { background: var(--ed-panel, #2c2c2e); color: var(--ed-text, #f5f5f7); --tone: var(--ed-panel, #2c2c2e); }
.beeson-presence .flag .short { display: none; }
.beeson-presence .flags:not(.hover) .flag.chip { width: 16px; height: 16px; padding: 0; border-radius: 50%; text-align: center; font-size: 8px; line-height: 16px; text-overflow: clip; }
.beeson-presence .flags:not(.hover) .flag.chip .long { display: none; }
.beeson-presence .flags:not(.hover) .flag.chip .short { display: inline; }
.beeson-presence .caret { position: absolute; width: 2px; margin-left: -1px; background: var(--tone); box-shadow: 0 0 0 1px var(--edge); }
`;

// the position of a box of fractions of the slide, grown by px on each side
const placed = (s: Shape, px: number): Partial<CSSStyleDeclaration> => ({
  left: `calc(${s.x * 100}% - ${px}px)`,
  top: `calc(${s.y * 100}% - ${px}px)`,
  width: `calc(${s.w * 100}% + ${2 * px}px)`,
  height: `calc(${s.h * 100}% + ${2 * px}px)`,
  transform: s.deg ? `rotate(${s.deg}deg)` : '',
});

export function install(client: Client): void {
  const { app, shell } = client;
  style('presence', CSS);
  const layer = make('div', 'beeson-presence');
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  let frame = 0;
  // the time from which each page shows its name, by client id, with its name and selection then
  const named = new Map<string, { at: number; name: string; selected: Element[] }>();
  let timer = 0;
  // the flags drawn on each element, for the hover
  let flagsOf = new Map<Element, HTMLElement>();
  let hovered: Element | null = null;

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  // a person shows the name from a new selection or name on, for NAMED ms
  const nameFrom = (r: Resolved, now: number): number => {
    const seen = named.get(r.client);
    if (!seen || seen.name !== r.name || seen.selected.length !== r.selected.length || r.selected.some((el, i) => el !== seen.selected[i])) named.set(r.client, { at: now, name: r.name, selected: r.selected });
    return named.get(r.client)!.at;
  };
  // a click after a tap on a chip does not reach the canvas
  let eat = false;

  function draw(): void {
    frame = 0;
    const slide = app.current();
    const now = Date.now();
    const list = [...client.resolved()].sort((a, b) => (a.client < b.client ? -1 : 1));
    const on = (el: Element): boolean => !!slide && slide.contains(el) && !el.closest('aside.notes');
    const byEl = new Map<Element, Resolved[]>();
    for (const r of list) for (const el of r.selected) if (on(el)) byEl.set(el, [...(byEl.get(el) ?? []), r]);
    const carets = list.filter((r) => r.caret && on(r.caret.el));
    const els = [...byEl.keys()];
    // every read of layout is made here, before the writes below
    const shapes = els.length || carets.length ? shell.presence.shapes(els, carets.map((r) => r.caret!)) : { els: [], carets: [] };
    const nodes: HTMLElement[] = [];
    const next = new Map<Element, HTMLElement>();
    let soonest = Infinity;
    els.forEach((el, i) => {
      const s = shapes.els[i];
      if (!s) return;
      const people = byEl.get(el)!;
      const framed = people.slice(0, FLAGS);
      framed.forEach((r, k) => {
        const f = make('div', `frame c${r.color % 4}`);
        Object.assign(f.style, placed(s, s.grow + OUT[k]));
        nodes.push(f);
      });
      const out = s.grow + OUT[framed.length - 1];
      const flags = make('div', 'flags');
      flags.dataset.client = framed.map((r) => r.client).join(' ');
      Object.assign(flags.style, { left: `calc(${s.x * 100}% - ${out}px)`, top: `calc(${s.y * 100}% - ${out}px)` });
      for (const r of framed) {
        const from = nameFrom(r, now);
        const collapsed = !r.typing && now - from >= NAMED;
        if (!collapsed && !r.typing) soonest = Math.min(soonest, from + NAMED);
        const flag = make('div', `flag c${r.color % 4}${collapsed ? ' chip' : ''}`);
        flag.dataset.client = r.client;
        const long = make('span', 'long');
        long.append(bdi(r.name), r.typing ? ' is typing' : '');
        flag.append(long, make('span', 'short', badge(client, r.person).initials));
        flag.title = r.name;
        flags.append(flag);
      }
      if (people.length > FLAGS) flags.append(make('div', 'flag more', `+${people.length - FLAGS}`));
      if (el === hovered) flags.classList.add('hover');
      next.set(el, flags);
      nodes.push(flags);
    });
    carets.forEach((r, i) => {
      const s = shapes.carets[i];
      if (!s) return;
      const c = make('div', `caret c${r.color % 4}`);
      c.dataset.client = r.client;
      Object.assign(c.style, { left: `${s.x * 100}%`, top: `${s.y * 100}%`, height: `${s.h * 100}%` });
      nodes.push(c);
    });
    layer.replaceChildren(...nodes);
    flagsOf = next;
    for (const id of [...named.keys()]) if (!list.some((r) => r.client === id)) named.delete(id);
    clearTimeout(timer);
    if (soonest < Infinity) timer = window.setTimeout(schedule, soonest - now + 20);
  }

  app.onRefresh(['content', 'selection', 'slide', 'structure'], schedule);
  client.on('resolved', schedule);
  client.on('ended', () => layer.remove());

  // the flags of the element under the pointer show the names, by a class alone
  window.addEventListener('pointermove', () => {
    const h = shell.presence.hovered();
    if (h === hovered) return;
    flagsOf.get(hovered!)?.classList.remove('hover');
    hovered = h;
    flagsOf.get(h!)?.classList.add('hover');
  }, { passive: true });

  // a tap on a chip shows the name, hit-tested in a square of HIT px around the chip
  window.addEventListener('pointerdown', (ev) => {
    const chips = layer.querySelectorAll<HTMLElement>('.flags:not(.hover) .flag.chip');
    if (!chips.length) return;
    for (const chip of chips) {
      const r = chip.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.abs(ev.clientX - cx) > HIT / 2 || Math.abs(ev.clientY - cy) > HIT / 2) continue;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      eat = true;
      const id = chip.dataset.client!;
      const seen = named.get(id);
      if (seen) seen.at = Date.now();
      schedule();
      return;
    }
  }, true);
  window.addEventListener('click', (ev) => {
    if (!eat) return;
    eat = false;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
  window.addEventListener('pointerdown', () => void (eat = false));
}
