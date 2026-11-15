// the client of a session in Chrome against a network that holds, cuts, or refuses its requests:
// the reload after a change of the head, the end of a session, the reconnect, the rejoin, the
// acknowledgment of Save, and the bookkeeping of a poll, with the requests ruled by NET of net.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('converge fails with the text of each page when a page agrees with the file and another does not', { timeout: 30_000 }, () => {
  // a loop that does not end blocks the event loop of node, hence the call runs in a child process
  const script = `
    import { converge } from './test/helpers/client.mjs';
    const page = (text) => ({ send: async () => ({}), evaluate: async () => text });
    converge({ read: () => 'abc' }, [page('abc'), page('abd')], 'the pages to agree', 300).then(
      () => console.log('resolved'),
      (e) => console.log(e.message),
    );
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.signal, null, 'converge did not fail within 10 s');
  assert.equal(run.stdout.trim(), 'timed out waiting for the pages to agree\npage 0: agrees\npage 1: "abd" where the file has "abc"');
});
