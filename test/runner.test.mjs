// check of the test command of package.json and of its copy in the check workflow

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { split } from '../scripts/shard.mjs';

// the options of node in the test command, before the files
const command = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
const options = command.split(' ').slice(1, -1);

// most test files close their server after their browser, and on Windows the close of the browser
// fails at times. The server was then left open, and the run waited for the file until the limit
// of its job
test('a test file with a failed cleanup and a server left open is ended', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'open.test.mjs'),
    `import { createServer } from 'node:http';
     import { after, before, test } from 'node:test';
     let server;
     before(() => new Promise((done) => (server = createServer(() => {})).listen(0, done)));
     // a file that is not ended by the test command ends by itself, after the wait of the test
     setTimeout(() => server.close(), 30000);
     after(() => {
       throw new Error('the browser is not closed');
       server.close();
     });
     test('a test', () => {});`,
  );
  // without NODE_TEST_CONTEXT, since node does not run the files of a test command inside a test
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const run = spawn(process.execPath, [...options, 'open.test.mjs'], { cwd: root, env, stdio: 'ignore' });
  t.after(() => run.kill());
  const ended = await Promise.race([new Promise((done) => run.once('exit', () => done(true))), new Promise((done) => setTimeout(() => done(false), 20000).unref())]);
  assert.ok(ended, `node ${options.join(' ')} is still running after 20 s`);
});

// on Windows, a test file was not ended after its last test, without an error, and the run waited
// for it until the limit of 45 minutes of its job. With a limit, the file fails by name. The limit
// is on each test and hook in node 26, and on a whole test file in node 22, hence it is a long one
test('a test file that does not end fails after 15 to 30 minutes', () => {
  const limit = Number(/^--test-timeout=(\d+)$/.exec(options.find((option) => option.startsWith('--test-timeout')) ?? '')?.[1]);
  assert.ok(limit >= 900000 && limit <= 1800000, `the limit of ${command} is ${limit} ms`);
});

// the options of node are read from the test command by scripts/shard.mjs, hence they are not
// written in the workflow
test('the test step of the check workflow runs the shard of its job', () => {
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
  const step = /^ +- run: (node scripts\/shard\.mjs .*)$/m.exec(workflow)?.[1];
  // the shards of the matrix are counted, hence a shard is not left out when their number is changed
  const shards = /^ +shard: \[([\d, ]+)\]$/m.exec(workflow)?.[1].split(',').map(Number);
  assert.deepEqual(shards, shards?.map((_, k) => k + 1), 'the shards of the matrix are not 1 to their number');
  assert.equal(step, `node scripts/shard.mjs \${{ matrix.shard }}/${shards.length}`);
});

// a test file is run in one shard only, and each one is run, also when it is missing from
// test/timings.json or when the durations of a system are not known
test('each test file is run in one shard', () => {
  const files = readdirSync('test').filter((file) => file.endsWith('.test.mjs'));
  const table = JSON.parse(readFileSync('test/timings.json', 'utf8'));
  for (const durations of [table.linux, table.win32, {}, { [files[0]]: 1e6 }]) {
    const shards = [1, 2, 3, 4, 5, 6, 7].map((index) => split(files, durations ?? {}, index, 7));
    assert.deepEqual(shards.flat().sort(), [...files].sort());
    assert.ok(shards.every((shard) => shard.length), 'a shard is empty');
  }
});

// the durations of a round are read from the line printed by the reporter of scripts/shard.mjs.
// When the events of node --test are changed, this line is empty, and the shards of the next
// test/timings.json are no longer balanced
test('the reporter of scripts/shard.mjs prints the sum of the test durations of each file', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-shard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'two.test.mjs'),
    `import { before, test } from 'node:test';
     before(() => new Promise((done) => setTimeout(done, 200)));
     test('a', () => new Promise((done) => setTimeout(done, 100)));
     test('b', async (t) => { await t.test('inner', () => {}); });`,
  );
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const reporter = pathToFileURL(resolve('scripts/shard.mjs')).href;
  const run = spawn(process.execPath, ['--test', `--test-reporter=${reporter}`, '--test-reporter-destination=stdout', 'two.test.mjs'], { cwd: root, env });
  let out = '';
  run.stdout.on('data', (chunk) => (out += chunk));
  await new Promise((done) => run.once('close', done));
  const line = /^# durations (\w+) (\{.*\})$/m.exec(out);
  assert.equal(line?.[1], process.platform, out);
  const sums = JSON.parse(line[2]);
  assert.deepEqual(Object.keys(sums), ['two.test.mjs']);
  assert.ok(sums['two.test.mjs'] >= 0.3 && sums['two.test.mjs'] < 10, `the sum is ${sums['two.test.mjs']} s`);
});

// the result of the shards is reported under test (ubuntu-latest) and test (windows-latest) by a
// second job. With a list of systems of its own, this job would report test (windows-latest) as
// passed for a draft, whose shards are not run on Windows
test('the result of the shards is reported for the operating systems of the shards only', () => {
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
  const systems = [...workflow.slice(0, workflow.search(/^  pass:$/m)).matchAll(/^ +os: (.+)$/gm)].map((row) => row[1]);
  assert.equal(systems.length, 2, `${systems.length} lists of operating systems above the job pass`);
  assert.equal(systems[1], systems[0]);
});

// the checks required on main are named after the operating system and the browser of a job of
// check. A job without a name is named after every value of its row, hence a row with a third key
// is reported under another name, and its required check is waited for without an end
test('each job of check is reported under the name of its operating system and its browser', () => {
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
  const job = workflow.slice(workflow.search(/^  check:$/m));
  const rows = [...job.matchAll(/^ +- \{ (.+) \}$/gm)].map((row) => Object.fromEntries(row[1].split(', ').map((pair) => pair.split(': '))));
  assert.ok(rows.length >= 5, `the matrix of check has ${rows.length} rows`);
  const name = /^ {4}name: (.+)$/m.exec(job)?.[1];
  const names = rows.map((row) => name?.replace(/\$\{\{ matrix\.(\w+) \}\}/g, (_, key) => row[key] ?? '') ?? `check (${Object.values(row).join(', ')})`);
  assert.deepEqual(names, rows.map((row) => `check (${row.os}, ${row.browser})`));
});
