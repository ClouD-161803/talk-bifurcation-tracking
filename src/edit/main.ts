// node theme/edit.mjs [folder] [--port N] [--no-open] [--relay URL]. the module is imported by the
// tests for the sync core without starting anything, hence the command runs only when this file
// is the main module

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AlreadyRunning, start } from './command.ts';
import { NotUtf8 } from './disk.ts';
import type { HistoryOptions } from './history.ts';

export { Authority } from '../session/authority.ts';
export type { AuthorityOptions, Observer, Submission } from '../session/authority.ts';
export { Replica } from '../session/replica.ts';
export type { Side } from '../session/replica.ts';
export { apply, checksum, combine, conflict, diff, invert, mergePatches, shift, shiftOffset, size, valid, widen } from '../session/patch.ts';
export { cleanPersonName, COLORS, formatVersion, isPersonId, NAME_MAX, nameKey, parseVersion } from '../session/protocol.ts';
export type * from '../session/protocol.ts';
export { changes } from '../editor/merge.ts';
export { tokenize } from '../editor/tokens.ts';
export { cleanName, start } from './command.ts';
export { decode, Disk } from './disk.ts';
export { History, moveMarks, operationOf } from './history.ts';
export { slideChanges, slidesOf } from '../session/slides.ts';
export { checkAnchors, moveAnchors, REMOVED_MAX, slideAnchorAt, slideAt, startTagAt } from '../session/anchor.ts';

const USAGE = 'usage: node theme/edit.mjs [folder] [--port N] [--no-open] [--relay URL]';

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(command as string, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => process.stderr.write(`Open ${url} in a browser.\n`));
    child.unref();
  } catch {
    process.stderr.write(`Open ${url} in a browser.\n`);
  }
}

// the times and limits of the version history from SLIDES_HISTORY, a JSON object such as
// {"quiet":50,"longest":200}, with which a test makes them short
function historyOptions(): HistoryOptions {
  const out: Record<string, number> = {};
  try {
    const given = JSON.parse(process.env.SLIDES_HISTORY ?? '{}');
    for (const k of ['quiet', 'longest', 'maxBytes', 'keep', 'asideBytes', 'asideFiles']) if (Number.isFinite(given?.[k]) && given[k] >= 0) out[k] = given[k];
  } catch {}
  return out;
}

async function main(argv: string[]): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    process.stderr.write(`The edit command needs Node.js 20 or later, and this is Node.js ${process.versions.node}. Install a newer one from https://nodejs.org\n`);
    process.exit(1);
  }
  let folder: string | undefined, port: number | undefined, relay: string | undefined, open = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') open = false;
    else if (a === '--port') port = Number(argv[++i]);
    else if (a === '--relay') relay = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write(`${USAGE}\n`);
      return;
    } else if (!a.startsWith('--') && folder === undefined) folder = a;
    else {
      process.stderr.write(`${a} is not an option. ${USAGE}\n`);
      process.exit(2);
    }
  }
  if (port !== undefined && !(Number.isInteger(port) && port >= 0 && port < 65536)) {
    process.stderr.write(`--port takes a number from 0 to 65535. ${USAGE}\n`);
    process.exit(2);
  }
  let running;
  try {
    running = await start({ folder, port, relay, history: historyOptions() });
  } catch (e) {
    if (e instanceof AlreadyRunning) {
      // the page of the first edit command is opened, and its address printed as a start would
      const { url, port: p, key } = e.found;
      process.stdout.write(`${JSON.stringify({ url, port: p, key })}\n`);
      process.stderr.write(`The edit command already runs for this folder at ${url}index.html?edit&session\n`);
      if (open) openBrowser(`${url}index.html?edit&session`);
      return;
    }
    const err = e as NodeJS.ErrnoException;
    const message =
      err instanceof NotUtf8
        ? 'index.html is not valid UTF-8, hence the edit command cannot keep its bytes. Save it as UTF-8 and start again.'
        : err.code === 'ENOENT'
          ? `There is no index.html in ${folder ?? 'this folder'}. Start the edit command in a talk folder.`
          : `The edit command could not start: ${err.message}`;
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ url: running.url, port: running.port, key: running.key })}\n`);
  const page = `${running.url}index.html?edit&session`;
  process.stderr.write(`Editing ${running.root}\nat ${page}\nKeep this window open while you edit, and close it or press Ctrl+C to stop.\n`);
  if (open) openBrowser(page);
  // a write to a terminal that was closed fails, and must not end the command before its stop
  for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {});
  // a close that the relay or an open connection holds ends 3 s after index.html is written, with
  // the status of this write. a stop of the disk that hangs, as on a file system that does not
  // answer, is not ended
  const stop = () => {
    void running.close().then((unwritten) => process.exit(unwritten ? 1 : 0), () => process.exit(1));
    void running.unwritten.then((unwritten) => setTimeout(() => process.exit(unwritten ? 1 : 0), 3000).unref());
  };
  // a fault that escapes every handler still writes index.html before the exit
  const fail = (e: unknown) => {
    process.stderr.write(`The edit command failed: ${(e as Error)?.stack ?? e}\n`);
    void running.close().finally(() => process.exit(1));
    void running.unwritten.then(() => setTimeout(() => process.exit(1), 3000).unref());
  };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
    try {
      process.on(signal, stop);
    } catch {}
  }
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) void main(process.argv.slice(2));
