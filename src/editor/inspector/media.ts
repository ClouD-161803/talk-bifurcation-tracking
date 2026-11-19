import type { App } from '../app.ts';
import { capacity } from '../../qr.ts';
import { QR_MAX, bytesOf, paneImageOf, paneVideoOf, qrOf } from '../commands/figure.ts';
import { posterTime, setPosterTime, unreadable } from '../media/actions.ts';
import { media } from '../media/store.ts';
import { make, injectStyle } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { button, checkbox, note, numberField, row, section, segmented, textField, type Control, type Run } from './controls.ts';
import { pageOfFigure } from '../media/pdf.ts';

const CSS = `
.beeson-edit-inspector .ed-well { display: grid; grid-template-columns: 56px 1fr; gap: 4px 10px; align-items: center; }
.beeson-edit-inspector .ed-well .thumb { grid-row: span 2; width: 56px; height: 40px; border-radius: 5px; background: var(--ed-pressed) center / contain no-repeat; box-shadow: inset 0 0 0 1px var(--ed-line); }
.beeson-edit-inspector .ed-well .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px/1.3 var(--ed-font); color: var(--ed-text); }
.beeson-edit-inspector .ed-well .ed-btn { flex: 0 0 auto; justify-self: start; }
.beeson-edit-inspector .ed-frame { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: center; font: 12px/1.3 var(--ed-font); color: var(--ed-text); }
.beeson-edit-inspector .ed-frame .ed-play { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: var(--ed-pressed); color: var(--ed-text); display: flex; align-items: center; justify-content: center; }
.beeson-edit-inspector .ed-frame input { width: 100%; min-width: 0; margin: 0; accent-color: var(--ed-select); }
.beeson-edit-inspector .ed-frame output { min-width: 4.5em; text-align: right; color: var(--ed-muted); font-variant-numeric: tabular-nums; }
.beeson-edit-inspector .ed-frame.off { opacity: 0.45; }
`;

const pathOf = (value: string | null) => media.pathOf(value);
const fileName = (src: string | null) => {
  const path = pathOf(src);
  return path ? decodeURIComponent(path.split(/[?#]/)[0].split('/').pop() ?? path) : '';
};
const unsaved = (value: string | null) => {
  const f = media.get(pathOf(value));
  return !!f && !f.saved;
};

type Label = () => { text: string; title: string };
function well(app: App, run: Run, url: () => string | null, name: () => string, command: string, arg: unknown, text: string, labelOf?: Label): Control {
  const el = make('div', 'ed-well');
  const thumb = make('div', 'thumb');
  const label = make('div', 'name');
  const b = button(app, run, { command, arg, text });
  el.append(thumb, label, b.el);
  const sync = () => {
    const raw = url();
    const u = media.get(raw)?.url ?? raw;
    thumb.style.backgroundImage = u ? `url("${u.replace(/"/g, '%22')}")` : '';
    label.textContent = name() || 'None';
    label.title = label.textContent;
    b.sync();
    if (labelOf) {
      const { text: t, title } = labelOf();
      const span = b.el.querySelector('span');
      if (span) span.textContent = t;
      b.el.title = title;
    }
  };
  sync();
  return { el, sync };
}

const replaceLabel = (app: App): Label => () => {
  const title = app.commands.state('media.replace').label;
  return { text: title.startsWith('Choose') ? title.replace(/ (Image|Video) for /, ' for ') : 'Replace…', title: title.startsWith('Choose') ? title : '' };
};

const keptNote = (value: () => string | null) =>
  note(() => (unsaved(value()) ? `${fileName(value())} is kept in this browser until a save writes it into media/ next to the deck.` : ''));

const modes = (app: App, run: Run, what: string): Control =>
  section(`Shown in`, [
    row([segmented(app, run, [
      { command: 'figure.mode.both', icon: 'mode-both', text: 'Both' },
      { command: 'figure.mode.dark', icon: 'mode-dark', text: 'Dark' },
      { command: 'figure.mode.light', icon: 'mode-light', text: 'Light' },
    ], 'Shown in')]),
    note(() => `A pair of ${what}s, one for each mode of the deck, is marked Dark and Light. On a pair, Dark or Light swaps the two, and Both keeps this ${what} alone.`),
  ]);

const pdfSection = (app: App, run: Run, img: HTMLImageElement): Control =>
  section('PDF', [
    row([numberField(app, { label: 'Page', unit: '', min: 1, step: 1, refuse: true, value: () => pageOfFigure(img), enabled: () => img.isConnected, commit: (page) => run('media.pdfPage', { el: img, page }) })]),
    checkbox(app, run, 'media.matchMode', 'Match the Mode, with an image for each mode'),
    note(() => `Page ${pageOfFigure(img)} of ${fileName(img.getAttribute('data-pdf'))}. With Match the Mode, the black of the PDF is drawn in the color of the text, and its white in the color of the slide.`),
  ]);

export function imagePane(app: App, run: Run): Control[] {
  injectStyle('inspector-media', CSS);
  const img = paneImageOf(app);
  const alt = textField(app, {
    label: 'Description',
    name: 'alt',
    multiline: true,
    placeholder: 'Describe the image for a screen reader',
    value: () => img?.getAttribute('alt') ?? '',
    enabled: () => !!img?.isConnected && img.getAttribute('alt') !== '',
    commit: (value) => run('figure.alt', { value, el: img }),
    hint: (text) => (img?.getAttribute('alt') === '' ? { text: 'A decorative image is skipped by a screen reader.', warn: false } : text.trim() ? null : { text: 'The image does not have a description.', warn: true }),
  });
  return [
    section('File', [
      well(app, run, () => img?.currentSrc || img?.src || '', () => fileName(img?.getAttribute('src') ?? null), 'media.replace', { el: img }, 'Replace…', replaceLabel(app)),
      keptNote(() => img?.getAttribute('src') ?? null),
    ]),
    section(null, [alt, checkbox(app, run, 'figure.decorative', 'Decorative')]),
    ...(img?.hasAttribute('data-pdf') ? [pdfSection(app, run, img)] : []),
    section('Appearance', [
      checkbox(app, run, 'figure.caption', 'Caption'),
      checkbox(app, run, 'figure.whiteFigure', 'White Figure, framed in white'),
      checkbox(app, run, 'figure.invert', 'Invert in dark mode, for a black-on-white plot'),
      checkbox(app, run, 'figure.oval', 'Oval, clipped to the ellipse of its box'),
    ]),
    section('Mask', [
      row([
        button(app, run, { command: 'image.editMask', text: 'Edit Mask' }),
        button(app, run, { command: 'image.resetMask', icon: 'reset', text: 'Reset Mask' }),
      ]),
      note(() => 'Drag the image inside its box and scale it, or double-click the image.'),
    ]),
    modes(app, run, 'image'),
  ];
}

export const clock = (s: number): string => {
  const t = Math.max(0, Math.round(s * 10) / 10);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};

let previewed: HTMLVideoElement | null = null;
const stopPreview = () => {
  previewed?.pause();
  previewed = null;
};
const stopping = new WeakSet<App>();
const LOADED = ['loadedmetadata', 'durationchange'] as const;

function frameSlider(app: App, run: Run, video: HTMLVideoElement | null): Control {
  const el = make('label', 'ed-frame');
  const input = make('input');
  input.type = 'range';
  input.min = '0';
  input.step = 'any';
  input.name = 'poster-frame';
  input.setAttribute('aria-label', 'Poster Frame');
  const time = make('output');
  const play = make('button', 'ed-play');
  el.append(make('span', '', 'Frame'), play, input, time);
  let was: boolean | null = null;
  const shown = () => {
    const on = !!video && previewed === video && !video.paused;
    if (on === was) return;
    was = on;
    play.replaceChildren(icon(on ? 'pause' : 'play', 14));
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    play.title = on ? 'Pause the video' : 'Play the video from the frame of the slider';
  };
  if (!stopping.has(app)) {
    stopping.add(app);
    app.selection.listen(stopPreview);
    app.listen('slide', stopPreview);
  }
  play.addEventListener('click', () => {
    if (!video) return;
    if (previewed === video && !video.paused) return stopPreview();
    stopPreview();
    previewed = video;
    video.currentTime = Number(input.value);
    void video.play().catch(() => {});
  });
  const follow = () => {
    if (!input.isConnected) return void video?.removeEventListener('timeupdate', follow);
    if (video && previewed === video) {
      input.value = String(video.currentTime);
      setPosterTime(video, video.currentTime);
      time.textContent = clock(video.currentTime);
    }
    shown();
  };
  for (const type of ['timeupdate', 'play', 'pause'] as const) video?.addEventListener(type, follow);
  const length = () => (video && Number.isFinite(video.duration) ? video.duration : 0);
  const sync = () => {
    const d = length();
    const enabled = !!video?.isConnected && d > 0 && !!app.commands.get('media.poster') && app.commands.state('media.poster').enabled;
    input.disabled = !enabled;
    play.disabled = !enabled;
    el.classList.toggle('off', !enabled);
    shown();
    input.max = String(d || 1);
    if (document.activeElement !== input && video) input.value = String(Math.min(posterTime(video), d));
    time.textContent = clock(Number(input.value));
  };
  input.addEventListener('input', () => {
    if (!video) return;
    const t = Number(input.value);
    setPosterTime(video, t);
    video.pause();
    video.currentTime = t;
    time.textContent = clock(t);
  });
  input.addEventListener('change', () => {
    if (video) void run('media.poster', { el: video });
  });
  const loaded = () => {
    if (input.isConnected) return sync();
    for (const type of LOADED) video?.removeEventListener(type, loaded);
  };
  for (const type of LOADED) video?.addEventListener(type, loaded);
  sync();
  return { el, sync };
}

export function videoPane(app: App, run: Run): Control[] {
  injectStyle('inspector-media', CSS);
  const video = paneVideoOf(app);
  const poster = () => video?.getAttribute('poster') ?? null;
  return [
    section('File', [
      well(app, run, poster, () => fileName(video?.getAttribute('src') ?? null), 'media.replace', { el: video }, 'Replace…', replaceLabel(app)),
      keptNote(() => video?.getAttribute('src') ?? null),
    ]),
    section('Poster', [
      well(app, run, poster, () => fileName(poster()), 'media.poster', { el: video }, 'Capture Poster', () => (video && unreadable(video)
        ? { text: 'Capture Poster…', title: 'Capture the frame of the slider as the poster. In a deck opened from a file, you are asked once for the file of the video, since its frames cannot be read from the page' }
        : { text: 'Capture Poster', title: 'Capture the frame of the slider as the poster' })),
      frameSlider(app, run, video),
      note(() => (poster() ? 'The frame shown before the video plays and printed in the PDF. Drag the slider to choose another one.' : 'The video does not have a poster for the PDF.'), () => !poster()),
      note(() => (video && unreadable(video) ? `In a deck opened from a file, the browser keeps the frames of ${fileName(video.getAttribute('src'))} from the page, hence Capture Poster asks once for the file.` : '')),
      keptNote(poster),
    ]),
    section('Playback', [
      checkbox(app, run, 'figure.autoplay', 'Play while the slide is shown'),
      checkbox(app, run, 'figure.startOnClick', 'Start on a click'),
      checkbox(app, run, 'figure.loop', 'Loop'),
      checkbox(app, run, 'figure.muted', 'Muted'),
    ]),
    modes(app, run, 'video'),
  ];
}

const LOGO_MAX = capacity(40, 'H');

const withLogo = (qr: Element) => {
  const image = getComputedStyle(qr).getPropertyValue('--qr-logo').trim();
  return image !== '' && image !== 'none';
};

export function qrPane(app: App, run: Run): Control[] {
  const qr = qrOf(app);
  return [
    section(null, [textField(app, {
      label: 'Text',
      name: 'qr',
      multiline: true,
      placeholder: 'https://example.com',
      value: () => qr?.getAttribute('data-qr') ?? '',
      enabled: () => !!qr?.isConnected,
      commit: (value) => run('figure.qr', { value, el: qr }),
      hint: (text) => {
        const n = bytesOf(text);
        const plain = n > LOGO_MAX && n <= QR_MAX && !!qr && withLogo(qr) ? ', drawn without the logo' : '';
        return { text: !text.trim() ? 'The text cannot be empty.' : `${n} of ${QR_MAX} bytes${plain}`, warn: !text.trim() || n > QR_MAX };
      },
    })]),
    section(null, [note(() => 'A shorter text is drawn with fewer and larger modules, which are read from farther back in the room.')]),
  ];
}
