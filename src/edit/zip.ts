// the talk folder of a session as one zip, for a person who presents the deck from their own
// machine. it holds index.html as the session has it and every other file that the edit command
// serves, apart from the outputs of the exports. node:zlib has crc32 only since Node 20.15, and its
// synchronous deflate would hold up every page, hence each file goes through gzip, which runs in
// the thread pool and ends with the CRC-32 of the file

import { readdir, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileInside, servedSegment } from './http.ts';

// what npm run check, pdf, and pptx write next to index.html, which a deck does not load
const OUTPUTS = new Set(['check', 'slides.pdf', 'slides.pptx']);
// the most entries of a zip without the zip64 extension
export const MOST_FILES = 0xffff;
// the launchers of the edit command, which are run by a double click
const LAUNCHER = /\.(command|sh)$/i;

// a talk folder of more bytes than the limit, or of more files than a zip holds
export class TooLarge extends Error {
  readonly bytes: number;
  readonly files: number;
  constructor(bytes: number, files: number) {
    super('the talk folder is too large for a zip');
    this.bytes = bytes;
    this.files = files;
  }
}

// a file of the zip. run is the mode of a file that is run
type Source = { name: string; file: string; size: number; mtime: Date; run: boolean };

// macOS finds a file under its composed and its decomposed name, and a deck writes the composed one.
// the other systems tell the two apart, hence the zip of a Mac holds the composed name
const nameOf = (name: string) => (process.platform === 'darwin' ? name.normalize('NFC') : name);

// the files below dir that the edit command serves, by their names with / below the talk folder,
// without index.html and the outputs. a link to a folder is followed inside the talk folder, and
// not into a folder that it is below
async function walk(root: string, dir: string[], above: string[], out: Source[]): Promise<void> {
  const real = await realpath(join(root, ...dir)).catch(() => null);
  if (real === null || above.includes(real) || (dir.length > 0 && !real.startsWith(root + sep))) return;
  const names = await readdir(real).catch(() => [] as string[]);
  for (const name of names.sort()) {
    if (!servedSegment(name)) continue;
    const lower = name.toLowerCase();
    if (dir.length === 0 && (OUTPUTS.has(lower) || lower === 'index.html')) continue;
    const path = [...dir, name];
    const info = await stat(join(root, ...path)).catch(() => null);
    if (info?.isDirectory()) await walk(root, path, [...above, real], out);
    if (!info?.isFile()) continue;
    const file = await fileInside(root, path);
    if (!file) continue;
    out.push({ name: nameOf(path.join('/')), file, size: info.size, mtime: info.mtime, run: (info.mode & 0o111) !== 0 || LAUNCHER.test(name) });
    if (out.length > MOST_FILES) throw new TooLarge(0, out.length);
  }
}
