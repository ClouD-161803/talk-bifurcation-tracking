import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const source = 'if (window.VideoEncoder) VideoEncoder.isConfigSupported = async (config) => ({ supported: false, config })';
const spawn = childProcess.spawn;
let id = 1e9;

childProcess.spawn = (...args) => {
  const child = spawn(...args);
  const pipe = child.stdio[3];
  if (!pipe) return child;
  const write = pipe.write.bind(pipe);
  pipe.write = (data, ...rest) => {
    const done = write(data, ...rest);
    for (const message of String(data).split('\0').filter(Boolean)) {
      const { method, sessionId } = JSON.parse(message);
      if (method === 'Page.enable') {
        write(`${JSON.stringify({ id: ++id, method: 'Page.addScriptToEvaluateOnNewDocument', params: { source }, sessionId })}\0`);
      }
    }
    return done;
  };
  return child;
};
syncBuiltinESMExports();
