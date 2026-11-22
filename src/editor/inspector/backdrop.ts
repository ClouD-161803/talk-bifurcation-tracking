import type { App } from '../app.ts';
import { ALPHAS, BRANCHES, COLORMAPS, FAMILIES, FRAMES, LABELS, NAMES, PLANES, PLANE_NAMES, SYSTEMS, SYSTEM_NAMES, brouckePick, colormapName, dottedDrawing, drawnBy, entryName, isBroucke, labeledDrawing, library, liveOf, planePick, probeLibrary, selectedBackdrop, startStep, startSteps, systemPick, toriPick, WITH_THE_SLIDE, type Pick } from '../commands/backdrop.ts';
import { openMenu, type MenuItem } from '../ui/menu.ts';
import { make } from '../ui/dom.ts';
import { button, checkbox, glyph, keepFocus, note, numberField, row, section, type Control, type Run } from './controls.ts';

function popup(app: App, label: string, current: () => string, list: () => MenuItem[], enabled: () => boolean, ready?: () => Promise<void>): Control {
  const b = make('button', 'ed-popup');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-label', label);
  b.title = label;
  const text = make('span');
  b.append(text, glyph('chevron-down', 16));
  const open = (keyboard: boolean) => openMenu(app, list(), { anchor: b.getBoundingClientRect(), placement: 'below', owner: b, keyboard, label, className: 'select', onClose: () => sync() });
  let asked = 0;
  const show = (keyboard: boolean) => {
    if (!ready) return void open(keyboard);
    const ask = ++asked;
    void ready().catch(() => {}).then(() => {
      if (ask === asked && b.isConnected) open(keyboard);
    });
  };
  keepFocus(b);
  b.addEventListener('pointerdown', () => show(false));
  b.addEventListener('click', (ev) => {
    if (ev.detail === 0) show(true);
  });
  const sync = () => {
    text.textContent = current();
    b.disabled = !enabled();
  };
  sync();
  return { el: b, sync };
}

function when(shown: () => boolean, parts: Control[]): Control {
  const box = make('div');
  box.append(...parts.map((p) => p.el));
  const sync = () => {
    box.hidden = !shown();
    for (const p of parts) p.sync();
  };
  sync();
  return { el: box, sync, flush: () => parts.forEach((p) => p.flush?.()) };
}

export function backdropPane(app: App, run: Run): Control[] {
  const el = selectedBackdrop(app);
  const live = () => liveOf(el);
  const view = () => live()?.view ?? null;
  const on = () => !!el?.isConnected && !!live() && !el.hasAttribute('data-locked');
  const file = () => !!el?.hasAttribute('data-trajectories');
  const field = (label: string, key: 'cx' | 'cy' | 'half', id: string) => numberField(app, {
    label, unit: '', step: 0.01, min: key === 'half' ? 0.01 : -100, max: 100,
    value: () => view()?.[key] ?? null,
    enabled: on,
    command: `backdrop.${id}`,
    commit: (value) => run(`backdrop.${id}`, { value, el }),
  });
  const drawing = popup(app, 'Drawing', () => (el ? entryName(el) : ''), () => library(app).map((e) => ({
    label: e.name,
    checked: !!el && drawnBy(e, el),
    disabled: !!e.missing,
    run: () => run('backdrop.builtIn', { value: e.key, el }),
  })), on, () => probeLibrary(app));
  const brouckePopup = (label: string, key: keyof Pick, values: string[]) => popup(app, label, () => brouckePick(el)?.[key] ?? NAMES.custom, () => values.map((v) => ({
    label: v,
    checked: brouckePick(el)?.[key] === v,
    run: () => run(`backdrop.${key}`, { value: v, el }),
  })), () => on() && (key === 'family' || !!brouckePick(el)));
  const choicePopup = (label: string, command: string, values: string[], names: Record<string, string>, now: () => string) => popup(app, label, () => names[now()], () => values.map((v) => ({
    label: names[v],
    checked: now() === v,
    run: () => run(command, { value: v, el }),
  })), on);
  const torusBox = (n: number) => checkbox(app, run, 'backdrop.torus', `α = ${ALPHAS[n]}`, () => toriPick(el)[n], { value: ALPHAS[n], el });
  const parts: Control[] = [
    section('Drawing', [
      drawing,
      row([button(app, run, { command: 'backdrop.choose', text: 'Choose…' })]),
      when(() => dottedDrawing(el) === 'poincare', [choicePopup('System', 'backdrop.system', SYSTEMS, SYSTEM_NAMES, () => systemPick(el))]),
      when(() => dottedDrawing(el) === 'tori', [
        choicePopup('Plane', 'backdrop.plane', PLANES, PLANE_NAMES, () => planePick(el)),
        row([checkbox(app, run, 'backdrop.tori', 'All Tori', () => toriPick(el).every(Boolean), { el })]),
        ...Array.from({ length: ALPHAS.length / 2 }, (_, i) => row([torusBox(2 * i), torusBox(2 * i + 1)])),
      ]),
      when(file, [
        when(() => isBroucke(el), [
          brouckePopup('Family', 'family', FAMILIES),
          brouckePopup('Frame', 'frame', FRAMES),
          when(() => brouckePick(el)?.family === '7', [brouckePopup('Branch', 'branch', BRANCHES)]),
        ]),
        popup(app, 'Colormap', () => colormapName(el?.getAttribute('data-trajectories-colormap') ?? null), () => [null, ...COLORMAPS].map((c) => ({
          label: colormapName(c),
          checked: (el?.getAttribute('data-trajectories-colormap') ?? null) === c,
          run: () => run('backdrop.colormap', { value: c, el }),
        })), on),
        note(() => 'The trajectories are chosen and colored in the data-trajectories attributes of the file, as described in REFERENCE.md.'),
      ]),
    ]),
    section('Window', [
      row([field('Center X', 'cx', 'cx'), field('Center Y', 'cy', 'cy')]),
      row([field('Half Height', 'half', 'half'), { el: make('div', 'ed-num'), sync: () => {} }]),
      row([button(app, run, { command: 'backdrop.zoomIn', arg: { el }, text: 'Zoom In' }), button(app, run, { command: 'backdrop.zoomOut', arg: { el }, text: 'Zoom Out' })]),
      row([button(app, run, { command: 'backdrop.edit', arg: { el }, text: 'Edit Window…' }), button(app, run, { command: 'backdrop.fitWindow', arg: { el }, text: 'Fit Window' })]),
      note(() => 'Drag the drawing or use the arrow keys to pan it, and drag a handle to resize its box.'),
    ]),
  ];
  parts.push(when(() => !dottedDrawing(el), [section('Labels', [
    when(() => labeledDrawing(el), [
      row(LABELS.slice(0, 2).map((l) => labelBox(app, run, el, l.at, l.name))),
      row(LABELS.slice(2).map((l) => labelBox(app, run, el, l.at, l.name))),
    ]),
    row([button(app, run, { command: 'backdrop.addLabel', arg: { el }, text: 'Add Label' })]),
    note(() => 'Add Label puts a label at the center of the window. Choose Add Label Here in the menu of the drawing to put one at a point, and drag a label to shift it.'),
  ])]));
  const traced = !!el?.closest('section')?.matches('.title, .section, .closing');
  parts.push(
    section('Motion', [
      checkbox(app, run, 'backdrop.live', 'Live'),
      row([numberField(app, {
        label: 'Duration', unit: 's', step: 1, min: 0, max: 600,
        value: () => (el?.hasAttribute('data-duration') ? Number(el.getAttribute('data-duration')) : null),
        enabled: on,
        command: 'backdrop.duration',
        commit: (value) => run('backdrop.duration', { value, el }),
      }), button(app, run, { command: 'backdrop.preview', arg: { el }, text: 'Preview' })]),
      popup(app, 'Start', () => startStep(app, el)?.label ?? WITH_THE_SLIDE, () => {
        const now = startStep(app, el)?.step ?? null;
        return [
          { label: WITH_THE_SLIDE, checked: now === null, run: () => run('backdrop.start', { value: null, el }) },
          { rule: true },
          ...startSteps(app, el).map((o) => ({ label: o.label, checked: o.step === now, run: () => run('backdrop.start', { value: o.step, el }) })),
        ];
      }, () => on() && startSteps(app, el).length > 0),
      note(() => (startStep(app, el) ? 'The backdrop is kept at the start of its trace until its step, and traced from this step on.' : traced ? 'A backdrop of a title, section, or closing slide is traced in the show without Live.' : 'With Live, the backdrop is traced when its slide is shown.')),
    ]),
    section(null, [row([button(app, run, { command: 'arrange.lock', icon: 'lock', text: 'Lock' }), button(app, run, { command: 'arrange.unlock', icon: 'unlock', text: 'Unlock' })])]),
  );
  return parts;
}

function labelBox(app: App, run: Run, el: HTMLElement | null, at: string, name: string): Control {
  return checkbox(app, run, 'backdrop.label', name, () => !!el && [...el.querySelectorAll(':scope > .label')].some((l) => l.getAttribute('data-at') === at), { at, el });
}
