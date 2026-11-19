// a module preloaded with node --import, which starts the Chrome of scripts/chrome.mjs with a
// preference for reduced motion, as Chrome is started on the Windows runners of GitHub. the named
// exports of a builtin module, e.g. spawn in scripts/chrome.mjs, are updated from its default
// export by syncBuiltinESMExports

import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const spawn = childProcess.spawn;
childProcess.spawn = (command, args, ...rest) => spawn(command, args?.includes('--remote-debugging-pipe') ? [...args, '--force-prefers-reduced-motion'] : args, ...rest);
syncBuiltinESMExports();
