import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const spawn = childProcess.spawn;
childProcess.spawn = (command, args, ...rest) => spawn(command, args?.includes('--remote-debugging-pipe') ? [...args, '--force-prefers-reduced-motion'] : args, ...rest);
syncBuiltinESMExports();
