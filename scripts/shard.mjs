// node scripts/shard.mjs 3/7 runs the third of seven shards of the test files, with the options of
// node in the test command of package.json. the files are split by their durations on the system
// of the run in test/timings.json, hence the shards take about as long as each other. with
// --test-shard, node splits the files by their index instead. a file missing from
// test/timings.json is given the mean duration
//
// node scripts/shard.mjs --timings <run id> writes the durations of a round of the workflow check
// into test/timings.json, from its logs read with gh. the durations of each shard are printed on
// the last line of its log by this file, which node --test loads as a second reporter
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const timings = 'test/timings.json';

/** The files of shard `index` of `count`, with `durations` in seconds by file name. */
export function split(files, durations, index, count) {
  const known = files.filter((file) => durations[file] !== undefined);
  const mean = known.reduce((sum, file) => sum + durations[file], 0) / known.length || 1;
  const cost = (file) => durations[file] ?? mean;
  const shards = Array.from({ length: count }, () => ({ files: [], sum: 0 }));
  // the longest file first, each into the shard with the least sum
  for (const file of [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1))) {
    const shard = shards.reduce((least, next) => (next.sum < least.sum ? next : least));
    shard.files.push(file);
    shard.sum += cost(file);
  }
  return shards[index - 1].files.sort();
}

/** A reporter of node --test, which prints the sum of the test durations of each file in seconds. */
export default async function* durations(events) {
  const sums = {};
  for await (const { type, data } of events) {
    if ((type === 'test:pass' || type === 'test:fail') && data.nesting === 0 && data.file) {
      const file = basename(data.file);
      sums[file] = (sums[file] ?? 0) + (data.details.duration_ms ?? 0) / 1000;
    }
  }
  yield `# durations ${process.platform} ${JSON.stringify(sums)}\n`;
}

function run(shard) {
  const [index, count] = shard.split('/').map(Number);
  if (!(index >= 1 && index <= count)) throw new Error(`the shard ${shard} is not of the form 3/7`);
  const files = readdirSync('test').filter((file) => file.endsWith('.test.mjs'));
  const table = JSON.parse(readFileSync(timings, 'utf8'))[process.platform] ?? {};
  const options = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test.split(' ').slice(1, -1);
  const reporters = [process.stdout.isTTY ? 'spec' : 'tap', './scripts/shard.mjs'].flatMap((reporter) => [`--test-reporter=${reporter}`, '--test-reporter-destination=stdout']);
  const tests = split(files, table, index, count).map((file) => `test/${file}`);
  spawn(process.execPath, [...options, ...reporters, ...tests], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 1));
}

function write(round) {
  const log = execFileSync('gh', ['run', 'view', round, '--log'], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const fresh = {};
  for (const [, system, sums] of log.matchAll(/# durations (\w+) (\{.*\})/g)) Object.assign((fresh[system] ??= {}), JSON.parse(sums));
  if (!Object.keys(fresh).length) throw new Error(`the logs of round ${round} do not have durations`);
  // a system without shards in the round, e.g. Windows for a draft, keeps its durations
  const table = { ...JSON.parse(readFileSync(timings, 'utf8')), ...fresh };
  const rounded = Object.fromEntries(
    Object.entries(table)
      .sort()
      .map(([system, sums]) => [system, Object.fromEntries(Object.entries(sums).sort().map(([file, s]) => [file, Math.round(s * 10) / 10]))]),
  );
  writeFileSync(timings, `${JSON.stringify(rounded, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [first, second] = process.argv.slice(2);
  if (first === '--timings') write(second);
  else run(first ?? '');
}
