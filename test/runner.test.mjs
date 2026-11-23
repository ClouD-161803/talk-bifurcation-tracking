import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, constants, getPriority, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const command = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
const options = command.split(' ').slice(1);
const absolute = options.map((option, k) => (!option.endsWith('.mjs') ? option : options[k - 1] === '--import' ? pathToFileURL(resolve(option)).href : resolve(option)));

function run(file, env = {}, cwd = undefined) {
  const { NODE_TEST_CONTEXT, GITHUB_ACTIONS, GITHUB_STEP_SUMMARY, ...rest } = process.env;
  const child = spawn(process.execPath, [...(cwd ? absolute : options), ...[file].flat()], { cwd, env: { ...rest, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let report = '';
  let errors = '';
  child.stdout.on('data', (data) => (report += data));
  child.stderr.on('data', (data) => (errors += data));
  return { child, ended: new Promise((done) => child.once('close', (code) => done({ code, report, errors }))) };
}

test('a test file with a failed cleanup and a server left open is ended', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'open.test.mjs'),
    `import { createServer } from 'node:http';
     import { after, before, test } from 'node:test';
     let server;
     before(() => new Promise((done) => (server = createServer(() => {})).listen(0, done)));
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

test('the test files are run at the same time, as node --test runs them', { timeout: 60000, skip: availableParallelism() < 3 && 'node --test runs one file at a time on fewer than three cores' }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = ['one', 'two'].map((name, k, names) => {
    const file = join(root, `${name}.test.mjs`);
    writeFileSync(
      file,
      `import { existsSync, writeFileSync } from 'node:fs';
       import { join } from 'node:path';
       import { test } from 'node:test';
       test('${name} is run with the other file', async () => {
         writeFileSync(join(process.env.ROOT, '${name}'), '');
         const other = join(process.env.ROOT, '${names[1 - k]}');
         for (let n = 0; n < 100 && !existsSync(other); n++) await new Promise((done) => setTimeout(done, 100));
         if (!existsSync(other)) throw new Error('the other file was not started in 10 s');
       });`,
    );
    return file;
  });
  const { code, report } = await run(files, { ROOT: root }).ended;
  assert.equal(code, 0);
  assert.doesNotMatch(report, /^# second run of /m);
  assert.equal(report.match(/^ok \d+ - \w+ is run with the other file$/gm)?.length, 2);
});

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

test('the warning of a round has the characters of a workflow command escaped', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'a,b.test.mjs'),
    `import { existsSync, writeFileSync } from 'node:fs';
     import { test } from 'node:test';
     test('100% of a::b\\nand c', () => {
       const second = existsSync(process.env.SEEN);
       writeFileSync(process.env.SEEN, '');
       if (!second) throw new Error('the test fails');
     });`,
  );
  const { code, report } = await run(join(root, 'a,b.test.mjs'), { SEEN: join(root, 'seen'), GITHUB_ACTIONS: 'true' }).ended;
  assert.equal(code, 0);
  const warning = /^::warning file=(.*),title=Passed in its second run::(.*)$/m.exec(report);
  assert.ok(warning, 'the warning is written as a workflow command');
  assert.match(warning[1], /^[^,:]*a%2Cb\.test\.mjs$/);
  assert.match(warning[2], /^100%25 of a::b%0Aand c failed in .*a,b\.test\.mjs and passed when the file was run again$/);
});

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

test('the test command runs every test file only with --all or a shard, and otherwise asks for the test files', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'test'));
  writeFileSync(join(root, 'test', 'one.test.mjs'), `import { test } from 'node:test';\ntest('one', () => {});`);
  for (const args of [[], ['--all'], ['--shard=1/1']]) {
    const { code, report, errors } = await run(args, {}, root).ended;
    const ran = args.length > 0;
    assert.equal(code, ran ? 0 : 1, `the exit code with ${args.join(' ') || 'no arguments'}`);
    assert.equal(/^ok 1 - one$/m.test(report), ran, `the test is run with ${args.join(' ') || 'no arguments'}`);
    if (!ran) assert.match(errors, /npm test -- test\/.*npm test -- --all/s);
  }
});

test('outside CI, the test files and the processes that they start are run at the lowest priority', { timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'slides-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'priority.test.mjs'),
    `import assert from 'node:assert/strict';
     import { spawn } from 'node:child_process';
     import { getPriority } from 'node:os';
     import { test } from 'node:test';
     test('the priority', async () => {
       const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);
       await new Promise((done) => child.once('spawn', done));
       try {
         assert.deepEqual([getPriority(), getPriority(child.pid)], [Number(process.env.PRIORITY), Number(process.env.PRIORITY)]);
       } finally {
         child.kill();
       }
     });`,
  );
  for (const [ci, priority] of [['', constants.priority.PRIORITY_LOW], ['true', getPriority()]]) {
    const { code, report } = await run(join(root, 'priority.test.mjs'), { CI: ci, PRIORITY: String(priority) }).ended;
    assert.equal(code, 0, `the priority ${ci ? 'on' : 'outside'} CI is not ${priority}:\n${report}`);
  }
});

test('a test file that does not end fails after 15 to 30 minutes', () => {
  const limit = Number(/^--test-timeout=(\d+)$/.exec(options.find((option) => option.startsWith('--test-timeout')) ?? '')?.[1]);
  assert.ok(limit >= 900000 && limit <= 1800000, `the limit of ${command} is ${limit} ms`);
});
