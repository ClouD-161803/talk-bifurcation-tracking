import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { appendFileSync, globSync } from 'node:fs';
import { relative } from 'node:path';
import { constants, setPriority } from 'node:os';

const AGAIN = 5;

const escapeData = (text) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (text) => escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');

const args = process.argv.slice(2);
const shard = args.map((arg) => /^--shard=(\d+)\/(\d+)$/.exec(arg)).find(Boolean);
const named = args.filter((arg) => !arg.startsWith('--'));
if (!named.length && !shard && !args.includes('--all')) {
  console.error('Name the test files to run, e.g. npm test -- test/editor-table.test.mjs. The whole suite is run by CI in each round, and here only with npm test -- --all.');
  process.exit(1);
}
if (!process.env.CI) setPriority(constants.priority.PRIORITY_LOW);
const files = (named.length ? named : globSync('test/*.test.mjs')).sort();
const timeout = Number(process.execArgv.find((arg) => arg.startsWith('--test-timeout='))?.split('=')[1]) || undefined;

async function once(options) {
  const failed = new Map();
  const stream = run({ timeout, concurrency: true, ...options });
  stream.on('test:fail', ({ file, name, details }) => {
    const key = relative(process.cwd(), file ?? name).replaceAll('\\', '/');
    const names = failed.get(key) ?? [];
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
    console.log(process.env.GITHUB_ACTIONS ? `::warning file=${escapeProperty(file)},title=Passed in its second run::${escapeData(text)}` : `# warning: ${text}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${text}\n`);
  }
}
process.exit(second.size ? 1 : 0);
