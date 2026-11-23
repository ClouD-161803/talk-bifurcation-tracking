import type { App } from './app.ts';
import { injectStyle, make } from './ui/dom.ts';

const CSS = `
.beeson-edit-show { position: fixed; inset: 0; z-index: 2147483647; background: #000; }
.beeson-edit-show iframe { display: block; width: 100%; height: 100%; border: 0; }
`;

type At = { h: number; v: number };
type Prefixed = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type Requestable = HTMLElement & { webkitRequestFullscreen?: () => void };

const hidden = (s: Element | null) => s?.getAttribute('data-visibility') === 'hidden';
const sections = (parent: Element) => [...parent.children].filter((s) => s.localName === 'section' && !hidden(s));

export function showIndices(app: App, slide: Element | null): At {
  const leaves = [...app.slides().querySelectorAll<Element>('section')].filter((s) => !s.querySelector('section'));
  const shown = leaves.filter((s) => !hidden(s) && !hidden(s.parentElement));
  const at = slide ? leaves.indexOf(slide) : 0;
  const to = shown.find((s) => leaves.indexOf(s) >= at) ?? shown.at(-1);
  if (!to) return { h: 0, v: 0 };
  const top = to.parentElement?.localName === 'section' ? to.parentElement : to;
  return { h: Math.max(0, sections(app.slides()).indexOf(top)), v: top === to ? 0 : Math.max(0, sections(top).indexOf(to)) };
}

export function slideAt(app: App, { h, v }: At): Element | null {
  const top = sections(app.slides())[h];
  if (!top) return null;
  const inner = sections(top);
  return inner.length ? (inner[v] ?? inner[0]) : top;
}

const fullscreen = () => (document as Prefixed).fullscreenElement ?? (document as Prefixed).webkitFullscreenElement ?? null;

export type Stage = { load(url: string, text?: string | null): Window | null; end(): void };

export function writeDeck(win: Window, url: string, text: string): void {
  const doc = win.document;
  doc.open();
  win.history.replaceState(null, '', url);
  const base = `<base href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
  doc.write(/<base[\s>]/i.test(text) ? text : text.replace(/<head(\s[^>]*)?>/i, (head) => head + base));
  doc.close();
}

export function startShow(app: App, ended?: () => void): Stage {
  injectStyle('show', CSS);
  const el = make('div', 'beeson-edit-show') as Requestable;
  const frame = make('iframe');
  frame.title = 'Slide show';
  frame.setAttribute('allow', 'autoplay; fullscreen');
  el.append(frame);
  document.body.append(el);
  let at: At | null = null;
  let loads = 0;
  let full = false;
  let keep = 0;
  let speaker = false;

  const ours = () => !!fullscreen() && el.contains(fullscreen());
  const enter = () => {
    try {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else el.webkitRequestFullscreen?.();
    } catch {}
  };
  const leave = () => {
    const d = document as Prefixed;
    if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  };
  const end = () => {
    if (!el.isConnected) return;
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKey, true);
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.removeEventListener(type, onChange);
    if (ours()) leave();
    el.remove();
    const slide = at && slideAt(app, at);
    if (slide) app.showSlide(slide);
    window.focus();
    ended?.();
  };
  const onMessage = (ev: MessageEvent) => {
    if (ev.source !== frame.contentWindow || typeof ev.data !== 'string') return;
    let m: { namespace?: string; eventName?: string; state?: { indexh?: number; indexv?: number } };
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m?.namespace !== 'reveal' && m?.namespace !== 'beeson') return;
    if (typeof m.state?.indexh === 'number') at = { h: m.state.indexh, v: m.state.indexv ?? 0 };
    if (m.namespace !== 'beeson') return;
    if (m.eventName === 'edit') end();
    else if (m.eventName === 'speaker') speaker = true;
    else if (m.eventName === 'fullscreen' && !ours()) enter();
    else if (m.eventName === 'fullscreen') {
      keep = performance.now() + 1000;
      leave();
    }
  };
  const onChange = () => {
    if (ours()) full = true;
    else if (full) setTimeout(() => {
      if (ours()) return;
      if (speaker) speaker = false;
      else if (performance.now() > keep && document.hasFocus()) end();
    }, 100);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') end();
    ev.preventDefault();
    ev.stopPropagation();
  };
  let loading = false;
  frame.addEventListener('load', () => {
    if (!loading) return;
    if (++loads > 1) return end();
    frame.contentWindow?.focus();
  });
  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey, true);
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, onChange);
  enter();

  return {
    load(url: string, text?: string | null) {
      if (!el.isConnected) return null;
      const u = new URL(url, location.href);
      u.searchParams.set('from-editor', '');
      const href = u.href.replace(/=(?=&|$|#)/g, '');
      loading = true;
      if (text == null) frame.src = href;
      else writeDeck(frame.contentWindow!, href, text);
      frame.focus();
      return frame.contentWindow;
    },
    end,
  };
}
