// the table of the authority in .session/applied.json: the seq of the last operation of each client
// id in index.html, as [client, seq] pairs, oldest first. it is written after each write of
// index.html, hence a kill between the two writes leaves a table older than the file, and a page then
// repeats an operation rather than losing it

import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { renameRetriedSync } from './disk.ts';

// the pairs of the file, without those that are malformed, or none when the file is missing
export function readApplied(file: string): [string, number][] {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(value)) return [];
    return value.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && e[0].length <= 64 && Number.isSafeInteger(e[1]) && e[1] >= 1);
  } catch {
    return [];
  }
}

// written at once by a temporary file and a rename, since it follows a write of index.html also at
// the stop, right before the exit
export function writeApplied(file: string, table: [string, number][], log: (message: string) => void): void {
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(table));
    renameRetriedSync(tmp, file);
  } catch (e) {
    log(`could not write ${file}: ${(e as Error).message}`);
    try {
      unlinkSync(tmp);
    } catch {}
  }
}
