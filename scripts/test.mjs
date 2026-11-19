// npm test: the options of node are those of package.json, which each test file inherits
//   node ... scripts/test.mjs [--shard=N/M | --all | test file ...]
//
// Every test file is run only with --shard or --all, since the whole suite is run by CI in each
// round, and it takes over an hour on a laptop. Outside CI, the test files and their browsers are
// run at the lowest priority of the system, hence a laptop stays usable while they run.
//
// The test files are run as node --test runs them, and their reports are written to standard output
// in TAP. A file with a failed test is then run once more, by itself. The command fails when a file
// fails in both runs. A test that passed in the second run is named in a warning, since it is
// either flaky or the sign of a race in the product, and it does not fail the command.
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { appendFileSync, globSync } from 'node:fs';
import { relative } from 'node:path';
import { constants, setPriority } from 'node:os';

// more failed files than this are not run again, since that many are not flaky at once
const AGAIN = 5;

// text for a workflow command of GitHub, and for the value of one of its properties. GitHub reads
// these characters as parts of the command
const data = (text) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const property = (text) => data(text).replaceAll(':', '%3A').replaceAll(',', '%2C');

const args = process.argv.slice(2);
const shard = args.map((arg) => /^--shard=(\d+)\/(\d+)$/.exec(arg)).find(Boolean);
const named = args.filter((arg) => !arg.startsWith('--'));
if (!named.length && !shard && !args.includes('--all')) {
  console.error('Name the test files to run, e.g. npm test -- test/editor-table.test.mjs. The whole suite is run by CI in each round, and here only with npm test -- --all.');
  process.exit(1);
}
// a runner of CI is not used for anything else. A child process is started at the priority of its
// parent, hence a browser at the priority of its test file
if (!process.env.CI) setPriority(constants.priority.PRIORITY_LOW);
const files = (named.length ? named : globSync('test/*.test.mjs')).sort();
// the limit of a test file in node 22, in which only the limit of each test is inherited
const timeout = Number(process.execArgv.find((arg) => arg.startsWith('--test-timeout='))?.split('=')[1]) || undefined;

// one run of files. the returned map has the names of the failed tests of each failed file
async function once(options) {
  const failed = new Map();
  // as many files at once as node --test runs, i.e. one fewer than the cores. run() by itself runs
  // one file at a time
  const stream = run({ timeout, concurrency: true, ...options });
  stream.on('test:fail', ({ file, name, details }) => {
    const key = relative(process.cwd(), file ?? name).replaceAll('\\', '/');
    const names = failed.get(key) ?? [];
    // a test that failed only through its subtests is named by them
    if (details?.error?.failureType !== 'subtestsFailed') names.push(name);
    failed.set(key, names);
  });
  for await (const chunk of stream.compose(tap)) process.stdout.write(chunk);
  return failed;
}

const first = await once({ files, ...(shard && { shard: { index: Number(shard[1]), total: Number(shard[2]) } }) });
if (first.size === 0) process.exit(0);
if (first.size > AGAIN) {
  console.log(`# ${first.size} test files failed, which are not run again`);
  process.exit(1);
}

console.log(`# second run of ${[...first.keys()].join(', ')}`);
const second = await once({ files: [...first.keys()], concurrency: 1 });
for (const [file, names] of first) {
  if (second.has(file)) continue;
  for (const name of names) {
    const text = `${name} failed in ${file} and passed when the file was run again`;
    console.log(process.env.GITHUB_ACTIONS ? `::warning file=${property(file)},title=Passed in its second run::${data(text)}` : `# warning: ${text}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${text}\n`);
  }
}
process.exit(second.size ? 1 : 0);
