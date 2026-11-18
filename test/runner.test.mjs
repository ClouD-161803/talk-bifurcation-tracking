// check of the test command of package.json and of its copy in the check workflow

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// the options of node in the test command, and its script
const command = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
const options = command.split(' ').slice(1);

// runs the test command on file from the root of the repository, without NODE_TEST_CONTEXT, since
// node does not run the files of a test command inside a test. Resolves to the exit code and the
// TAP report of the run in ended. The variables of GitHub Actions are left out, hence a warning of
// a run is not read as one of the round
function run(file, env = {}) {
  const { NODE_TEST_CONTEXT, GITHUB_ACTIONS, GITHUB_STEP_SUMMARY, ...rest } = process.env;
  const child = spawn(process.execPath, [...options, file], { env: { ...rest, ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
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

// a failed test file is run once more. On a runner, one test in about 1,700 fails without a fault
// in the code under test often enough that most rounds had a failed job
test('a test that fails in one run of its file is named in a warning, and one that fails in two runs fails the command', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'twice.test.mjs'),
    `import { existsSync, writeFileSync } from 'node:fs';
     import { test } from 'node:test';
     test('a test before', () => {});
     test('a test of two runs', () => {
       const second = existsSync(process.env.SEEN);
       writeFileSync(process.env.SEEN, '');
       if (!second || process.env.FAIL) throw new Error('the test fails');
     });`,
  );
  for (const fail of ['', '1']) {
    rmSync(join(root, 'seen'), { force: true });
    const { code, report } = await run(join(root, 'twice.test.mjs'), { FAIL: fail, SEEN: join(root, 'seen') }).ended;
    assert.equal(code, fail ? 1 : 0);
    const runs = report.split(/^# second run of .*twice\.test\.mjs$/m);
    assert.equal(runs.length, 2, 'the file is run twice');
    assert.match(runs[0], /^not ok 2 - a test of two runs$/m);
    assert.match(runs[1], fail ? /^not ok 2 - a test of two runs$/m : /^ok 2 - a test of two runs$/m);
    assert.equal(/^# warning: a test of two runs failed in .*twice\.test\.mjs and passed when the file was run again$/m.test(runs[1]), !fail);
  }
});

// the reports of the last tests of a file were lost at times when its process was ended, since the
// writes of its reports to the pipe of the test command were still queued. Their loss is random,
// hence each file is run ten times. A file with a failed test is reported twice, for its two runs
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
      const runs = report.split(/^# second run of .*$/m);
      assert.equal(runs.length, fail ? 2 : 1);
      for (const part of runs) {
        assert.equal(part.match(/^(not )?ok \d+ - test /gm)?.length, 300, `the tests reported in run ${k + 1}${fail ? ' with a failed last test' : ''}`);
        if (fail) assert.match(part, /^not ok 300 - test 299 x+\n(.*\n)*? +error: 'the last test fails'$/m);
      }
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
  const step = /^ +- run: (node .* scripts\/test\.mjs .*)$/m.exec(workflow)?.[1];
  // the shards of the matrix are counted, hence a shard is not left out when their number is changed
  const shards = /^ +shard: \[([\d, ]+)\]$/m.exec(workflow)?.[1].split(',').map(Number);
  assert.deepEqual(shards, shards?.map((_, k) => k + 1), 'the shards of the matrix are not 1 to their number');
  assert.equal(step?.replace(` --shard=\${{ matrix.shard }}/${shards.length}`, ''), command);
});

// pass is the one check that is required on main. A job that pass does not need could fail without
// failing it. Without always(), pass is skipped after a failed job, and a skipped check counts as
// passed
test('the check pass needs every other job of the check workflow, and is run after a failed job', () => {
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
  const jobs = workflow.slice(workflow.search(/^jobs:$/m));
  const names = [...jobs.matchAll(/^  ([\w-]+):$/gm)].map((row) => row[1]);
  const pass = jobs.slice(jobs.search(/^  pass:$/m)).split(/^  [\w-]+:$/m)[1];
  const needs = /^    needs: \[(.+)\]$/m.exec(pass)?.[1].split(', ');
  assert.deepEqual(needs?.toSorted(), names.filter((name) => name !== 'pass').toSorted());
  assert.match(pass, /^    if: \$\{\{ always\(\) \}\}$/m);
});
