import type { App } from '../app.ts';
import { addCompanion, plural } from '../file/files.ts';
import { Dialog, host } from '../ui/dialog.ts';
import { make } from '../ui/dom.ts';
import { FOLDER, media, type MediaFile } from './store.ts';

type Permission = 'granted' | 'denied' | 'prompt';
type Folder = FileSystemDirectoryHandle & {
  queryPermission?(o: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<Permission>;
};
type DirectoryPicker = (o?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: FileSystemHandle }) => Promise<Folder>;

const picker = (): DirectoryPicker | undefined => (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const list = (files: MediaFile[]) => {
  const n = files.map((f) => baseName(f.path));
  return n.length < 3 ? n.join(' and ') : `${n.slice(0, -1).join(', ')}, and ${n.at(-1)}`;
};

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = make('a');
  a.href = url;
  a.download = name;
  host().append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export let deckFolder: (deck: FileSystemFileHandle, what?: string) => Promise<FileSystemDirectoryHandle> = () => Promise.reject(new Error('the media files are not installed'));

export function install(app: App): void {
  let folder: Folder | null = null;

  const ask = new Dialog({
    title: 'Choose the folder of the deck',
    text: '',
    buttons: [
      { label: 'Choose Folder…', value: 'choose', primary: true },
      { label: 'Cancel', value: 'cancel' },
    ],
    className: 'media-folder',
  });

  const stopped = (what = '') => new Error(`${what || 'the new media files'} ${/ and /.test(what) || !what ? 'were' : 'was'} not saved, hence ${app.handle?.name ?? 'the deck'} was not saved either`);

  async function pick(deck: FileSystemFileHandle, what: string): Promise<Folder> {
    const show = picker();
    if (!show) throw new Error('your browser cannot write into folders');
    try {
      return await show({ id: 'beeson-deck', mode: 'readwrite', startIn: deck });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw stopped(what);
      if (!(error instanceof DOMException) || (error.name !== 'SecurityError' && error.name !== 'NotAllowedError')) throw error;
    }
    ask.text.textContent = `${what ? `The files ${what} are read and written` : `The new images and videos are written into the folder ${FOLDER}`} next to ${deck.name}. Folders can be written into only after you choose them, hence choose the folder of ${deck.name}.`;
    if ((await ask.open('choose')) !== 'choose') throw stopped(what);
    try {
      return await show({ id: 'beeson-deck', mode: 'readwrite', startIn: deck });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw stopped(what);
      throw error;
    }
  }

  async function folderOf(deck: FileSystemFileHandle, what = ''): Promise<Folder> {
    const holds = async (f: Folder) => (await f.resolve(deck))?.length === 1;
    if (!folder || !(await holds(folder))) {
      const chosen = await pick(deck, what);
      if (!(await holds(chosen))) throw new Error(`${deck.name} is not in the folder ${chosen.name}. Save again and choose the folder of the deck`);
      folder = chosen;
    }
    if (folder.queryPermission && (await folder.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await folder.requestPermission?.({ mode: 'readwrite' })) !== 'granted') throw stopped(what);
    }
    return folder;
  }
  deckFolder = folderOf;

  addCompanion({
    async write(text, deck) {
      const files = media.unsaved(text);
      if (!files.length) return '';
      const into = await (await folderOf(deck)).getDirectoryHandle(FOLDER, { create: true });
      for (const f of files) {
        const writable = await (await into.getFileHandle(baseName(f.path), { create: true })).createWritable();
        await writable.write(f.blob);
        await writable.close();
      }
      media.saved(files);
      return `${plural(files.length, 'new file')} written into ${FOLDER}`;
    },
    download(text) {
      const files = media.unsaved(text);
      for (const f of files) downloadBlob(baseName(f.path), f.blob);
      media.saved(files);
      return files.length ? `Put ${list(files)} into the folder ${FOLDER} next to it` : '';
    },
  });
}
