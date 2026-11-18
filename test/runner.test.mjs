// check of the test command of package.json and of its copy in the check workflow

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// the options of node in the test command, before the files
const command = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
const options = command.split(' ').slice(1, -1);

// runs the test command on file from the root of the repository, without NODE_TEST_CONTEXT, since
// node does not run the files of a test command inside a test. Resolves to the exit code and the
// TAP report of the run in ended
function run(file, env = {}) {
  const { NODE_TEST_CONTEXT, ...rest } = process.env;
  const child = spawn(process.execPath, [...options, '--test-reporter=tap', file], { env: { ...rest, ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
  let report = '';
  child.stdout.on('data', (data) => (report += data));
  return { child, ended: new Promise((done) => child.once('close', (code) => done({ code, report }))) };
}

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
       if (process.env.FAIL) throw new Error('the browser is not closed');
     });
     test('a test', () => {});`,
  );
  for (const [fail, code] of [['', 0], ['1', 1]]) {
    const { child, ended } = run(join(root, 'open.test.mjs'), { FAIL: fail });
    t.after(() => child.kill());
    const result = await Promise.race([ended, new Promise((done) => setTimeout(done, 20000).unref())]);
    assert.ok(result, `node ${options.join(' ')} is still running after 20 s`);
    assert.equal(result.code, code, `the exit code with a ${fail ? 'failed' : 'passed'} cleanup`);
    assert.match(result.report, /^ok 1 - a test$/m);
  }
});

// the reports of the last tests of a file were lost at times when its process was ended, since the
// writes of its reports to the pipe of the test command were still queued. Their loss is random,
// hence each file is run ten times
test('every test of a test file is reported, and a failed last test by its name and message', { timeout: 120000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'many.test.mjs'),
    `import { test } from 'node:test';
     for (let n = 0; n < 300; n++) {
       test(\`test \${n} \${'x'.repeat(120)}\`, () => {
         if (process.env.FAIL && n === 299) throw new Error('the last test fails');
       });
     }`,
  );
  for (const fail of ['', '1']) {
    for (let k = 0; k < 10; k++) {
      const { code, report } = await run(join(root, 'many.test.mjs'), { FAIL: fail }).ended;
      assert.equal(code, fail ? 1 : 0);
      assert.equal(report.match(/^(not )?ok \d+ - test /gm)?.length, 300, `the tests reported in run ${k + 1}${fail ? ' with a failed last test' : ''}`);
      if (fail) assert.match(report, /^not ok 300 - test 299 x+\n(.*\n)*? +error: 'the last test fails'$/m);
    }
  }
});

// on Windows, a test file was not ended after its last test, without an error, and the run waited
// for it until the limit of 45 minutes of its job. With a limit, the file fails by name. The limit
// is on each test and hook in node 26, and on a whole test file in node 22, hence it is a long one
test('a test file that does not end fails after 15 to 30 minutes', () => {
  const limit = Number(/^--test-timeout=(\d+)$/.exec(options.find((option) => option.startsWith('--test-timeout')) ?? '')?.[1]);
  assert.ok(limit >= 900000 && limit <= 1800000, `the limit of ${command} is ${limit} ms`);
});

test('the test step of the check workflow is the test command with the shard of its job', () => {
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
  const step = /^ +- run: (node --test .*)$/m.exec(workflow)?.[1];
  // the shards of the matrix are counted, hence a shard is not left out when their number is changed
  const shards = /^ +shard: \[([\d, ]+)\]$/m.exec(workflow)?.[1].split(',').map(Number);
  assert.deepEqual(shards, shards?.map((_, k) => k + 1), 'the shards of the matrix are not 1 to their number');
  assert.equal(step?.replace(` --test-shard=\${{ matrix.shard }}/${shards.length}`, ''), command.replaceAll('\\"', '"'));
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
