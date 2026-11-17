// the table of the authority in .session/applied.json: the seq of the last operation of each client
// id in index.html, as [client, seq] pairs, oldest first. it is written after each write of
// index.html, hence a kill between the two writes leaves a table older than the file, and a page then
// repeats an operation rather than losing it

import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { renameRetried, renameRetriedSync } from './disk.ts';

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

// written at once by a temporary file and a rename, at the stop, right before the exit
function writeApplied(file: string, table: [string, number][], log: (message: string) => void): void {
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

// the table written by a temporary file and a rename, one write at a time, so that a rename that is
// tried again does not hold the pages, and the newest table written once the write in flight ends
export class AppliedTable {
  private next: [string, number][] | null = null;
  private saving: Promise<void> | null = null;
  private stopped = false;
  private readonly file: string;
  private readonly log: (message: string) => void;

  constructor(file: string, log: (message: string) => void) {
    this.file = file;
    this.log = log;
  }

  write(table: [string, number][]): void {
    this.next = table;
    if (!this.saving && !this.stopped) this.saving = this.flush();
  }

  // at the stop, after the last write of index.html. the write in flight ends first, since its
  // older table would otherwise replace the newest one
  async stop(): Promise<void> {
    this.stopped = true;
    await this.saving;
    if (this.next) writeApplied(this.file, this.next, this.log);
    this.next = null;
  }

  private async flush(): Promise<void> {
    while (this.next && !this.stopped) {
      const table = this.next;
      this.next = null;
      const tmp = `${this.file}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await writeFile(tmp, JSON.stringify(table));
        await renameRetried(tmp, this.file);
      } catch (e) {
        await unlink(tmp).catch(() => {});
        this.log(`could not write ${this.file}: ${(e as Error).message}`);
      }
    }
    this.saving = null;
  }
}
