import type { Shape } from '../../editor/session/presence.ts';
import type { Client } from './client.ts';
import { bdi, make, style } from './dom.ts';
import { badge } from './people.ts';
import type { Resolved } from './presence.ts';

const NAMED = 3000;
const FLAGS = 2;
const OUT = [4, 8];
const HIT = 32;
const FLAG = 21;
const GESTURE = ['beeson-dragging', 'beeson-sizing', 'beeson-rotating'];
const TONES = ['--data-2', '--data-3', '--data-5', '--data-7'];

const CSS = `
.beeson-presence-cell { position: fixed; inset: 0; clip-path: var(--ed-cell-clip, none); z-index: 50; pointer-events: none; }
.beeson-presence { position: absolute; left: var(--ed-slide-x, 0px); top: var(--ed-slide-y, 0px); width: var(--ed-slide-w, 0px); height: var(--ed-slide-h, 0px); --edge: #fff; }
html[data-theme="light"] .beeson-presence { --edge: #1d1d1f; }
html.beeson-previewing .beeson-presence, html.beeson-playing .beeson-presence, html:not(.beeson-editor) .beeson-presence { visibility: hidden; }
.beeson-presence .c0 { --tone: var(--data-2); --on: #1d1d1f; }
.beeson-presence .c1 { --tone: var(--data-3); --on: #1d1d1f; }
.beeson-presence .c2 { --tone: var(--data-5); --on: #fff; }
.beeson-presence .c3 { --tone: var(--data-7); --on: #1d1d1f; }
.beeson-presence .frame { position: absolute; box-sizing: border-box; border: 2px solid var(--tone); box-shadow: 0 0 0 1px var(--edge); border-radius: 2px; }
.beeson-presence .flags { position: absolute; display: flex; gap: 2px; align-items: flex-end; transform: translateY(calc(-100% - 3px)); white-space: nowrap; }
.beeson-presence .flags.inside { transform: translateY(3px); }
.beeson-presence .flag { box-sizing: border-box; height: 18px; max-width: 160px; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; border-radius: 4px 4px 4px 0; background: var(--tone); color: var(--on); box-shadow: 0 0 0 1px var(--edge); font: 600 11px/18px system-ui, sans-serif; }
.beeson-presence .flag.more { background: var(--ed-panel, #2c2c2e); color: var(--ed-text, #f5f5f7); --tone: var(--ed-panel, #2c2c2e); }
.beeson-presence .flag .short { display: none; }
.beeson-presence .flags:not(.hover) .flag.chip { width: 16px; height: 16px; padding: 0; border-radius: 50%; text-align: center; font-size: 8px; line-height: 16px; text-overflow: clip; }
.beeson-presence .flags:not(.hover) .flag.chip .long { display: none; }
.beeson-presence .flags:not(.hover) .flag.chip .short { display: inline; }
.beeson-presence .caret { position: absolute; width: 2px; margin-left: -1px; background: var(--tone); box-shadow: 0 0 0 1px var(--edge); }
`;

type Kept = { s: Shape; at: [number, number] };

const placed = (s: Shape, px: number): Partial<CSSStyleDeclaration> => ({
  left: `calc(${s.x * 100}% - ${px}px)`,
  top: `calc(${s.y * 100}% - ${px}px)`,
  width: `calc(${s.w * 100}% + ${2 * px}px)`,
  height: `calc(${s.h * 100}% + ${2 * px}px)`,
  transform: s.deg ? `rotate(${s.deg}deg)` : '',
});

let pen: CanvasRenderingContext2D | null | undefined;
const widthOf = (text: string): number => {
  if (pen === undefined) pen = document.createElement('canvas').getContext('2d');
  if (!pen) return 160;
  pen.font = '600 11px system-ui, sans-serif';
  return Math.min(160, Math.ceil(pen.measureText(text).width) + 12);
};

export function install(client: Client): void {
  const { app, shell } = client;
  style('presence', CSS);
  const cell = make('div', 'beeson-presence-cell');
  const layer = make('div', 'beeson-presence');
  cell.setAttribute('aria-hidden', 'true');
  cell.append(layer);
  document.body.append(cell);
  let frame = 0;
  const named = new Map<string, { at: number; name: string; selected: Element[] }>();
  let timer = 0;
  let flagsOf = new Map<Element, HTMLElement>();
  let hovered: Element | null = null;
  let chips: { flags: HTMLElement; id: string; x: number; y: number; dx: number; dy: number }[] = [];
  let kept = { els: new Map<Element, Kept>(), groups: new Map<Element, Element[]>(), carets: new Map<string, Kept & { el: Element; offset: number; from: number; deg: number; line: number; range: Range | null }>(), W: 1, H: 1, edge: -Infinity, height: 0 };
  const highlights = typeof Highlight === 'function' ? (window.CSS.highlights ?? null) : null;
  const tint = (): void => {
    const root = getComputedStyle(document.documentElement);
    const names = TONES.map((_, i) => `::highlight(beeson-c${i})`);
    const hidden = ['html.beeson-previewing', 'html.beeson-playing', 'html:not(.beeson-editor)'].flatMap((h) => names.map((n) => `${h} ${n}`));
    style('highlight', '');
    document.getElementById('beeson-session-highlight')!.textContent = [
      ...names.map((n, i) => `${n} { background-color: color-mix(in srgb, ${root.getPropertyValue(TONES[i]).trim() || 'transparent'} 30%, transparent); }`),
      `${hidden.join(', ')} { background-color: transparent; }`,
    ].join('\n');
  };
  if (highlights) {
    tint();
    new MutationObserver(tint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const nameFrom = (r: Resolved, now: number): number => {
    const seen = named.get(r.client);
    if (!seen || seen.name !== r.name || seen.selected.length !== r.selected.length || r.selected.some((el, i) => el !== seen.selected[i])) named.set(r.client, { at: now, name: r.name, selected: r.selected });
    return named.get(r.client)!.at;
  };
  let eat = false;

  const offset = (el: Element): [number, number] => {
    let x = 0, y = 0;
    for (let e: Element | null = el; e && e !== app.slides(); e = e.parentElement) {
      const [a, b] = ((e as HTMLElement).style?.translate ?? '').split(/\s+/);
      x += parseFloat(a) || 0;
      y += parseFloat(b) || 0;
    }
    return [x, y];
  };
  const turnOf = (el: Element): number => {
    let deg = 0;
    for (let e: Element | null = el; e && e !== app.slides(); e = e.parentElement) deg += parseFloat((e as HTMLElement).style?.rotate ?? '') || 0;
    return deg;
  };
  const moved = (k: Kept, el: Element): Shape => {
    const [x, y] = offset(el);
    return x === k.at[0] && y === k.at[1] ? k.s : { ...k.s, x: k.s.x + (x - k.at[0]) / kept.W, y: k.s.y + (y - k.at[1]) / kept.H };
  };

  function measure(els: Element[], carets: Resolved[]): void {
    const members = new Set([...kept.groups.values()].flat());
    const known = els.every((el) => kept.els.has(el) || members.has(el)) && carets.every((r) => {
      const k = kept.carets.get(r.client);
      return k?.el === r.caret!.el && k.offset === r.caret!.at && k.from === r.caret!.from;
    });
    if (known && GESTURE.some((c) => document.documentElement.classList.contains(c))) return;
    const groups = els.length > 1 ? shell.groups(els) : [];
    const grouped = new Set(groups.flatMap((g) => g.els));
    const singles = els.filter((el) => !grouped.has(el));
    const shapes = singles.length || carets.length ? shell.presence.shapes(singles, carets.map((r) => r.caret!)) : { els: [], carets: [], ranges: [] };
    const slides = app.slides() as HTMLElement;
    const box = els.length ? layer.getBoundingClientRect() : null;
    const top = box ? (app.stage?.viewport.top ?? -Infinity) - box.top : -Infinity;
    kept = { els: new Map(), groups: new Map(), carets: new Map(), W: slides.offsetWidth || 1, H: slides.offsetHeight || 1, edge: top, height: box?.height ?? 0 };
    singles.forEach((el, i) => {
      const s = shapes.els[i];
      if (s) kept.els.set(el, { s, at: offset(el) });
    });
    for (const g of groups) {
      kept.els.set(g.els[0], { s: g.shape, at: offset(g.els[0]) });
      kept.groups.set(g.els[0], g.els);
    }
    carets.forEach((r, i) => {
      const s = shapes.carets[i];
      const { el, at, from } = r.caret!;
      if (!s) return;
      const deg = turnOf(el);
      const cs = deg ? getComputedStyle(el) : null;
      const line = cs ? parseFloat(cs.lineHeight) || 1.2 * parseFloat(cs.fontSize) : 0;
      kept.carets.set(r.client, { s, at: offset(el), el, offset: at, from, deg, line, range: shapes.ranges[i] ?? null });
    });
  }

  const flagOf = (r: Resolved, now: number, soon: (at: number) => void): { flag: HTMLElement; chip: boolean; width: number } => {
    const from = nameFrom(r, now);
    const collapsed = !r.typing && now - from >= NAMED;
    if (!collapsed && !r.typing) soon(from + NAMED);
    const flag = make('div', `flag c${r.color % 4}${collapsed ? ' chip' : ''}`);
    flag.dataset.client = r.client;
    const long = make('span', 'long');
    long.append(bdi(r.name), r.typing ? ' is typing' : '');
    flag.append(long, make('span', 'short', badge(client, r.person).initials));
    flag.title = r.name;
    return { flag, chip: collapsed, width: collapsed ? 16 : widthOf(r.typing ? `${r.name} is typing` : r.name) };
  };

  function draw(): void {
    frame = 0;
    const slide = app.current();
    const now = Date.now();
    const list = [...client.resolved()].sort((a, b) => (a.client < b.client ? -1 : 1));
    const on = (el: Element): boolean => !!slide && slide.contains(el) && !el.closest('aside.notes');
    const byEl = new Map<Element, Resolved[]>();
    for (const r of list) for (const el of r.selected) if (on(el)) byEl.set(el, [...(byEl.get(el) ?? []), r]);
    const carets = list.filter((r) => r.caret && on(r.caret.el));
    measure([...byEl.keys()], carets);
    const head = new Map<Element, Element>();
    for (const [h, members] of kept.groups) for (const m of members) head.set(m, h);
    const units = new Map<Element, Resolved[]>();
    for (const [el, people] of byEl) {
      const h = head.get(el) ?? el;
      const all = units.get(h) ?? [];
      for (const r of people) if (!all.includes(r)) all.push(r);
      units.set(h, all);
    }
    const nodes: HTMLElement[] = [];
    const next = new Map<Element, HTMLElement>();
    const placedChips: typeof chips = [];
    let soonest = Infinity;
    const soon = (at: number) => (soonest = Math.min(soonest, at));
    for (const [el, people] of units) {
      const k = kept.els.get(el);
      if (!k) continue;
      const s = moved(k, el);
      const framed = people.slice(0, FLAGS);
      framed.forEach((r, i) => {
        const f = make('div', `frame c${r.color % 4}`);
        Object.assign(f.style, placed(s, s.grow + OUT[i]));
        nodes.push(f);
      });
      const out = s.grow + OUT[framed.length - 1];
      const flags = make('div', 'flags');
      flags.dataset.client = framed.map((r) => r.client).join(' ');
      Object.assign(flags.style, { left: `calc(${s.x * 100}% - ${out}px)`, top: `calc(${s.y * 100}% - ${out}px)` });
      const inside = s.y * kept.height - out - FLAG < kept.edge;
      if (inside) flags.classList.add('inside');
      const made = framed.map((r) => flagOf(r, now, soon));
      const row = made.every((m) => m.chip) && people.length <= FLAGS ? 16 : 18;
      let left = 0;
      for (const [i, m] of made.entries()) {
        flags.append(m.flag);
        if (m.chip) placedChips.push({ flags, id: framed[i].client, x: s.x, y: s.y, dx: left - out, dy: (inside ? 3 + row : -3) - out - 16 });
        left += m.width + 2;
      }
      if (people.length > FLAGS) flags.append(make('div', 'flag more', `+${people.length - FLAGS}`));
      if (el === hovered || kept.groups.get(el)?.includes(hovered!)) flags.classList.add('hover');
      for (const m of kept.groups.get(el) ?? [el]) next.set(m, flags);
      nodes.push(flags);
    }
    const ranges: Range[][] = TONES.map(() => []);
    for (const r of carets) {
      const k = kept.carets.get(r.client);
      if (!k) continue;
      if (k.range) ranges[r.color % 4].push(k.range);
      const s = moved(k, k.el);
      const { W, H } = kept;
      const a = (k.deg * Math.PI) / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
      const length = !k.deg ? s.h * H : cos > 0.5 ? (s.h * H) / cos : k.line;
      const cx = s.x * W + (length * sin) / 2, cy = s.y * H + (length * cos) / 2;
      const c = make('div', `caret c${r.color % 4}`);
      c.dataset.client = r.client;
      Object.assign(c.style, { left: `${(cx / W) * 100}%`, top: `${((cy - length / 2) / H) * 100}%`, height: `${(length / H) * 100}%`, transform: k.deg ? `rotate(${k.deg}deg)` : '' });
      nodes.push(c);
      if (units.get(head.get(r.caret!.el) ?? r.caret!.el)?.slice(0, FLAGS).includes(r)) continue;
      const flags = make('div', 'flags');
      flags.dataset.caret = r.client;
      const tip = { x: cx + (length / 2) * Math.sin(a), y: cy - (length / 2) * Math.cos(a) };
      Object.assign(flags.style, { left: `${(tip.x / W) * 100}%`, top: `${(tip.y / H) * 100}%` });
      const m = flagOf(r, now, soon);
      flags.append(m.flag);
      if (m.chip) placedChips.push({ flags, id: r.client, x: tip.x / W, y: tip.y / H, dx: 0, dy: -3 - 16 });
      nodes.push(flags);
    }
    layer.replaceChildren(...nodes);
    if (highlights) ranges.forEach((list, i) => (list.length ? highlights.set(`beeson-c${i}`, new Highlight(...list)) : highlights.delete(`beeson-c${i}`)));
    flagsOf = next;
    chips = placedChips;
    for (const id of [...named.keys()]) if (!list.some((r) => r.client === id)) named.delete(id);
    clearTimeout(timer);
    if (soonest < Infinity) timer = window.setTimeout(schedule, soonest - now + 20);
  }

  app.onRefresh(['content', 'selection', 'slide', 'structure'], schedule);
  client.on('resolved', schedule);
  client.on('ended', () => {
    cell.remove();
    TONES.forEach((_, i) => highlights?.delete(`beeson-c${i}`));
  });

  window.addEventListener('pointermove', () => {
    const h = shell.presence.hovered();
    if (h === hovered) return;
    flagsOf.get(hovered!)?.classList.remove('hover');
    hovered = h;
    flagsOf.get(h!)?.classList.add('hover');
  }, { passive: true });

  window.addEventListener('pointerdown', (ev) => {
    eat = false;
    const target = ev.target instanceof Element ? ev.target : null;
    const html = document.documentElement.classList;
    if (!chips.length || !target || !html.contains('beeson-editor') || html.contains('beeson-previewing') || html.contains('beeson-playing')) return;
    if (!target.closest('.reveal:not(.beeson-peek), .beeson-edit-canvas') || target.closest('aside.notes, .beeson-overlay')) return;
    const vars = getComputedStyle(layer);
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((p) => parseFloat(vars.getPropertyValue(`--ed-slide-${p}`)) || 0);
    const half = ev.pointerType === 'mouse' ? 8 : HIT / 2;
    for (const c of chips) {
      if (c.flags.classList.contains('hover')) continue;
      const cx = x + c.x * w + c.dx + 8, cy = y + c.y * h + c.dy + 8;
      if (Math.abs(ev.clientX - cx) > half || Math.abs(ev.clientY - cy) > half) continue;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      eat = true;
      const seen = named.get(c.id);
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
}
