// the apply of the synchronous editor, see src/editor/session/apply.ts. a person edits the deck on
// one page, and after each edit the text of this page is applied to a second page, which must then
// render as the text with zero problems, without unsaved changes or entries of the history, and
// look as a third page opened fresh on the text

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, editorPage, press, type, typeKeys } from './helpers/editor.mjs';
import { E, applied, applyOn, caretAtEnd, frame, front, sessionPage, showSlide, VIEW } from './helpers/apply.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

// a copy of the repository in a temporary folder, with the deck at text, from which a fresh page
// is opened on the text of an apply
function freshDeck(t, text) {
  const dir = mkdtempSync(join(tmpdir(), 'beeson-apply-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of readdirSync('.')) if (!name.endsWith('.html') && name !== 'node_modules' && name !== '.git') symlinkSync(resolve(name), join(dir, name));
  const file = join(dir, 'deck.html');
  writeFileSync(file, text);
  return file;
}

// the slides of page b look as those of a fresh page opened on text: their text, their elements,
// and the classes and the styles of the file, apart from what the theme and reveal.js add
async function looksFresh(t, b, text) {
  const c = await editorPage(browser, { deck: freshDeck(t, text), text });
  try {
    const want = await c.evaluate(VIEW);
    await front(b);
    const got = await b.evaluate(VIEW);
    assert.equal(got.length, want.length, 'the number of slides');
    for (let i = 0; i < want.length; i++) assert.equal(got[i], want[i], `slide ${i + 1} differs from a fresh page`);
  } finally {
    await c.close();
  }
}

// each edit of the person on page a, run by its function, and a label
const EDITS = [
  ['typing', async (a) => {
    await showSlide(a, 'Show your steps');
    await caretAtEnd(a, `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.startsWith('Design the complete slide'))`);
    await typeKeys(a, ' Go.');
  }],
  ['bold', async (a) => {
    await a.evaluate(`(() => {
      const p = [...document.querySelectorAll('.reveal p')].find((p) => p.textContent.startsWith('Design the complete slide'));
      const node = p.firstChild;
      const at = node.data.indexOf('complete');
      getSelection().setBaseAndExtent(node, at, node, at + 8);
    })()`);
    await press(a, 'Mod+B');
  }],
  ['formula', async (a) => {
    await showSlide(a, 'Equations are first class');
    await a.evaluate(`${E}.setMath([...document.querySelectorAll('.reveal p')].find((p) => p.textContent.startsWith('where')).querySelector('mjx-container'), '\\\\tilde V')`);
  }],
  ['moved box', async (a) => {
    await showSlide(a, 'Figures are first class');
    await click(a, 'section.present > ul > li');
    await a.evaluate(`${E}.exec('arrange.setPosition', { els: [document.querySelector('section.present > ul')], x: 120, y: 260 })`);
  }],
  ['resized box', async (a) => {
    await click(a, 'section.present figure img');
    await a.evaluate(`${E}.exec('arrange.setSize', { els: [document.querySelector('section.present figure')], w: 520 })`);
  }],
  ['color', async (a) => {
    await showSlide(a, 'Equations are first class');
    await a.evaluate(`(() => {
      const p = [...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('gives the dynamics'));
      const node = p.lastChild;
      const at = node.data.indexOf('dynamics');
      p.focus();
      getSelection().setBaseAndExtent(node, at, node, at + 8);
    })()`);
    await a.evaluate(`${E}.exec('text.tone.blue')`);
  }],
  ['step', async (a) => {
    await showSlide(a, 'Figures are first class');
    await click(a, 'section.present figure img');
    await a.evaluate(`${E}.exec('steps.add', { el: document.querySelector('section.present figure') })`);
  }],
  ['text box', async (a) => {
    await showSlide(a, 'Code boxes');
    await a.evaluate(`${E}.exec('insert.text')`);
    await a.waitFor(`document.activeElement?.matches('.reveal p')`);
    await type(a, 'A new box');
  }],
  ['removed element', async (a) => {
    await a.evaluate(`${E}.doc.remove([...document.querySelectorAll('.reveal p')].find((p) => p.textContent.startsWith('Copy-paste the code')))`);
  }],
  ['list item', async (a) => {
    await showSlide(a, 'Show your steps');
    await caretAtEnd(a, `[...document.querySelectorAll('.reveal li')].find((li) => li.textContent.startsWith('Two elements'))`);
    await press(a, 'Enter');
    await typeKeys(a, 'Three.');
  }],
  ['table cell', async (a) => {
    await showSlide(a, 'Embedding videos');
    await a.evaluate(`${E}.exec('insert.table')`);
    await a.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
    for (const key of ['ArrowRight', 'ArrowDown', 'Enter']) await press(a, key);
    await a.waitFor(`document.activeElement?.matches('.reveal th, .reveal td')`);
    await typeKeys(a, 'Cell');
  }],
  ['new slide', async (a) => {
    await a.evaluate(`${E}.exec('slide.new')`);
  }],
  ['first notes', async (a) => {
    await a.evaluate(`${E}.exec('view.notes')`);
    await a.waitFor(`document.activeElement?.matches('.reveal aside.notes')`);
    await typeKeys(a, 'New notes.');
  }],
  ['notes', async (a) => {
    await showSlide(a, 'Embedding TyCHO');
    await caretAtEnd(a, `Reveal.getCurrentSlide().querySelector('aside.notes')`);
    await typeKeys(a, ' More.');
  }],
  ['removed slide', async (a) => {
    await a.evaluate(`${E}.doc.remove([...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent === 'Starting a video on a click'))`);
  }],
  ['reordered slide', async (a) => {
    await a.evaluate(`(() => {
      const all = [...document.querySelectorAll('.reveal .slides > section')];
      const s = all.find((s) => s.querySelector('h2')?.textContent === 'Explain concepts, visually');
      return ${E}.doc.move(s, s.parentElement, all[all.indexOf(s) + 2]);
    })()`);
  }],
  ['moved between slides', async (a) => {
    await a.evaluate(`(() => {
      const p = [...document.querySelectorAll('.reveal p')].find((p) => p.textContent.startsWith('Export your matplotlib'));
      const to = [...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent === 'Embedding videos');
      return ${E}.doc.move(p, to, to.querySelector('h2').nextSibling);
    })()`);
  }],
];

test('each edit of a person on one page is applied to a second page, which reads and looks as the text', async (t) => {
  const a = await sessionPage(browser);
  const b = await sessionPage(browser);
  t.after(() => Promise.all([a.close(), b.close()]));
  let text = a.source;
  let changes = 0;
  for (const [label, edit] of EDITS) {
    await front(a);
    await edit(a);
    // the text is read once the change of the person on page a is told through onChange
    await a.waitFor(`window.__changes > ${changes}`).catch((e) => assert.fail(`${label}: onChange was not called. ${e.message}`));
    await frame(a);
    changes = await a.evaluate('window.__changes');
    const next = await a.evaluate(`${E}.session.text()`);
    assert.equal(next, await a.evaluate(`${E}.render()`), `${label}: the text of the session is the rendered text`);
    assert.notEqual(next, text, `${label}: the edit changed the text`);
    text = next;
    const result = await applyOn(b, text);
    assert.equal(result.reload, false, `${label}: the apply did not need a reload`);
    await applied(b, text, label);
  }
  await looksFresh(t, b, text);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});

// a generator of numbers in [0, 1) from seed, by mulberry32
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the paragraphs, items, and headings of the slides written on one line, outside code and scripts
// and without math, each with its line and its tag
function oneLine(lines) {
  const out = [];
  let slides = false;
  let raw = false;
  for (const [i, l] of lines.entries()) {
    if (l.startsWith('<section')) slides = true;
    if (raw || (/<(pre|script)[\s>]/.test(l) && !/<\/(pre|script)>/.test(l))) {
      raw = !/<\/(pre|script)>/.test(l);
      continue;
    }
    const m = l.match(/^\s*<(p|li|h2)(\s[^>]*)?>(.*)<\/\1>$/);
    if (slides && m && !/<\/?(p|li|h2|div|ul|ol|section)[\s>]/.test(m[3]) && !/[\\$]/.test(l)) out.push({ i, tag: m[1] });
  }
  return out;
}

// the ranges of the lines of the slides, from the line of the start tag to that of the end tag
function slideRanges(lines) {
  const out = [];
  for (const [i, l] of lines.entries()) {
    if (l.startsWith('<section')) out.push([i, i]);
    else if (l.startsWith('</section>')) out.at(-1)[1] = i;
  }
  return out;
}

const WORDS = ['orbit', 'halo', 'family', 'Moon', 'step', 'slide'];
// each change of the text, by its label and its function of the lines and of a pick from a list
const MUTATIONS = [
  ['a word', (lines, pick) => {
    const { i } = pick(oneLine(lines));
    const words = [...lines[i].matchAll(/(?<![&\w])[A-Za-z]{3,}\b(?![^<]*>)/g)].filter((m) => m.index > lines[i].indexOf('>'));
    if (!words.length) return;
    const w = pick(words);
    lines[i] = lines[i].slice(0, w.index) + pick(WORDS) + lines[i].slice(w.index + w[0].length);
  }],
  ['a line taken', (lines, pick) => {
    const all = oneLine(lines).filter((e) => e.tag !== 'h2' && (e.tag === 'p' || lines[e.i - 1].includes('<li') || lines[e.i + 1].includes('<li')));
    lines.splice(pick(all).i, 1);
  }],
  ['a line twice', (lines, pick) => {
    const { i } = pick(oneLine(lines));
    lines.splice(i + 1, 0, lines[i]);
  }],
  ['a line moved', (lines, pick) => {
    const all = oneLine(lines).filter((e) => e.tag === 'p' || lines[e.i - 1].includes('<li') || lines[e.i + 1].includes('<li'));
    const from = pick(all);
    const to = pick(oneLine(lines).filter((e) => e.tag === from.tag && e.i !== from.i));
    const [line] = lines.splice(from.i, 1);
    lines.splice(to.i > from.i ? to.i : to.i + 1, 0, line);
  }],
  ['slides swapped', (lines, pick) => {
    const ranges = slideRanges(lines);
    const a = pick(ranges);
    const b = pick(ranges.filter((r) => r !== a));
    const [first, second] = a[0] < b[0] ? [a, b] : [b, a];
    const cut = (r) => lines.slice(r[0], r[1] + 1);
    lines.splice(first[0], second[1] + 1 - first[0], ...cut(second), ...lines.slice(first[1] + 1, second[0]), ...cut(first));
  }],
  ['a box moved', (lines, pick) => {
    const all = [...lines.keys()].filter((i) => /translate: -?\d+px -?\d+px/.test(lines[i]));
    const i = pick(all);
    const n = pick([1, 2]);
    let k = 0;
    lines[i] = lines[i].replace(/-?\d+(?=px)/g, (v) => (++k === n ? String(Number(v) + pick([-40, -7, -1, 1, 9, 30])) : v));
  }],
  ['a step', (lines, pick) => {
    const { i } = pick(oneLine(lines).filter((e) => e.tag === 'p'));
    lines[i] = lines[i].includes(' class="fragment">') ? lines[i].replace(' class="fragment">', '>') : lines[i].replace(/^(\s*<p)>/, '$1 class="fragment">');
  }],
];

for (const seed of [1, 2, 3]) {
  test(`a seeded sequence of random changes of the text is applied, with the seed ${seed}`, { timeout: 300000 }, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    const rand = random(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    let text = b.source;
    for (let n = 1; n <= 30; n++) {
      const [label, mutate] = pick(MUTATIONS);
      const lines = text.split('\n');
      mutate(lines, pick);
      text = lines.join('\n');
      const at = `seed ${seed}, change ${n}, ${label}`;
      assert.equal((await applyOn(b, text)).reload, false, `${at}: the apply did not need a reload`);
      await applied(b, text, at);
    }
    await looksFresh(t, b, text);
    assert.deepEqual(b.errors, []);
  });
}
