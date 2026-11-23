import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, converge, ops, show } from './helpers/client.mjs';
import { press, typeKeys } from './helpers/editor.mjs';
import { P, leave, session } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const HOLD = `(() => {
  const f = window.fetch.bind(window);
  window.__held = false;
  window.fetch = (...a) => f(...a).then(async (r) => { while (window.__held) await new Promise((d) => setTimeout(d, 20)); return r; });
  return true;
})()`;
const BUSY = `(${C}.app.history.transact('Wait', () => new Promise((end) => (window.__end = end))), true)`;
const IDLE = `(window.__end(), ${C}.app.history.settle().then(() => true))`;

const para = (text) => `[...document.querySelectorAll('.reveal .slides :is(p, h2)')].find((p) => p.textContent.startsWith(${JSON.stringify(text)}))`;
const slide = (heading) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.startsWith(${JSON.stringify(heading)}))`;
const run = (body) => `(async () => { ${body}; return true; })()`;
const count = (text, part) => text.split(part).length - 1;
const LIST = '  <ul>\n    <li>Alpha</li>\n    <li>Beta</li>\n  </ul>\n';

const MOVE = run(`const p = ${para('Second slide')}; await ${C}.app.doc.move(p, p.parentElement, null)`);
const SWAP = run(`await ${C}.app.commands.run('slide.moveTo', { slides: [${slide('One')}], gap: 2 })`);
const THREE = [['  </ul>\n</section>\n', '  </ul>\n</section>\n\n<section>\n  <h2>Three</h2>\n  <p>Third slide</p>\n</section>\n']];
const NEXT = [['  <p>Second slide</p>\n', '  <p>Second slide</p>\n  <p>Next paragraph</p>\n']];
const CASES = [
  { name: 'a paragraph moved inside its slide', ben: MOVE, into: 'Second slide', ends: /<\/ul>\n {2}<p>Second slide by Ana<\/p>\n<\/section>/ },
  {
    name: 'a paragraph moved to another slide',
    ben: run(`await ${C}.app.doc.move(${para('Second slide')}, ${slide('One')}, null)`),
    into: 'Second slide',
    ends: /<p>First slide<\/p>\n {2}<p>Second slide by Ana<\/p>\n<\/section>/,
  },
  {
    name: 'the undo of a move of a paragraph',
    before: MOVE,
    ben: `${C}.app.commands.run('edit.undo').then(() => true)`,
    into: 'Second slide',
    ends: /<h2>Two<\/h2>\n {2}<p>Second slide by Ana<\/p>\n {2}<ul>/,
  },
  {
    name: 'a paragraph moved inside its slide',
    where: 'the heading of this slide',
    ben: MOVE,
    into: 'Two',
    ends: /<h2>Two by Ana<\/h2>\n {2}<ul>\n.*\n.*\n {2}<\/ul>\n {2}<p>Second slide<\/p>\n<\/section>/,
  },
  { name: 'a slide moved below the next one', ben: SWAP, into: 'First slide', ends: /<h2>Two<\/h2>[^]*<h2>One 1<\/h2>\n {2}<p>First slide by Ana<\/p>/ },
  { name: 'a slide swapped with a slide of the same shape', edits: [[LIST, '']], ben: SWAP, into: 'Second slide', ends: /<h2>Two<\/h2>\n {2}<p>Second slide by Ana<\/p>[^]*<h2>One 1<\/h2>/ },
  {
    name: 'two slides moved at once below a third one',
    edits: THREE,
    slides: 3,
    ben: run(`await ${C}.app.commands.run('slide.moveTo', { slides: [${slide('One')}, ${slide('Two')}], gap: 3 })`),
    into: 'First slide',
    ends: /<h2>Three<\/h2>[^]*<h2>One 1<\/h2>\n {2}<p>First slide by Ana<\/p>[^]*<h2>Two<\/h2>/,
  },
  {
    name: 'two paragraphs moved at once to another slide',
    edits: NEXT,
    ben: run(`await ${C}.app.history.transact('Move', async () => { for (const p of [${para('Second slide')}, ${para('Next paragraph')}]) await ${C}.app.doc.move(p, ${slide('One')}, null); })`),
    into: 'Next paragraph',
    ends: /<p>First slide<\/p>\n {2}<p>Second slide<\/p>\n {2}<p>Next paragraph by Ana<\/p>\n<\/section>/,
  },
  {
    name: 'a paragraph moved to another slide and typed in by the mover',
    ben: run(`await ${C}.app.doc.move(${para('Second slide')}, ${slide('One')}, null)`),
    then: async (ben) => {
      await caretAtEnd(ben, para('Second slide'));
      await press(ben, 'Home');
      await typeKeys(ben, 'Now ');
    },
    into: 'Second slide',
    ends: /<p>First slide<\/p>\n {2}<p>Now Second slide by Ana<\/p>\n<\/section>/,
  },
];

async function start(t, held, { edits = [], before }) {
  const { server, pages } = await session(t, ['Ana', 'Ben'], { edits });
  const [ana, ben] = pages;
  const page = held === 'ana' ? ana : ben, other = held === 'ana' ? ben : ana;
  await page.evaluate(HOLD);
  await show(other, 'One');
  await caretAtEnd(other, `${slide('One')}.querySelector('h2')`);
  await typeKeys(other, ' 1');
  await converge(server, pages);
  await leave(other);
  await until(() => page.evaluate(`${P}.holds.size === 0`), 'the hold of the heading to end');
  if (before) {
    await front(ben);
    assert.ok(await ben.evaluate(before));
    await converge(server, pages);
  }
  return { server, pages, ana, ben };
}

const headingOf = (into) => (into === 'First slide' ? 'One' : 'Two');

async function caretIn(ana, into) {
  await show(ana, headingOf(into));
  await caretAtEnd(ana, para(into));
}

async function typeIn(ana, into) {
  await caretIn(ana, into);
  await typeKeys(ana, ' by Ana');
}

function kept(text, into, { ends, slides: n = 2 }) {
  const slides = text.slice(text.indexOf('<div class="slides">'));
  assert.equal(count(slides, '<section'), n, `the deck has ${n} slides`);
  assert.equal(count(slides, '</section>'), n, `the deck has ${n} slides`);
  assert.equal(count(slides, 'First slide'), 1, 'the paragraph of slide One is in the deck once');
  assert.equal(count(slides, 'Second slide'), 1, 'the paragraph of slide Two is in the deck once');
  assert.equal(count(slides, 'One 1'), 1, 'the heading of slide One keeps its key');
  assert.match(slides, new RegExp(`${into} by Ana</(p|h2)>`), 'the key of Ana is in her text element');
  if (ends) assert.match(slides, ends);
}

for (const c of CASES) {
  const { name, where = 'it' } = c;
  test(`${name} by one person while another person types in ${where}, received after the key, keeps the move, the key, and the text once`, { timeout: 300_000 }, async (t) => {
    const { server, pages, ana, ben } = await start(t, 'ana', c);
    const was = server.read();
    await ana.evaluate('window.__held = true');
    await front(ben);
    assert.ok(await ben.evaluate(c.ben));
    await c.then?.(ben);
    await until(() => server.read() !== was, 'index.html to hold the change of Ben');
    const sent = await ops(ana);
    await typeIn(ana, c.into);
    await until(async () => (await ops(ana)) > sent, 'the key of Ana to be sent');
    await ana.evaluate('window.__held = false');
    kept(await converge(server, pages, 'the pages and index.html to agree', 40_000), c.into, c);
  });

  test(`${name} by one person whose page has not received the key of another person in ${where} keeps the move, the key, and the text once`, { timeout: 300_000 }, async (t) => {
    const { server, pages, ana, ben } = await start(t, 'ben', c);
    await ben.evaluate('window.__held = true');
    await typeIn(ana, c.into);
    await until(() => server.read().includes(' by Ana'), 'index.html to hold the key of Ana');
    const sent = await ops(ben);
    await front(ben);
    assert.ok(await ben.evaluate(c.ben));
    await c.then?.(ben);
    await until(async () => (await ops(ben)) > sent, 'the change of Ben to be sent');
    await ben.evaluate('window.__held = false');
    kept(await converge(server, pages, 'the pages and index.html to agree', 40_000), c.into, c);
  });

  test(`${name} by one person while the key of another person in ${where} is not read yet keeps the move, the key, and the text once`, { timeout: 300_000 }, async (t) => {
    const { server, pages, ana, ben } = await start(t, 'ana', c);
    await show(ana, headingOf(c.into));
    assert.ok(await ana.evaluate(BUSY));
    const was = server.read();
    await front(ben);
    assert.ok(await ben.evaluate(c.ben));
    await until(() => server.read() !== was, 'index.html to hold the change of Ben');
    await until(async () => (await ana.evaluate(`${C}.base?.text`)) === server.read(), 'the page of Ana to receive the change of Ben');
    if (c.then) {
      const moved = server.read();
      await c.then(ben);
      await until(() => server.read() !== moved, 'index.html to hold the key of Ben');
    }
    await front(ana);
    await caretAtEnd(ana, para(c.into));
    await typeKeys(ana, ' by Ana');
    await until(() => ana.evaluate(`${para(c.into)}.textContent.endsWith(' by Ana')`), 'the key of Ana in the deck');
    assert.ok(await ana.evaluate(IDLE));
    kept(await converge(server, pages, 'the pages and index.html to agree', 40_000), c.into, c);
  });
}
