import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs, { chmodSync, closeSync, existsSync, lstatSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Authority, Disk, start } from '../theme/edit.mjs';
import { DECK, post, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function setup(t, text, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'slides disk-'));
  const file = join(dir, 'index.html');
  writeFileSync(file, text);
  const authority = new Authority(text, { epoch: 'E' });
  const lines = [];
  const disk = new Disk(file, authority, false, { log: (m) => lines.push(m), ...options });
  t.after(async () => {
    await disk.stop();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, file, authority, disk, lines };
}

const big = (mb) => DECK.replace('</body>', `<!-- ${'x'.repeat(mb * 1024 * 1024)} -->\n</body>`);

const temporary = (dir) => readdirSync(dir).filter((n) => n.endsWith('.tmp'));

async function inFlight(dir, timeout = 20_000) {
  const started = performance.now();
  while (temporary(dir).length === 0) {
    if (performance.now() - started > timeout) throw new Error('timed out waiting for a write in flight');
    await new Promise((done) => setImmediate(done));
  }
}

function insert(authority, what, text, author = 'Ann') {
  const at = authority.text.indexOf(what);
  assert.ok(at >= 0, `${what} is not in the text`);
  return authority.enter([{ start: at, end: at, text }], author);
}

test('a backward jump of the wall clock does not hold back the writes while typing goes on', { timeout: 60_000 }, async (t) => {
  const now = Date.now;
  t.after(() => (Date.now = now));
  let writtenAt = null;
  for (let tries = 0; tries < 3 && (writtenAt === null || writtenAt >= 2500); tries++) {
    const { file, authority } = setup(t, DECK);
    insert(authority, '</body>', '<i>0</i>');
    Date.now = () => now() - 3_600_000;
    const started = performance.now();
    writtenAt = null;
    for (let i = 1; writtenAt === null && performance.now() - started < 3000; i++) {
      insert(authority, '</body>', `<i>${i}</i>`);
      if (readFileSync(file, 'utf8').includes('<i>0</i>')) writtenAt = performance.now() - started;
      await sleep(100);
    }
    Date.now = now;
  }
  assert.ok(writtenAt !== null && writtenAt < 2500, `the file was written ${writtenAt} ms after the first operation`);
});

test('a stop while a write is in flight writes the newest text, and the older write does not land after it', { timeout: 60_000 }, async (t) => {
  const { dir, file, authority, disk } = setup(t, big(20));
  insert(authority, '<h2>One', 'ONE ');
  await inFlight(dir);
  insert(authority, '<h2>Two', 'TWO ');
  await disk.stop();
  await disk.idle();
  const after = readFileSync(file, 'utf8');
  assert.ok(after.includes('ONE <h2>One'), 'the file lacks the operation written first');
  assert.ok(after.includes('TWO <h2>Two'), 'the file lacks the operation entered just before the stop');
  assert.deepEqual(temporary(dir), []);
});

test('a write of index.html syncs the temporary file before the rename, and the folder after it where the system allows', { timeout: 60_000 }, async (t) => {
  const { open } = fsp, { renameSync: rename } = fs;
  const events = [];
  t.after(() => {
    [fsp.open, fs.renameSync] = [open, rename];
    syncBuiltinESMExports();
  });
  fsp.open = async (path, ...rest) => {
    const handle = await open(path, ...rest), sync = handle.sync.bind(handle);
    handle.sync = () => (events.push(`sync ${String(path).endsWith('.tmp') ? 'tmp' : 'folder'}`), sync());
    return handle;
  };
  fs.renameSync = (from, to) => (events.push('rename'), rename(from, to));
  syncBuiltinESMExports();
  const { file, authority } = setup(t, DECK, { quiet: 5, latest: 20 });
  insert(authority, '<h2>One', 'ONE ');
  await until(() => readFileSync(file, 'utf8').includes('ONE ') && events.length >= (process.platform === 'win32' ? 2 : 3), 'the write', 5000);
  assert.deepEqual(events, process.platform === 'win32' ? ['sync tmp', 'rename'] : ['sync tmp', 'rename', 'sync folder']);
});

test('a stop right after another program wrote the file keeps the change of this program and the last operation', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk } = setup(t, DECK);
  insert(authority, '<h2>One', 'ONE ');
  writeFileSync(file, DECK.replace('<h2>Two', 'AGENT <h2>Two'));
  await disk.stop();
  const after = readFileSync(file, 'utf8');
  assert.ok(after.includes('ONE <h2>One'), 'the file lacks the operation entered before the stop');
  assert.ok(after.includes('AGENT <h2>Two'), 'the file lacks the change of the other program');
  assert.equal(authority.text, after);
});

test('a change of the file by another program while the edit command writes it is merged, and not overwritten', { timeout: 60_000 }, async (t) => {
  const deck = big(20);
  const { dir, file, authority } = setup(t, deck);
  insert(authority, '<h2>One', 'ONE ');
  await inFlight(dir);
  writeFileSync(file, deck.replace('<h2>Two', 'AGENT <h2>Two'));
  await until(() => {
    const now = readFileSync(file, 'utf8');
    return now === authority.text && now.includes('AGENT <h2>Two') && now.includes('ONE <h2>One');
  }, 'the file and the authority to hold the operation and the change of the other program', 15_000);
});

test('a file written in two steps is taken once it is complete, and an empty file is not taken before 5 s', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk, lines } = setup(t, DECK);
  disk.start();
  const edited = DECK.replace('<h2>One', 'EDITED <h2>One');
  writeFileSync(file, edited.slice(0, Math.floor(edited.length * 0.3)));
  await until(() => authority.text !== DECK || lines.some((l) => l.includes('partly written')), 'the disk to see the first step');
  writeFileSync(file, edited);
  await until(() => authority.text.includes('EDITED') && readFileSync(file, 'utf8') === authority.text, 'the second step to be merged');
  assert.equal(authority.text, edited);

  const emptied = performance.now();
  writeFileSync(file, '');
  await until(() => authority.text === '', 'the empty file to be taken', 15_000);
  const after = performance.now() - emptied;
  assert.ok(after >= 5000, `the empty file was taken ${Math.round(after)} ms after it was written`);
});

async function saveInTwoSteps(file, text, cut, pause) {
  const fd = openSync(file, 'w');
  try {
    writeSync(fd, text.slice(0, cut));
    await pause();
    writeSync(fd, text.slice(cut));
  } finally {
    closeSync(fd);
  }
}

function savedDemo() {
  const deck = readFileSync('index.html', 'utf8'), edited = deck.replace('<h2', 'EDITED <h2');
  return { deck, edited, second: edited.indexOf('<h2', edited.indexOf('<h2') + 1) };
}

function assertWhole(file, authority, expected) {
  assert.equal(authority.text.length, expected.length, 'the session does not hold the whole text');
  assert.ok(authority.text === expected, 'the session differs from the whole text');
  assert.ok(readFileSync(file, 'utf8') === expected, 'the file differs from the whole text');
}

test('a save of the demo deck that pauses for 700 or 1500 ms after 60 percent ends with the whole text and the edit that a person made in the pause', { timeout: 60_000 }, async (t) => {
  const { deck, edited, second } = savedDemo();
  for (const pause of [700, 1500]) {
    const { file, authority, disk } = setup(t, deck);
    disk.start();
    await saveInTwoSteps(file, edited, Math.floor(edited.length * 0.6), async () => {
      authority.enter([{ start: second - 'EDITED '.length, end: second - 'EDITED '.length, text: 'ANN ' }], 'Ann');
      await sleep(pause);
    });
    await until(() => readFileSync(file, 'utf8') === authority.text && authority.text.includes('EDITED'), 'the save to be merged', 15_000);
    assertWhole(file, authority, `${edited.slice(0, second)}ANN ${edited.slice(second)}`);
  }
});

test('a save of the demo deck that pauses after 30 percent until this part is taken ends with the whole text, and with the edit that a person made in the pause', { timeout: 60_000 }, async (t) => {
  const { deck, edited, second } = savedDemo();
  const cut = Math.floor(edited.length * 0.3), part = edited.slice(0, cut);
  {
    const { file, authority, disk } = setup(t, deck);
    disk.start();
    await saveInTwoSteps(file, edited, cut, () => until(() => authority.text === part, 'the first part to be taken', 15_000));
    await disk.stop();
    assertWhole(file, authority, edited);
  }
  {
    const { file, authority, disk } = setup(t, deck);
    disk.start();
    writeFileSync(file, part);
    await until(() => authority.text === part, 'the first part to be taken', 15_000);
    authority.enter([{ start: second, end: second, text: 'ANN ' }], 'Ann');
    await until(() => readFileSync(file, 'utf8') === authority.text, 'the write of the edit of the person');
    writeFileSync(file, edited);
    await disk.stop();
    assertWhole(file, authority, `${edited.slice(0, second)}ANN ${edited.slice(second)}`);
  }
});

test('an agent that writes back after more than 100 writes of people keeps every edit of the people', { timeout: 120_000 }, async (t) => {
  const deck = readFileSync('test-deck.html', 'utf8');
  assert.ok(deck.includes('<body>\n') && deck.includes('</body>'), 'the test deck lacks a body');
  const { file, authority, disk } = setup(t, deck, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  const read = authority.text;
  const tokens = [];
  for (let k = 0; k < 120; k++) {
    const headings = [...authority.text.matchAll(/<h2/g)].map((m) => m.index);
    assert.ok(headings.length >= 5, 'the test deck has fewer than five headings');
    const at = headings[k % headings.length];
    tokens.push(`P${k}Q `);
    authority.enter([{ start: at, end: at, text: tokens[k] }], 'Ann');
    await until(() => readFileSync(file, 'utf8').includes(tokens[k]), `the write of ${tokens[k]}`);
  }
  writeFileSync(file, read.replace('<body>\n', '<body>\n<p>AGENT FIRST</p>\n').replace('</body>', '<p>AGENT LAST</p>\n</body>'));
  await until(() => {
    const now = readFileSync(file, 'utf8');
    return now === authority.text && now.includes('AGENT FIRST') && now.includes('AGENT LAST');
  }, 'the change of the agent to be merged');
  const after = readFileSync(file, 'utf8');
  assert.deepEqual(tokens.filter((token) => !after.includes(token)), []);
});

const timesIn = (text, part) => text.split(part).length - 1;

async function typeInto(authority, file, at, word) {
  insert(authority, at, word);
  const text = authority.text;
  await until(() => readFileSync(file, 'utf8') === text, `the write of ${word.trim()}`);
}

test('an agent that changes a line in which a person typed before and after its read keeps every word once', { timeout: 120_000 }, async (t) => {
  for (const before of [8, 10, 20]) {
    const { file, authority, disk } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20 });
    disk.start();
    const words = Array.from({ length: before + 3 }, (_, k) => ` w${k}`);
    for (const word of words.slice(0, before)) await typeInto(authority, file, ' slide</p>', word);
    const read = readFileSync(file, 'utf8');
    for (const word of words.slice(before)) await typeInto(authority, file, ' slide</p>', word);
    writeFileSync(file, read.replace('First', 'FIRST'));
    await until(() => readFileSync(file, 'utf8') === authority.text && authority.text.includes('FIRST'), 'the change of the agent to be merged');
    assert.ok(authority.text.includes(`<p style="left: 10px">FIRST${words.join('')} slide</p>`), `${before} words before the read: ${authority.text.split('\n')[5]}`);
  }
});

test('a program that changes a line read after a person typed in it keeps the typed words once', { timeout: 60_000 }, async (t) => {
  for (const [words, line] of [[[' is', ' here'], '<p>The second slide is here now</p>'], [['nih'], '<p>2nd slidenih, see X</p>']]) {
    const { file, authority, disk } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20 });
    disk.start();
    for (const word of words) await typeInto(authority, file, '</p>\n</section>\n</body>', word);
    const head = authority.text;
    writeFileSync(file, head.replace(`<p>Second slide${words.join('')}</p>`, line));
    await until(() => authority.text !== head && readFileSync(file, 'utf8') === authority.text, 'the change of the program to be merged');
    assert.equal(readFileSync(file, 'utf8').split('\n')[9], `  ${line}`);
  }
});

function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 2 ** 32;
  };
}

test('a program that changes a text written during a chain of insertions keeps each insertion once', { timeout: 300_000 }, async (t) => {
  const start = ['<!doctype html>', '<html>', '<body>', ...Array.from({ length: 4 }, (_, i) => `<p>the ${'quick brown fox jumps over the lazy dog '.slice(i * 4)}line ${'abcd'[i]}</p>`), '</body>', '</html>', ''].join('\n');
  for (const seed of Array.from({ length: 24 }, (_, i) => i + 1)) {
    const next = random(seed), pick = (n) => Math.floor(next() * n);
    const { file, authority, disk } = setup(t, start, { quiet: 5, latest: 20, poll: 20 });
    disk.start();
    let typed = Array.from(start, () => false);
    const spot = (allowed) => {
      const paragraphs = [...authority.text.matchAll(/<p>([^\n]*)<\/p>/g)].filter((_, i) => allowed(i)), p = paragraphs[pick(paragraphs.length)];
      return p.index + 3 + pick(p[1].length + 1);
    };
    const count = 3 + pick(6), read = pick(count + 1), free = pick(4);
    const near = (at, c) => at >= c.start - 1 && at <= c.end + 1;
    const paragraphOf = (at) => authority.text.slice(0, at).split('<p>').length - 2;
    const change = [], changed = new Set();
    let theirs = null;
    for (let k = 0; ; k++) {
      if (k === read) {
        for (let places = 1 + pick(3); change.length < places; ) {
          const at = spot((i) => i !== free), end = at + pick(5), text = '0123456789'.slice(pick(5), 5 + pick(5));
          if (end === at && !text) continue;
          if (!/^[a-z ]*$/.test(authority.text.slice(at, end)) || typed.slice(at, end).some(Boolean)) continue;
          if (change.some((c) => near(at, c) || near(end, c) || (at < c.start && end > c.end))) continue;
          change.push({ start: at, end, text });
          changed.add(paragraphOf(at));
        }
        change.sort((x, y) => y.start - x.start);
        theirs = change.reduce((text, c) => `${text.slice(0, c.start)}${c.text}${text.slice(c.end)}`, authority.text);
      }
      if (k === count) break;
      const at = spot((i) => !changed.has(i));
      const word = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(pick(26)).slice(0, 1 + pick(3));
      typed = [...typed.slice(0, at), ...Array.from(word, () => true), ...typed.slice(at)];
      for (const c of change) if (at < c.start) [c.start, c.end] = [c.start + word.length, c.end + word.length];
      authority.enter([{ start: at, end: at, text: word }], 'Ann');
      const text = authority.text;
      await until(() => readFileSync(file, 'utf8') === text, `the write of insertion ${k + 1} of seed ${seed}`);
    }
    const head = authority.text, expected = change.reduce((text, c) => `${text.slice(0, c.start)}${c.text}${text.slice(c.end)}`, head);
    writeFileSync(file, theirs);
    await until(() => authority.text !== head && readFileSync(file, 'utf8') === authority.text, `the change of seed ${seed} to be merged`);
    assert.equal(authority.text, expected, `seed ${seed}, ${count} insertions, read after ${read}`);
    await disk.stop();
  }
});

test('an agent that adds a paragraph after a person moved a slide 8 or 9 times keeps each slide once', { timeout: 120_000 }, async (t) => {
  const slides = Array.from({ length: 12 }, (_, i) => `<section>\n  <h2>Slide ${i}</h2>\n  <p>Text of slide ${i}</p>\n</section>\n`);
  const deck = `<!doctype html>\n<html>\n<body>\n${slides.join('')}</body>\n</html>\n`;
  for (const moves of [8, 9]) {
    const { file, authority, disk } = setup(t, deck, { quiet: 5, latest: 20, poll: 20 });
    disk.start();
    const read = readFileSync(file, 'utf8');
    for (let k = 0; k < moves; k++) {
      const text = authority.text, start = text.indexOf('<section>'), end = text.indexOf('</section>\n') + '</section>\n'.length, at = text.indexOf('</body>');
      authority.enter([{ start, end, text: '' }, { start: at, end: at, text: text.slice(start, end) }], 'Ann');
      const moved = authority.text;
      await until(() => readFileSync(file, 'utf8') === moved, `the write of move ${k + 1}`);
    }
    writeFileSync(file, read.replace('<p>Text of slide 5</p>', '<p>Text of slide 5</p>\n  <p>AGENT</p>'));
    await until(() => readFileSync(file, 'utf8') === authority.text && authority.text.includes('AGENT'), 'the change of the agent to be merged');
    const order = [...authority.text.matchAll(/<h2>Slide (\d+)<\/h2>/g)].map((m) => Number(m[1]));
    assert.deepEqual(order, Array.from({ length: 12 }, (_, i) => (i + moves) % 12), `${moves} moves`);
    assert.equal(timesIn(authority.text, 'AGENT'), 1);
  }
});

test('an agent that changes the 193 kB line of the demo deck after 8 writes of a person in this line keeps every write once', { timeout: 120_000 }, async (t) => {
  const deck = readFileSync('index.html', 'utf8');
  const long = deck.split('\n').find((line) => line.length > 100_000);
  assert.ok(long?.endsWith('</script>') && deck.includes(`${long}\n</tycho-viewer>`), 'the demo deck lacks its long line before </tycho-viewer>');
  const { file, authority, disk } = setup(t, deck, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  const marks = Array.from({ length: 11 }, (_, k) => `P${k}Q`);
  for (const mark of marks.slice(0, 8)) await typeInto(authority, file, '\n</tycho-viewer>', mark);
  const read = readFileSync(file, 'utf8');
  for (const mark of marks.slice(8)) await typeInto(authority, file, '\n</tycho-viewer>', mark);
  writeFileSync(file, read.replace(long.slice(0, 120), `${long.slice(0, 100)}AGENT${long.slice(100, 120)}`));
  await until(() => readFileSync(file, 'utf8') === authority.text && authority.text.includes('AGENT'), 'the change of the agent to be merged', 60_000);
  assert.equal(timesIn(authority.text, 'AGENT'), 1);
  const end = authority.text.indexOf('\n</tycho-viewer>');
  assert.equal(authority.text.slice(end - 9 - marks.join('').length, end), `</script>${marks.join('')}`);
});

test('a search for the base that runs out of its time merges on the nearest text found by then, and says so in one line of the log', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk, lines } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20, budget: 0 });
  disk.start();
  for (const word of [' a', ' b', ' c']) await typeInto(authority, file, ' slide</p>', word);
  writeFileSync(file, authority.text.replace('<h2>Two', 'AGENT <h2>Two'));
  await until(() => readFileSync(file, 'utf8') === authority.text && authority.text.includes('AGENT'), 'the change of the agent to be merged');
  assert.equal(lines.filter((l) => l.includes('was cut')).length, 1, lines.join('\n'));
  assert.ok(authority.text.includes('First a b c slide</p>'));
});

test('an outside write back to an earlier text keeps the newer edits of the session, and says so in a line of the log', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk, lines } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  insert(authority, 'Second slide', 'Very ');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the edit of the person to be written');
  writeFileSync(file, DECK);
  await until(() => lines.some((l) => l.includes('earlier text')), 'a line of the log on the earlier text');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the session text to be written back');
  assert.ok(authority.text.includes('Very Second slide'), 'the session lost its newer edit');
});

test('a file with the conflict markers of git is not taken nor written over, the host is told, and the file is taken once the markers are gone', { timeout: 60_000 }, async (t) => {
  const errors = [];
  const { file, authority, disk, lines } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20, onWriteError: (e) => errors.push(e) });
  disk.start();
  insert(authority, 'Second slide', 'Very ');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the edit of the person to be written');
  const good = authority.text;
  const conflicted = good.replace('  <h2>One</h2>\n', '<<<<<<< HEAD\n  <h2>One</h2>\n=======\n  <h2>Uno</h2>\n>>>>>>> origin/main\n');
  writeFileSync(file, conflicted);
  await until(() => errors.some((e) => e?.message.includes('conflict markers')), 'the host to be told of the markers');
  insert(authority, 'First slide', 'Typed ');
  await sleep(300);
  assert.equal(readFileSync(file, 'utf8'), conflicted, 'the file with the markers was written over');
  assert.ok(!authority.text.includes('<<<<<<<'), 'the markers reached the session');
  assert.ok(lines.some((l) => l.includes('conflict markers')), 'the log does not name the markers');
  writeFileSync(file, good.replace('<h2>One</h2>', '<h2>Uno</h2>'));
  await until(() => authority.text.includes('<h2>Uno</h2>') && errors.at(-1) === null, 'the resolved file to be taken');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the session text to be written');
  assert.ok(authority.text.includes('Typed First slide') && authority.text.includes('Very Second slide'), 'an edit of the session was lost');
});

test('a program that changes a line that it changed before replaces its earlier change, and keeps an edit of a person that it did not read', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  writeFileSync(file, DECK.replace('One', 'One first'));
  await until(() => authority.text.includes('One first'), 'the first change to be merged');
  writeFileSync(file, DECK.replace('One', 'One second'));
  await until(() => authority.text.includes('second'), 'the second change to be merged');
  assert.equal(authority.text, DECK.replace('One', 'One second'), 'the second change was merged on the text before the first one');
  insert(authority, 'Second slide', 'Very ');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the edit of the person to be written');
  writeFileSync(file, DECK.replace('One', 'One third'));
  await until(() => authority.text.includes('third'), 'the third change to be merged');
  assert.equal(authority.text, DECK.replace('One', 'One third').replace('Second slide', 'Very Second slide'));
});

test('a program that writes back the text before its own change undoes this change', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  writeFileSync(file, DECK.replace('</body>', '<p>typo</p>\n</body>'));
  await until(() => authority.text.includes('<p>typo</p>'), 'the typo to be merged');
  writeFileSync(file, DECK);
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the file and the session to hold one text');
  assert.equal(authority.text, DECK, 'the change that the program took back is still in the session');
});

async function longestStall(act) {
  const used = () => {
    const { user, system } = process.cpuUsage();
    return (user + system) / 1000;
  };
  let last = performance.now(), worked = used(), longest = 0, turned = null;
  const timer = setInterval(() => {
    const now = performance.now(), cpu = used();
    longest = Math.max(longest, Math.min(now - last, cpu - worked));
    [last, worked] = [now, cpu];
    turned?.();
  }, 1);
  try {
    await act();
    await new Promise((done) => (turned = done));
  } finally {
    clearInterval(timer);
  }
  return longest;
}

async function stallsOnChain(t, texts) {
  const deck = readFileSync('index.html', 'utf8'), at = deck.indexOf('\n</tycho-viewer>');
  const { file, authority, disk } = setup(t, deck, { quiet: 5, latest: 20, poll: 20 });
  for (let k = 1; k <= texts; k++) disk.remember(`${deck.slice(0, at)}${'x'.repeat(k)}${deck.slice(at)}`);
  authority.enter([{ start: at, end: at, text: 'x'.repeat(texts) }], 'Ann');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the write of the last text of the chain');
  disk.start();
  const merge = await longestStall(async () => {
    writeFileSync(file, authority.text.replace('<h2', 'AGENT <h2'));
    await until(() => authority.text.includes('AGENT <h2') && readFileSync(file, 'utf8') === authority.text, 'the change of the agent to be merged', 60_000);
  });
  const stop = await longestStall(() => {
    writeFileSync(file, authority.text.replace('</body>', '<p>AGAIN</p>\n</body>'));
    return disk.stop();
  });
  assert.ok(readFileSync(file, 'utf8').includes('<p>AGAIN</p>'), 'the stop did not merge the change of the agent');
  return { merge, stop };
}

test('a merge and a stop on a chain of 5000 texts of the demo deck hold the event loop no longer than on a chain of 50 texts', { timeout: 300_000 }, async (t) => {
  let short, long;
  for (let tries = 0; tries < 3; tries++) {
    short = await stallsOnChain(t, 50);
    long = await stallsOnChain(t, 5000);
    if (long.merge <= short.merge + 50 && long.stop <= short.stop + 50) break;
  }
  const ms = (n) => `${Math.round(n)} ms`;
  assert.ok(long.merge <= short.merge + 50, `a merge stalled for ${ms(long.merge)} on 5000 texts and ${ms(short.merge)} on 50`);
  assert.ok(long.stop <= short.stop + 50, `a stop stalled for ${ms(long.stop)} on 5000 texts and ${ms(short.stop)} on 50`);
});

const noChmod = process.platform === 'win32' || process.getuid?.() === 0 ? 'chmod does not refuse a read or a write on Windows or to root' : false;

test('a write that keeps failing is reported with the number of unwritten operations, and the stop of the command exits nonzero', { timeout: 120_000, skip: noChmod }, async (t) => {
  const reports = [];
  const { dir, file, authority, disk } = setup(t, DECK, { quiet: 5, latest: 20, onWriteError: (e) => reports.push(e) });
  try {
    chmodSync(dir, 0o555);
    insert(authority, '<h2>One', 'ONE ');
    await until(() => reports.length > 0, 'a report of the failed write');
    assert.equal(reports[0].unwritten, 1);
    assert.ok(reports[0].message.length > 0);
    chmodSync(dir, 0o755);
    await until(() => reports.at(-1) === null && readFileSync(file, 'utf8').includes('ONE '), 'a report that the write succeeded again');
    chmodSync(dir, 0o555);
    insert(authority, '<h2>Two', 'TWO ');
    assert.equal(await disk.stop(), 1);
  } finally {
    chmodSync(dir, 0o755);
  }

  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  const api = (route) => `${edit.base}.session/${route}`;
  try {
    const hello = (await post(edit.port, api('hello'), { name: 'Ann' })).json();
    chmodSync(talk, 0o555);
    const at = DECK.indexOf('One');
    const answer = (await post(edit.port, api('op'), { token: hello.token, seq: 1, base: hello.v, patches: [{ start: at, end: at, text: 'X' }] })).json();
    assert.equal(answer.ok, true);
    await until(() => edit.stderr.includes('could not write'), 'the failed write in the log of the command');
    await stopEdit(edit);
    assert.equal(await edit.exited, 1);
  } finally {
    chmodSync(talk, 0o755);
    await stopEdit(edit);
  }
});

test('a stop that a paused relay and an unfinished request hold past 3 s exits nonzero while an operation is unwritten', { timeout: 120_000, skip: noChmod }, async (t) => {
  const secret = 'the secret of the group for this test';
  const env = { ...process.env, SLIDES_RELAY_SECRET: secret };
  const relay = spawn(process.execPath, ['scripts/relay.mjs', '--port', '0', '--host', '127.0.0.1'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => {
    relay.kill('SIGCONT');
    relay.kill();
  });
  let out = '';
  relay.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
  const port = Number((await until(() => /port (\d+)/.exec(out), 'the relay to listen'))[1]);
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { args: ['--relay', `http://127.0.0.1:${port}`], env: { SLIDES_RELAY_SECRET: secret, XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  await until(() => edit.stderr.includes('shared at'), 'the edit command to register with the relay');
  const api = (route) => `${edit.base}.session/${route}`;
  const open = new Socket();
  t.after(() => open.destroy());
  try {
    const hello = (await post(edit.port, api('hello'), { name: 'Ann' })).json();
    chmodSync(talk, 0o555);
    const at = DECK.indexOf('One');
    const answer = (await post(edit.port, api('op'), { token: hello.token, seq: 1, base: hello.v, patches: [{ start: at, end: at, text: 'X' }] })).json();
    assert.equal(answer.ok, true);
    await new Promise((done) => open.connect(edit.port, '127.0.0.1', done));
    open.write(`POST ${api('op')} HTTP/1.1\r\nHost: 127.0.0.1:${edit.port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"token":`);
    relay.kill('SIGSTOP');
    edit.child.kill('SIGTERM');
    assert.equal(await edit.exited, 1);
    assert.ok(edit.stderr.includes('1 operations are not written'), edit.stderr);
  } finally {
    chmodSync(talk, 0o755);
  }
});

test('a symbolic link index.html is written through to its target, the mode of the file is kept, and a temporary file of an earlier run is removed', { timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'slides disk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const linksAndModes = process.platform !== 'win32';
  const file = join(dir, 'index.html'), target = join(dir, 'real.html');
  const stale = join(dir, `.${linksAndModes ? 'real' : 'index'}.html.0123456789ab.tmp`), other = join(dir, 'notes.tmp');
  writeFileSync(stale, 'half a deck');
  writeFileSync(other, 'notes');
  writeFileSync(linksAndModes ? target : file, DECK);
  if (linksAndModes) {
    chmodSync(target, 0o444);
    symlinkSync('real.html', file);
  }
  const authority = new Authority(DECK, { epoch: 'E' });
  const disk = new Disk(file, authority, false, { quiet: 5, latest: 20 });
  t.after(() => disk.stop());
  assert.equal(existsSync(stale), false, 'the temporary file of an earlier run is still there');
  assert.equal(existsSync(other), true, 'a file that the disk did not write was removed');
  if (!linksAndModes) return;
  insert(authority, '<h2>One', 'ONE ');
  await until(() => readFileSync(target, 'utf8').includes('ONE '), 'the edit in the target of the link', 5000);
  assert.ok(lstatSync(file).isSymbolicLink(), 'index.html is no longer a symbolic link');
  assert.equal(statSync(target).mode & 0o777, 0o444);
});

test('a symbolic link index.html replaced by a file is merged from this file, and the edits of the session are written into it', { timeout: 60_000, skip: process.platform === 'win32' && 'a symbolic link needs a privilege on Windows' }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'slides disk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'index.html'), target = join(dir, 'real.html'), saved = join(dir, 'agent.tmp');
  writeFileSync(target, DECK);
  symlinkSync('real.html', file);
  const authority = new Authority(DECK, { epoch: 'E' });
  const disk = new Disk(file, authority, false, { quiet: 5, latest: 20, poll: 20 });
  t.after(() => disk.stop());
  disk.start();
  writeFileSync(saved, DECK.replace('<h2>Two', 'AGENT <h2>Two'));
  renameSync(saved, file);
  await until(() => authority.text.includes('AGENT <h2>Two'), 'the change of the agent to be merged', 5000);
  insert(authority, '<h2>One', 'ANN ');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the edit of the person in index.html', 5000);
  assert.ok(!lstatSync(file).isSymbolicLink(), 'index.html is a symbolic link again');
  assert.ok(authority.text.includes('ANN <h2>One'));
});

test('a stop on a changed file that cannot be read logs the error and does not throw it', { timeout: 60_000, skip: noChmod }, async (t) => {
  const { file, authority, disk, lines } = setup(t, DECK);
  insert(authority, '<h2>One', 'ONE ');
  writeFileSync(file, DECK.replace('<h2>Two', 'AGENT <h2>Two'));
  chmodSync(file, 0o000);
  try {
    await assert.doesNotReject(disk.stop());
    assert.ok(lines.some((l) => l.includes('could not')), 'the error is not in the log');
  } finally {
    chmodSync(file, 0o644);
  }
});

test('the rename of .session/applied.json lets the edit command answer while it is tried again, writes the newest table, and the stop writes the table that waits behind a write in flight', { timeout: 120_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(talk, '.session', 'applied.json');
  const table = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const { renameSync } = fs;
  const { rename } = fsp;
  const onto = (to) => to.endsWith(join('.session', 'applied.json'));
  let busy = 0;
  let gate = null;
  let gated = false;
  let turned = null;
  let turnedAtRename = null;
  const fail = () => {
    if (turned === null) {
      turned = false;
      setImmediate(() => (turned = true));
    }
    busy--;
    return Object.assign(new Error('EBUSY: resource busy or locked, rename'), { code: 'EBUSY' });
  };
  fs.renameSync = (from, to) => {
    if (onto(to) && busy > 0) throw fail();
    if (onto(to) && turned !== null) turnedAtRename ??= turned;
    return renameSync(from, to);
  };
  fsp.rename = async (from, to) => {
    if (onto(to) && busy > 0) throw fail();
    if (onto(to) && turned !== null) turnedAtRename ??= turned;
    if (onto(to) && gate) {
      gated = true;
      await gate;
    }
    return rename(from, to);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.renameSync = renameSync;
    fsp.rename = rename;
    syncBuiltinESMExports();
  });

  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const api = (route) => `/${running.key}/.session/${route}`;
  const ann = (await post(running.port, api('hello'), { name: 'Ann' })).json();
  const at = DECK.indexOf('</body>');
  let v = ann.v;
  const op = async (seq) => {
    const answer = (await post(running.port, api('op'), { token: ann.token, seq, base: v, patches: [{ start: at, end: at, text: `<i>${seq}</i>` }] })).json();
    assert.equal(answer.ok, true);
    v = answer.v;
  };
  const seq = () => table()?.find(([client]) => client === ann.client)?.[1] ?? null;
  const written = (n) => until(() => readFileSync(join(talk, 'index.html'), 'utf8').includes(`<i>${n}</i>`), `index.html to hold operation ${n}`);

  busy = 3;
  await op(1);
  await until(() => seq() === 1, 'the table to hold operation 1');
  assert.equal(turnedAtRename, true, 'the event loop turned between the first failed rename of the table and the rename that succeeded');

  let release;
  gate = new Promise((done) => (release = done));
  await op(2);
  await written(2);
  await until(() => gated, 'the write of the table of operation 2 to wait');
  await op(3);
  await written(3);
  gate = null;
  release();
  await until(() => seq() === 3, 'the table to hold operation 3');

  gated = false;
  gate = new Promise((done) => (release = done));
  await op(4);
  await written(4);
  await until(() => gated, 'the write of the table of operation 4 to wait');
  await op(5);
  const closing = running.close();
  await written(5);
  gate = null;
  release();
  await closing;
  assert.equal(seq(), 5);
});
