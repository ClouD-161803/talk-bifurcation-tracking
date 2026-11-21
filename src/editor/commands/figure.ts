import type { App } from '../app.ts';
import type { Command } from '../commands.ts';
import { CONTAINER, pictureSize, twinOf } from '../canvas/hit.ts';
import { placeOf, record, withCorners, writePlace } from '../canvas/drag.ts';
import type { TagEdit } from '../tags.ts';
import { placeCaret } from '../text/typing.ts';
import { startOnClick } from './steps.ts';

export const QR_MAX = 2331;

const shown = (el: Element) => el.getBoundingClientRect().width > 0;

function mediaOf(app: App, tag: string): HTMLElement | null {
  const el = app.selection.only();
  if (!el) return null;
  const open = (m: Element) => !!app.pairing?.elements.get(m)?.open;
  if (el.matches(tag)) return open(el) ? (el as HTMLElement) : null;
  if (!el.matches(CONTAINER)) return null;
  const found = [...el.querySelectorAll(tag)].filter((m) => shown(m) && open(m));
  return found.length === 1 ? (found[0] as HTMLElement) : null;
}

export const imageOf = (app: App) => mediaOf(app, 'img') as HTMLImageElement | null;

export function hiddenOf(app: App): HTMLImageElement | HTMLVideoElement | null {
  const el = app.selection.only();
  if (!el?.matches(CONTAINER)) return null;
  const all = [...el.querySelectorAll('img, video')].filter((m) => !!app.pairing?.elements.get(m)?.open);
  const m = all.length === 1 ? (all[0] as HTMLImageElement | HTMLVideoElement) : null;
  return m && !shown(m) && modeOf(m) !== 'both' && !twinOf(app, m) ? m : null;
}

const hiddenTag = (app: App, tag: string) => {
  const h = hiddenOf(app);
  return h?.localName === tag ? h : null;
};
export const paneImageOf = (app: App) => imageOf(app) ?? (hiddenTag(app, 'img') as HTMLImageElement | null);
export const paneVideoOf = (app: App) => videoOf(app) ?? (hiddenTag(app, 'video') as HTMLVideoElement | null);
export const videoOf = (app: App) => mediaOf(app, 'video') as HTMLVideoElement | null;
export const viewerOf = (app: App) => mediaOf(app, 'tycho-viewer');
const playedOf = (app: App) => videoOf(app) ?? viewerOf(app);
export const qrOf = (app: App) => mediaOf(app, '.qr');

const given = (arg: unknown): Element | null => {
  const el = (arg as { el?: Element } | undefined)?.el;
  return el?.isConnected ? el : null;
};

const valueOf = (arg: unknown): string | null => {
  if (typeof arg === 'string') return arg;
  const v = (arg as { value?: unknown } | undefined)?.value;
  return typeof v === 'string' ? v : null;
};

export type Mode = 'both' | 'dark' | 'light';
export const modeOf = (el: Element): Mode => (el.classList.contains('for-dark') ? 'dark' : el.classList.contains('for-light') ? 'light' : 'both');

export const bytesOf = (text: string) => new TextEncoder().encode(text).length;

let altRequest: (() => void) | null = null;
export function onAltRequest(fn: () => void): void {
  altRequest = fn;
}

let captionBox: { begin(host: Element): void; drop(): void } | null = null;
export function onCaptionBox(box: { begin(host: Element): void; drop(): void }): void {
  captionBox = box;
}

const takenCaption = new WeakMap<Element, string>();

function setTag(app: App, el: Element, edit: TagEdit, label: string): void {
  app.doc.setTag(el, edit, label);
}

function fitToPicture(app: App, el: Element): void {
  const style = app.doc.tagState(el).style;
  if (placeOf(el).width !== null || style['clip-path'] || style.scale || getComputedStyle(el).objectFit !== 'contain') return;
  const p = pictureSize(el);
  const box = el as HTMLElement;
  if (p.w > box.offsetWidth - 0.5 && p.h > box.offsetHeight - 0.5) return;
  record(app, 'oval', withCorners(app, [el], () => {
    const from = placeOf(el);
    writePlace(app, el, { ...from, width: p.w });
    return [{ el, from, to: placeOf(el) }];
  }));
}

function switchOf(id: string, label: string, target: (app: App) => Element | null, isOn: (el: Element) => boolean, edit: (on: boolean) => TagEdit, menu?: Command['menu']): Command {
  return {
    id,
    label,
    menu,
    undoable: true,
    enabled: (app) => !!target(app),
    checked: (app) => {
      const el = target(app);
      return el ? isOn(el) : false;
    },
    run: (app, arg) => {
      const el = given(arg) ?? target(app);
      if (el) setTag(app, el, edit(!isOn(el)), label.toLowerCase());
    },
  };
}

function invertible(app: App, el: Element | null): Element | null {
  if (!el || !el.classList.contains('for-light') || el.classList.contains('invert')) return el;
  return twinOf(app, el);
}

const imageMenu = (order: number): Command['menu'] => ({ bar: 'Format', group: 'image', order, submenu: 'Image' });
const has = (name: string) => (el: Element) => el.hasAttribute(name);
const onClick = (el: Element) => !!el.closest('.fragment.play');
const flag = (name: string) => (on: boolean): TagEdit => ({ attrs: { [name]: on ? '' : null } });
const visual = (app: App) => imageOf(app) ?? videoOf(app) ?? hiddenOf(app);

const modeClasses = (m: Mode) => ({ 'for-dark': m === 'dark', 'for-light': m === 'light' });
const otherMode = (m: Mode): Mode => (m === 'dark' ? 'light' : 'dark');

const takenTwin = new WeakMap<Element, { text: string; mode: Mode; after: boolean }>();

async function setMode(app: App, el: Element, mode: Mode): Promise<void> {
  const twin = twinOf(app, el);
  if (twin && mode === 'both') {
    takenTwin.set(el, { text: app.doc.elementText(twin), mode: modeOf(el), after: !!(el.compareDocumentPosition(twin) & Node.DOCUMENT_POSITION_FOLLOWING) });
    await app.doc.remove(twin, 'mode');
  }
  setTag(app, el, { classes: modeClasses(mode) }, 'mode');
  if (twin && mode !== 'both') {
    setTag(app, twin, { classes: modeClasses(otherMode(mode)) }, 'mode');
    if (app.selection.only() === el && !shown(el)) app.selection.set('elements', [twin]);
  }
  const back = takenTwin.get(el);
  if (twin || mode === 'both' || !back || !el.parentElement) return;
  const [node] = await app.doc.insert(back.text, el.parentElement, back.after ? el.nextElementSibling : el, 'mode');
  if (mode !== back.mode) setTag(app, node, { classes: modeClasses(otherMode(mode)) }, 'mode');
}

function captionHost(app: App): Element | null {
  const typed = app.selection.kind === 'text' ? app.selection.items[0]?.closest('figcaption, .caption') : null;
  const host = typed ? typed.parentElement : visual(app)?.parentElement;
  return host?.matches('figure, .figure-box') && !host.matches('.plate, .plot') ? host : null;
}
const captionOf = (host: Element) => host.querySelector(':scope > figcaption, :scope > .caption');

export function commands(): Command[] {
  const list: Command[] = [
    {
      id: 'figure.caption',
      label: 'Caption',
      menu: imageMenu(12),
      enabled: (app) => !!captionHost(app),
      checked: (app) => {
        const host = captionHost(app);
        return host ? !!captionOf(host) : false;
      },
      run: async (app) => {
        const host = captionHost(app);
        if (!host) return;
        const old = captionOf(host);
        if (old?.hasAttribute('data-generated')) return captionBox?.drop();
        const back = takenCaption.get(host);
        if (!old && !back) return captionBox?.begin(host);
        await app.history.transact('Caption', async () => {
          if (old) {
            takenCaption.set(host, app.doc.elementText(old));
            return app.doc.remove(old, 'caption');
          }
          const [node] = await app.doc.insert(back!, host, null, 'caption');
          if (node) setTimeout(() => node.matches('[contenteditable="true"]') && placeCaret(node));
        });
      },
    },
    {
      id: 'figure.alt',
      label: 'Edit Alt Text…',
      menu: imageMenu(10),
      context: ['element'],
      undoable: true,
      enabled: (app) => !!imageOf(app),
      run: (app, arg) => {
        const el = given(arg) ?? imageOf(app);
        const text = valueOf(arg);
        if (!el) return;
        if (text === null) return void altRequest?.();
        const alt = text === '' ? null : text;
        if (el.getAttribute('alt') !== alt) setTag(app, el, { attrs: { alt } }, 'alt text');
      },
    },
    {
      ...switchOf('figure.decorative', 'Decorative', imageOf, (el) => el.getAttribute('alt') === '', () => ({}), imageMenu(11)),
      run: (app, arg) => {
        const el = given(arg) ?? imageOf(app);
        if (!el) return;
        const edit = { attrs: { alt: el.getAttribute('alt') === '' ? null : '' } };
        for (const m of [el, twinOf(app, el)]) if (m) setTag(app, m, edit, 'decorative');
      },
    },
    switchOf('figure.whiteFigure', 'White Figure', imageOf, (el) => el.classList.contains('white-figure'), (on) => ({ classes: { 'white-figure': on } }), imageMenu(20)),
    {
      ...switchOf('figure.oval', 'Oval', imageOf, (el) => el.classList.contains('oval'), () => ({}), imageMenu(22)),
      run: (app, arg) => {
        const el = given(arg) ?? imageOf(app);
        if (!el) return;
        const on = !el.classList.contains('oval');
        if (on) fitToPicture(app, el);
        for (const m of [el, twinOf(app, el)]) {
          if (!m) continue;
          const edit: TagEdit = { classes: { oval: on } };
          const inset = /^inset\((-?[\d.]+%)( round 50%)?\)$/.exec(app.doc.tagState(m).style['clip-path'] ?? '');
          if (inset) edit.style = { 'clip-path': `inset(${inset[1]}${on ? ' round 50%' : ''})` };
          setTag(app, m, edit, 'oval');
        }
      },
    },
    switchOf('figure.invert', 'Invert in Dark Mode', (app) => invertible(app, imageOf(app)), (el) => el.classList.contains('invert'), (on) => ({ classes: { invert: on } }), imageMenu(21)),
    {
      ...switchOf('figure.autoplay', 'Play Automatically', videoOf, (el) => has('data-autoplay')(el) && !onClick(el), flag('data-autoplay')),
      enabled: (app) => {
        const el = videoOf(app);
        return !!el && !onClick(el);
      },
      why: (app) => {
        const el = videoOf(app);
        return el && onClick(el) ? 'The video is started on a click, at its step' : null;
      },
    },
    {
      id: 'figure.startOnClick',
      label: 'Start on a Click',
      undoable: true,
      enabled: (app) => !!playedOf(app),
      checked: (app) => {
        const el = playedOf(app);
        return el ? onClick(el) : false;
      },
      run: (app, arg) => {
        const el = given(arg) ?? playedOf(app);
        if (el) startOnClick(app, el, !onClick(el));
      },
    },
    switchOf('figure.loop', 'Loop', videoOf, has('loop'), flag('loop')),
    switchOf('figure.muted', 'Muted', videoOf, has('muted'), flag('muted')),
    {
      id: 'figure.qr',
      label: 'QR Code Text',
      undoable: true,
      enabled: (app) => !!qrOf(app),
      run: (app, arg) => {
        const el = given(arg) ?? qrOf(app);
        const text = valueOf(arg);
        if (!el || text === null) return;
        if (!text.trim()) throw new Error('the text of a QR code cannot be empty');
        if (bytesOf(text) > QR_MAX) throw new Error(`the text of a QR code is longer than ${QR_MAX} bytes`);
        if (el.getAttribute('data-qr') !== text) setTag(app, el, { attrs: { 'data-qr': text } }, 'qr code');
      },
    },
  ];
  for (const [i, mode] of (['both', 'dark', 'light'] as const).entries()) {
    list.push({
      id: `figure.mode.${mode}`,
      label: mode === 'both' ? 'Both Modes' : mode === 'dark' ? 'Dark Mode Only' : 'Light Mode Only',
      menu: { bar: 'Format', group: 'mode', order: 30 + i, submenu: 'Image' },
      undoable: true,
      undo: 'Figure Mode',
      enabled: (app) => !!visual(app),
      checked: (app) => {
        const el = visual(app);
        return el ? modeOf(el) === mode : false;
      },
      run: (app, arg) => {
        const el = given(arg) ?? visual(app);
        if (el && modeOf(el) !== mode) return app.history.selecting('mode', () => setMode(app, el, mode));
      },
    });
  }
  return list;
}

type Page = { Beeson?: { mount?(root: Element): void } };

function redrawQr(el: Element): void {
  for (const old of el.querySelectorAll(':scope > svg, :scope > .qr-error, :scope > .qr-logo')) old.remove();
  if (el.parentElement) (window as unknown as Page).Beeson?.mount?.(el.parentElement);
}

export function install(app: App): void {
  for (const c of commands()) app.commands.define(c);
  new MutationObserver((records) => {
    for (const r of records) if (r.target instanceof Element && r.target.matches('.qr')) redrawQr(r.target);
  }).observe(app.slides(), { subtree: true, attributes: true, attributeFilter: ['data-qr'] });
}
