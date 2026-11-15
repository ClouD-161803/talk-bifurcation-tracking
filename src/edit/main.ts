// node theme/edit.mjs [folder] [--port N] [--no-open] [--relay URL]. the module is imported by the
// tests for the sync core without starting anything, hence the command runs only when this file
// is the main module

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './command.ts';
import { NotUtf8 } from './disk.ts';

export { Authority } from '../session/authority.ts';
export type { AuthorityOptions, Observer, Submission } from '../session/authority.ts';
export { Replica } from '../session/replica.ts';
export type { Side } from '../session/replica.ts';
export { apply, checksum, combine, conflict, diff, invert, mergePatches, shift, shiftOffset, size, valid, widen } from '../session/patch.ts';
export { COLORS, formatVersion, parseVersion } from '../session/protocol.ts';
export type * from '../session/protocol.ts';
export { changes } from '../editor/merge.ts';
export { tokenize } from '../editor/tokens.ts';
export { cleanName, start } from './command.ts';
export { decode } from './disk.ts';

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
    running = await start({ folder, port, relay });
  } catch (e) {
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
  const stop = () => {
    void running.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
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
