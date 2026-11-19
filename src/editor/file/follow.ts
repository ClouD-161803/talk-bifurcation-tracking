import type { App, Follow } from '../app.ts';
import type { Navigator } from '../navigator/navigator.ts';
import { changes, merge, type Edit } from '../merge.ts';
import { parseSource } from '../source.ts';
import { renderDeck } from '../render.ts';
import { mathLookup } from '../math.ts';
import { Dialog } from '../ui/dialog.ts';
import { keepSlide, plural, write } from './files.ts';
import { loadRecents, pageOf, recentsOfPage, remember } from './recent.ts';

const WATCH_DELAY = 1000;
const SETTLE_DELAY = 150;
const SETTLE_TRIES = 20;
const RELOAD_KEY = `beeson-reload:${pageOf()}`;

const clock = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function onSlides(numbers: number[]): string {
  if (!numbers.length) return '';
  if (numbers.length === 1) return ` on slide ${numbers[0]}`;
  const head = numbers.slice(0, -1).join(', ');
  return ` on slides ${head}${numbers.length > 2 ? ',' : ''} and ${numbers[numbers.length - 1]}`;
}

let last: { text: string; sections: { start: number; end: number }[] } | null = null;

export function slidesAt(text: string, ranges: Edit[]): number[] {
  if (last?.text !== text) {
    const sections = parseSource(text).slides.children.flatMap((c) => (c.kind === 'element' && c.tag === 'section' && c.open ? [{ start: c.open.start, end: c.close?.end ?? c.open.end }] : []));
    last = { text, sections };
  }
  const { sections } = last;
  const out = new Set<number>();
  for (const r of ranges) {
    sections.forEach((s, i) => {
      if (r.start < s.end && s.start < Math.max(r.end, r.start + 1)) out.add(i + 1);
    });
  }
  return [...out].sort((a, b) => a - b);
}

export function changedSlides(before: string, after: string): number[] {
  try {
    const hunks = changes(before, after);
    if (!hunks) return [];
    let delta = 0;
    const moved = hunks.map((h) => {
      const start = h.start + delta;
      delta += h.text.length - (h.end - h.start);
      return { start, end: start + h.text.length, text: '' };
    });
    return slidesAt(after, moved);
  } catch {
    return [];
  }
}

type Permitted = FileSystemFileHandle & { queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState> };

export function install(app: App): void {
  let diskText: string | null = null;
  let stamp = 0;
  let known: FileSystemFileHandle | null = null;
  let saves = 0;
  let saving = false;
  let busy = false;
  let stale: number[] | null = null;
  const nav = (): Navigator => app.nav as Navigator;

  const conflict = new Dialog({
    title: 'The texts that you edited were changed in the file',
    text: '',
    buttons: [
      { label: 'Keep mine', title: 'Write your version of these texts into the file', value: 'ours', primary: true },
      { label: "Keep the file's", title: 'Drop your edits of these texts, and keep the version in the file', value: 'theirs' },
      { label: 'Cancel', title: 'Go on editing without a save', value: 'cancel' },
    ],
    className: 'conflict',
  });

  async function readText(handle: FileSystemFileHandle | null): Promise<string | null> {
    if (handle) return (await handle.getFile()).text();
    if (location.protocol === 'file:') return null;
    const response = await fetch(pageOf(), { cache: 'no-store' });
    return response.ok ? response.text() : null;
  }

  async function readSettled(handle: FileSystemFileHandle | null, first: string): Promise<string | null> {
    let text: string | null = first;
    for (let i = 0; i < SETTLE_TRIES; i += 1) {
      await new Promise((done) => setTimeout(done, SETTLE_DELAY));
      const next = await readText(handle);
      if (next === text) return text;
      text = next;
    }
    return text;
  }

  async function isKnown(handle: FileSystemFileHandle | null): Promise<boolean> {
    if (!handle || !known) return false;
    if (handle === known) return true;
    try {
      return await known.isSameEntry(handle);
    } catch {
      return false;
    }
  }

  function reload(changed: number[], message: string): void {
    try {
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ changed, message }));
    } catch {}
    keepSlide(app);
    location.reload();
  }

  async function mergeInto(target: FileSystemFileHandle): Promise<'same' | 'other' | 'merged' | 'cancelled'> {
    const base = app.source;
    const pairing = app.pairing;
    if (!base || !pairing || app.session) return 'same';
    let read: string | null;
    try {
      read = await readText(target);
    } catch {
      return 'same';
    }
    if (read === null || read === base.text) return 'same';
    const disk = (await readSettled(target, read)) ?? read;
    if (disk !== diskText && !(await isKnown(target))) return 'other';
    const ours = (): { text: string; edits: Edit[] } => {
      const text = renderDeck(base, pairing, mathLookup(), app.tagEdits).text;
      return { text, edits: changes(base.text, text) ?? [{ start: 0, end: base.text.length, text }] };
    };
    const live = app.slides() as HTMLElement;
    live.inert = true;
    try {
      const first = merge(base.text, ours().edits, disk, 'theirs');
      if (!first) return 'other';
      let prefer: 'ours' | 'theirs' = 'theirs';
      if (first.conflicts.length) {
        conflict.text.textContent = `You edited texts${onSlides(slidesAt(base.text, first.conflicts))} that the file changed too, e.g. through an agent or a git pull, since it was read. Every other edit of yours and change of the file is kept either way.`;
        const choice = await conflict.open('cancel');
        if (choice !== 'ours' && choice !== 'theirs') return 'cancelled';
        prefer = choice;
      }
      const again = await readText(target);
      const now = (again === null ? null : await readSettled(target, again)) ?? disk;
      const mine = ours();
      const result = merge(base.text, mine.edits, now, prefer);
      if (!result) return 'other';
      const also = await write(target, result.text);
      diskText = result.text;
      known = target;
      await remember(target).catch(() => {});
      const theirs = changedSlides(mine.text, result.text);
      app.dirty = false;
      app.drafts.drop();
      reload(theirs, `Saved ${plural(mine.edits.length, 'edit')} to ${target.name} at ${clock()}, merged with the changes of the file${onSlides(theirs)}${also ? `. ${also}` : ''}`);
      return 'merged';
    } finally {
      live.inert = false;
    }
  }

  async function watch(): Promise<void> {
    if (busy || diskText === null || app.state !== 'loaded' || saving || document.hidden || app.session) return;
    busy = true;
    try {
      const at = saves;
      const handle = (await isKnown(app.handle)) ? app.handle : null;
      if (handle) {
        const file = await handle.getFile();
        if (file.lastModified === stamp) return;
        stamp = file.lastModified;
      }
      const read = await readText(handle);
      if (read === null || read === diskText || saves !== at || saving) return;
      const text = await readSettled(handle, read);
      if (text === null || text === diskText || saves !== at || saving || app.session) return;
      const changed = changedSlides(diskText, text);
      if (!app.dirty && !document.querySelector('dialog.beeson-edit-dialog[open], .beeson-math')) {
        reload(changed, `Loaded the changes of the file${onSlides(changed)}`);
        return;
      }
      diskText = text;
      stale = [...new Set([...(stale ?? []), ...changed])].sort((a, b) => a - b);
      nav().mark(changed);
      app.report();
    } catch {} finally {
      busy = false;
    }
  }

  async function restore(): Promise<void> {
    await loadRecents();
    const kept = recentsOfPage()[0]?.handle as Permitted | undefined;
    if (!kept || app.handle) return;
    try {
      if (kept.queryPermission && (await kept.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
      const file = await kept.getFile();
      const text = await file.text();
      if (app.state === 'loaded') {
        if (text !== app.source?.text) return;
      } else if (app.state === 'waiting') {
        app.files.open(text);
        if (!app.pairing?.texts.length) {
          app.source = null;
          app.saved = null;
          app.pairing = null;
          app.state = 'waiting';
          app.note = null;
          app.report();
          return;
        }
      } else return;
      app.handle = kept;
      known = kept;
      diskText = text;
      stamp = file.lastModified;
    } catch {}
  }

  async function start(): Promise<void> {
    let kept: { changed: number[]; message: string } | null = null;
    try {
      kept = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null');
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      kept = null;
    }
    if (kept) {
      await restore();
      if (app.state === 'loaded') {
        app.note = { text: kept.message, warn: false };
        nav().mark(kept.changed);
        app.report();
      }
    }
    window.setInterval(() => void watch(), WATCH_DELAY);
    document.addEventListener('visibilitychange', () => void watch());
  }

  const follow: Follow = {
    start,
    read: (text) => {
      diskText = text;
      known = app.handle;
      stamp = 0;
    },
    begin: () => {
      saves += 1;
      saving = true;
    },
    end: () => {
      saving = false;
    },
    written: (text) => {
      diskText = text;
      known = app.handle;
    },
    merge: mergeInto,
    line: () => (stale && app.dirty && !app.session ? `The file was changed${onSlides(stale)}, and a save merges your edits into it` : null),
    status: () => ({ changed: nav().marked, stale, watching: diskText !== null }),
  };
  app.follow = follow;
  app.listen('session', () => {
    if (app.session) stale = null;
  });
}
