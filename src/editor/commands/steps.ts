import type { App } from '../app.ts';
import { CHILD, moveTo, oneByOne, placedIndex, setFinal, setIndexReader, setStart, setStep, shift, stepAt, type Plan, type Start } from '../shown-steps.ts';
import type { TagEdit } from '../tags.ts';
import { docOf } from './slide.ts';
import { selectedRows } from './table.ts';
import { AFTER_DEFAULT, MIN_DELAY, WITH_SLIDE, afterable, carryDelays, classesOf, deliverPlan, deliveryOf, delaysOf, PLAYED, effectEdit, effectOf, indexIn, listItems, listOf, modelAt, modelOf, startAt, writePlan, type Delivery, type Effect, type Model, type StartKind, type Steps } from '../steps.ts';

type Arg = { el?: Element } & Record<string, unknown>;

function itemOf(app: App, arg: unknown): Element | null {
  const given = (arg as Arg | undefined)?.el;
  const el = given instanceof Element ? given : app.selection.only();
  if (!el) return null;
  const m = modelOf(app, el.closest('section'));
  if (!m) return null;
  for (let up: Element | null = el; up && up !== m.slide; up = up.parentElement) if (indexIn(m, up) >= 0) return up.matches(CHILD) ? null : up;
  return m.els.find((x, k) => !m.lines[k] && !x.matches(CHILD) && el.contains(x)) ?? null;
}

function change(app: App, arg: unknown, fn: (plan: Plan, i: number) => Plan): void {
  const el = itemOf(app, arg);
  const m = el ? modelAt(app, el) : null;
  if (m) writePlan(app, m, fn(m.plan, m.i));
}

function itemsOf(app: App, arg: unknown): { m: Model; items: { el: Element; i: number }[] } | null {
  const sel = app.selection;
  const many = !((arg as Arg | undefined)?.el instanceof Element) && sel.kind === 'elements' && sel.items.length > 1;
  const rows = (arg as Arg | undefined)?.el instanceof Element ? null : selectedRows(app);
  const els = rows ?? (many ? [...new Set(sel.items.flatMap((el) => itemOf(app, { el }) ?? []))] : [itemOf(app, arg)].flatMap((el) => el ?? []));
  const m = els.length ? modelOf(app, els[0].closest('section'), rows ?? []) : null;
  const items = m ? els.map((el) => ({ el, i: indexIn(m, el) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i) : [];
  return m && items.length ? { m, items } : null;
}

function changeEach(app: App, arg: unknown, fn: (plan: Plan, i: number, first: number) => Plan): void {
  const s = itemsOf(app, arg);
  if (s) writePlan(app, s.m, s.items.reduce((p, { i }) => fn(p, i, s.items[0].i), s.m.plan));
}

const stepsIn = (m: Model, i: number): number[] =>
  stepAt(m.plan, i) >= 0 ? [i] : m.els.flatMap((x, k) => (k !== i && !m.lines[k] && m.els[i].contains(x) && stepAt(m.plan, k) >= 0 ? [k] : []));

function stepsFor(app: App, el: Element | null): { m: Model & { i: number }; at: number[] } | null {
  const m = el ? modelAt(app, el) : null;
  return m ? { m, at: stepsIn(m, m.i) } : null;
}

const stepped = (app: App, arg?: unknown): boolean => !!stepsFor(app, itemOf(app, arg))?.at.length;

function msOf(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`a delay of ${seconds} s is not a time`);
  return Math.min(600000, Math.max(MIN_DELAY, Math.round(seconds * 1000)));
}

function listAt(app: App, arg: unknown): Element | null {
  const given = (arg as Arg | undefined)?.el;
  const sel = app.selection;
  const el = given instanceof Element ? given : sel.only() ?? (sel.kind === 'text' ? sel.items[0] ?? null : null);
  const list = listOf(el);
  const paired = (x: Element) => !!app.pairing?.elements.get(x)?.open;
  if (list?.localName === 'table' && !listItems(list).length) return null;
  return list && paired(list) && listItems(list).every(paired) ? list : null;
}

function deliver(app: App, list: Element, by: Delivery | null): void {
  const lis = listItems(list);
  const m = modelOf(app, list.closest('section'), [list, ...lis]);
  if (!m || !lis.length) return;
  const at = m.els.indexOf(list);
  const items = lis.map((li) => m.els.indexOf(li));
  if (at < 0 || items.some((i) => i < 0)) return;
  const plan = deliverPlan(m.plan, at, items, by);
  const from = m.items[at].fragment ? at : items.find((i) => m.items[i].fragment);
  const effect = from === undefined ? null : effectOf(classesOf(app, m.els[from])).id;
  const extra = new Map<Element, TagEdit>();
  if (effect && by) {
    for (const i of by === 'all' ? [at] : items) {
      const edit = effectEdit(app.doc.tagState(m.els[i]), effect);
      if (i !== from && Object.keys(edit).length) extra.set(m.els[i], edit);
    }
  }
  const standIn = new Map(by === 'item' ? [[at, items[0]]] : items.map((i) => [i, at]));
  writePlan(app, m, plan, extra, carryDelays(m.plan, plan, delaysOf(app, m), standIn));
}

const num = (v: string | null | undefined): number | null => (v != null && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null);

function indexOf(app: App, el: Element): string | null {
  const paired = (f: Element) => !!app.pairing?.elements.get(f)?.open;
  if (paired(el)) return app.doc.tagState(el).attrs['data-fragment-index'] ?? null;
  const placed = placedIndex(el);
  if (placed !== undefined) return placed;
  const me = num(el.getAttribute('data-fragment-index'));
  const slide = el.closest('section');
  if (me === null || !slide) return me === null ? null : String(me);
  const known = [...slide.querySelectorAll('.fragment')].flatMap((f) => {
    if (!paired(f) || app.tagEdits.get(f)?.index !== undefined) return [];
    const page = num(f.getAttribute('data-fragment-index'));
    const file = num(app.doc.tagState(f).attrs['data-fragment-index']);
    return page === null || file === null ? [] : [{ page, file }];
  });
  const same = known.find((k) => k.page === me);
  if (same) return String(same.file);
  const lo = known.filter((k) => k.page < me).sort((a, b) => b.page - a.page)[0];
  const hi = known.filter((k) => k.page > me).sort((a, b) => a.page - b.page)[0];
  if (lo && hi) return String((lo.file + hi.file) / 2);
  if (lo) return String(lo.file + me - lo.page);
  if (hi) return String(hi.file - (hi.page - me));
  return String(me);
}

export function startOnClick(app: App, video: Element, on: boolean): void {
  const el = video.closest('.fragment.play') ?? video;
  const m = modelOf(app, el.closest('section'), [el]);
  const i = m ? indexIn(m, el) : -1;
  if (!m || i < 0) return;
  if (!on && el.matches('tycho-viewer, :has(tycho-viewer)')) {
    writePlan(app, m, setStep(m.plan, i, null));
    return;
  }
  const edit = effectEdit(app.doc.tagState(m.els[i]), on ? 'play' : 'in');
  const plan = on && stepAt(m.plan, i) < 0 ? setStep(m.plan, i, 'last') : m.plan;
  writePlan(app, m, plan, Object.keys(edit).length ? new Map([[m.els[i], edit]]) : new Map());
}

export function install(app: App): void {
  const steps = app.steps as Steps;
  steps.attach(app);
  setIndexReader((el) => indexOf(app, el));
  const c = app.commands;
  const menu = (order: number) => ({ bar: 'Slide', group: 'steps', order });
  c.define({
    id: 'steps.preview',
    label: (a) => ((a.steps as Steps).previewing ? 'Stop Preview' : 'Preview Steps'),
    menu: menu(60),
    enabled: (a) => (a.steps as Steps).previewing || !!modelOf(a)?.items.some((it) => it.fragment),
    run: (a) => (a.steps as Steps).preview(),
  });
  const fromOf = (a: App, arg: unknown): number | null => {
    const given = (arg as { step?: unknown } | undefined)?.step;
    if (typeof given === 'number' && given >= 0) return given;
    const chosen = (a.steps as Steps).selectedStep();
    if (chosen !== null) return chosen;
    const el = itemOf(a, arg);
    const m = el ? modelAt(a, el) : null;
    const k = m ? stepAt(m.plan, m.i) : -1;
    return k >= 0 ? k : null;
  };
  c.define({
    id: 'steps.playFrom',
    label: (a) => ((a.steps as Steps).previewing ? 'Stop Preview' : 'Play From Selected Step'),
    menu: menu(60.5),
    enabled: (a) => (a.steps as Steps).previewing || fromOf(a, undefined) !== null,
    run: (a, arg) => {
      const steps = a.steps as Steps;
      if (steps.previewing) return steps.preview();
      const from = fromOf(a, arg);
      return from === null ? undefined : steps.preview(from);
    },
  });
  c.define({
    id: 'steps.oneByOne',
    label: 'Steps One by One',
    menu: menu(61),
    enabled: (a) => !!modelOf(a)?.els.length,
    undoable: true,
    run: (a) => {
      const m = modelOf(a);
      if (m) writePlan(a, m, oneByOne(m.plan, m.els.map((el) => !el.matches(WITH_SLIDE))));
    },
  });
  c.define({
    id: 'steps.allAtOnce',
    label: 'All Steps with the Slide',
    menu: menu(62),
    enabled: (a) => {
      const m = modelOf(a);
      return !!m?.items.some((it, k) => it.fragment && !m.lines[k]);
    },
    undoable: true,
    run: (a) => {
      const m = modelOf(a);
      if (m) writePlan(a, m, { groups: m.lines.flatMap((l, i) => (l ? [[i]] : [])), finals: [] });
    },
  });
  const join = (to: number | 'first' | 'last' | null) => (p: Plan, i: number, first: number) => setStep(p, i, i === first || to === null ? to : stepAt(p, first));
  c.define({
    id: 'steps.set',
    label: 'Set Step',
    undoable: true,
    run: (a, arg) => changeEach(a, arg, join((arg as { to: number | 'first' | 'last' | null }).to)),
  });
  c.define({
    id: 'steps.part',
    label: 'Make Part a Step',
    undoable: true,
    run: async (a, arg) => {
      const { el, part, to } = arg as { el: Element; part: string; to: number | 'first' | 'last' };
      const [span] = await docOf(a).insert(`<span class="fragment" data-part="${part.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></span>`, el, null, 'steps');
      const m = modelAt(a, span);
      if (m) writePlan(a, m, setStep(m.plan, m.i, to));
    },
  });
  const all = (a: App) => {
    const s = itemsOf(a, undefined);
    return s ? s.items.map(({ i }) => stepsIn(s.m, i).length > 0) : [];
  };
  c.define({
    id: 'steps.add',
    label: 'Add as Last Step',
    context: ['element'],
    enabled: (a) => all(a).some((on) => !on),
    undoable: true,
    run: (a, arg) => changeEach(a, arg, join('last')),
  });
  c.define({
    id: 'steps.remove',
    label: 'Show with Slide',
    context: ['element'],
    enabled: (a) => all(a).some((on) => on),
    undoable: true,
    run: (a, arg) => {
      const s = itemsOf(a, arg);
      const at = s ? s.items.flatMap(({ i }) => stepsIn(s.m, i)) : [];
      if (s && at.length) writePlan(a, s.m, at.reduce((p, k) => setStep(p, k, null), s.m.plan));
    },
  });
  c.define({
    id: 'steps.start',
    label: 'Set Start of Step',
    undoable: true,
    run: (a, arg) => {
      const s = itemsOf(a, arg);
      if (!s) return;
      const { start, delay } = arg as { start: StartKind; delay?: number };
      const delays = delaysOf(a, s.m);
      let plan = s.m.plan;
      for (const { i } of s.items) {
        const m = { ...s.m, plan };
        const g = plan.groups.findIndex((g) => g.includes(i));
        if (start !== 'after') {
          delays.delete(i);
          if (start === 'with' && g >= 0) delays.delete(Math.min(...plan.groups[g]));
          plan = setStart(plan, i, start as Start);
          continue;
        }
        if (g <= 0 && Math.min(...(plan.groups[g] ?? [i])) === i) throw new Error('the first step of a slide is shown at a click, and it cannot start after a step before it');
        if (!afterable(m, i)) throw new Error('the step before is set in a text element, and a delay cannot be written on it');
        delays.set(i, delay === undefined ? (startAt(a, m, i, delays).delay ?? AFTER_DEFAULT) : msOf(delay));
        plan = setStart(plan, i, 'click');
      }
      writePlan(a, s.m, plan, new Map(), delays);
    },
  });
  c.define({
    id: 'steps.delay',
    label: 'Set Delay of Step',
    undoable: true,
    run: (a, arg) => {
      const s = itemsOf(a, arg);
      if (!s) return;
      const delays = delaysOf(a, s.m);
      const after = s.items.filter(({ i }) => startAt(a, s.m, i, delays).start === 'after');
      if (!after.length) return;
      const ms = msOf((arg as { delay: number }).delay);
      for (const { i } of after) delays.set(i, ms);
      writePlan(a, s.m, s.m.plan, new Map(), delays);
    },
  });
  c.define({
    id: 'steps.deliver',
    label: 'Set Delivery of List',
    undoable: true,
    run: (a, arg) => {
      const list = listAt(a, arg);
      if (!list) throw new Error('the element is not in a list at the top of the slide');
      deliver(a, list, (arg as { by: Delivery | null }).by);
    },
  });
  c.define({
    id: 'steps.listDelivery',
    label: (a) => {
      const list = listAt(a, undefined);
      const table = list?.localName === 'table';
      return list && deliveryOf(a, list) === 'item' ? `Show ${table ? 'Table' : 'List'} All at Once` : table ? 'Show Table Row by Row' : 'Show List Item by Item';
    },
    context: ['element', 'text'],
    enabled: (a) => !!listAt(a, undefined),
    undoable: true,
    run: (a, arg) => {
      const list = listAt(a, (arg as { target?: unknown } | undefined)?.target instanceof Element ? { el: (arg as { target: Element }).target } : undefined) ?? listAt(a, undefined);
      if (list) deliver(a, list, deliveryOf(a, list) === 'item' ? 'all' : 'item');
    },
  });
  c.define({
    id: 'steps.final',
    label: 'Show Last',
    undoable: true,
    run: (a, arg) => changeEach(a, arg, (p, i) => setFinal(p, i, !!(arg as { on?: boolean }).on)),
  });
  c.define({
    id: 'steps.move',
    label: 'Move Step',
    undoable: true,
    run: (a, arg) => change(a, arg, (p, i) => moveTo(p, i, (arg as { gap: number | null }).gap)),
  });
  c.define({
    id: 'steps.earlier',
    label: 'Move Step Earlier',
    keys: { mac: ['Alt+ArrowUp'], other: ['Alt+ArrowUp'] },
    in: ['inspector'],
    enabled: (a) => stepped(a),
    undoable: true,
    run: (a, arg) => change(a, arg, (p, i) => shift(p, i, -1)),
  });
  c.define({
    id: 'steps.later',
    label: 'Move Step Later',
    keys: { mac: ['Alt+ArrowDown'], other: ['Alt+ArrowDown'] },
    in: ['inspector'],
    enabled: (a) => stepped(a),
    undoable: true,
    run: (a, arg) => change(a, arg, (p, i) => shift(p, i, 1)),
  });
  c.define({
    id: 'steps.effect',
    label: 'Set Effect of Step',
    undoable: true,
    run: (a, arg) => {
      const s = itemsOf(a, arg);
      if (!s) return;
      const effect = (arg as { effect: Effect }).effect;
      const extra = new Map<Element, TagEdit>();
      let plan = s.m.plan;
      let first = -1;
      for (const { el, i } of s.items) {
        if (s.m.locked[i] || (effect === 'play' && !el.matches(PLAYED))) continue;
        const edit = effectEdit(a.doc.tagState(el), effect);
        if (Object.keys(edit).length) extra.set(el, edit);
        if (stepAt(plan, i) >= 0) continue;
        plan = setStep(plan, i, first < 0 ? 'last' : stepAt(plan, first));
        if (first < 0) first = i;
      }
      if (extra.size || plan !== s.m.plan) writePlan(a, s.m, plan, extra);
    },
  });
}
