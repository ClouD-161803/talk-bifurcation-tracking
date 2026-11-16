// a reference number written as a superscript, e.g. Orion<sup>2,3</sup>, in the show and in the
// editor. the theme raises a sup and lowers a sub, which the reset of reveal.js sets on the
// baseline, without making their lines taller. in the editor, the space typed after a number set
// with Superscript, once Superscript is off again, is typed after the sup at the size of the text,
// and the typing goes on at the caret

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, saveAndReopen, typeKeys } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const PARAGRAPH = '<p>A paragraph with <strong>bold</strong>, <em>italic</em>, <code>code</code>, and \\(x^2\\) inline.</p>';

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
});

test('a sup is raised and a sub is lowered in running text, and the lines around them keep their height', async () => {
  const page = await browser.newPage();
  await page.goto(deckUrl('test-deck.html'));
  await page.waitFor(deckSettled);
  const m = await page.evaluate(`(() => {
    const slide = document.querySelector('.reveal .slides section.present');
    const p = (html) => {
      const el = document.createElement('p');
      el.style.width = '600px';
      el.innerHTML = html;
      slide.append(el);
      return el;
    };
    const plain = p('Deep Space 1 and Orion with water, and more words that make a second line');
    const scripts = p('Deep Space 1<sup>1</sup> and Orion<sup>2,3</sup> with H<sub>2</sub>O, and more words that make a second line');
    const box = (n, a, b) => { const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); return r.getBoundingClientRect(); };
    const [sup] = scripts.querySelectorAll('sup');
    const sub = scripts.querySelector('sub');
    const scale = slide.getBoundingClientRect().width / 1920;
    const one = (r) => ({ top: r.top / scale, bottom: r.bottom / scale });
    return {
      plain: plain.getBoundingClientRect().height / scale,
      scripts: scripts.getBoundingClientRect().height / scale,
      lines: [...new Set([...scripts.getClientRects()].map((r) => r.height))].length,
      before: one(box(sup.previousSibling, sup.previousSibling.length - 1, sup.previousSibling.length)),
      sup: one(sup.getBoundingClientRect()),
      sub: one(sub.getBoundingClientRect()),
      size: parseFloat(getComputedStyle(sup).fontSize) / parseFloat(getComputedStyle(scripts).fontSize),
    };
  })()`);
  // the number is set at 0.7 of the text, with its foot above the foot of the letter before it, and
  // a sub is set with its foot below
  assert.ok(Math.abs(m.size - 0.7) < 0.01, `a sup is set at ${m.size} of the text`);
  assert.ok(m.sup.bottom < m.before.bottom - 8, `the sup ends at ${m.sup.bottom}, not above the letter before it, which ends at ${m.before.bottom}`);
  assert.ok(m.sub.bottom > m.before.bottom + 4, `the sub ends at ${m.sub.bottom}, not below the letters, which end at ${m.before.bottom}`);
  assert.ok(Math.abs(m.scripts - m.plain) < 0.5, `two lines with a sup and a sub are ${m.scripts} px high, and ${m.plain} px without`);
  assert.deepEqual(page.errors, []);
  await page.close();
});

for (const platform of PLATFORMS) {
  test(`a number set with Superscript keeps the space typed after it out of the sup, and the typing goes on at the caret on ${platform}`, async () => {
    const page = await browser.newPage();
    await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate('Reveal.slide(2)');
    // the caret after the word "paragraph", in the middle of the paragraph
    const placed = await page.evaluate(`(() => {
      const p = [...document.querySelectorAll('.reveal section.present > p')].find((e) => e.textContent.startsWith('A paragraph with'));
      if (!p) return false;
      p.closest('[contenteditable="true"]').focus();
      const r = document.createRange();
      r.setStart(p.firstChild, 'A paragraph'.length);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      return true;
    })()`);
    assert.ok(placed, 'the paragraph of the slide is not found');
    const superscript = () => page.evaluate(`Promise.resolve(window.BeesonEditor.exec('text.superscript')).then(() => true)`);
    await superscript();
    await typeKeys(page, '2');
    await page.waitFor(`window.BeesonEditor.render().includes('A paragraph<sup>2</sup> with')`);
    await superscript();
    assert.equal(await page.evaluate(`window.BeesonEditor.state('text.superscript').checked`), false);
    // one key at a time, so that each is typed at the caret that the one before left
    for (const key of [' ', 'a', 'n', 'd']) {
      const before = await page.evaluate('window.BeesonEditor.render().length');
      await typeKeys(page, key);
      await page.waitFor(`window.BeesonEditor.render().length > ${before}`);
    }
    const edits = [[PARAGRAPH, PARAGRAPH.replace('A paragraph with', 'A paragraph<sup>2</sup> and with')]];
    await byteExact(page, edits);
    // the space after the number is drawn as wide as the space after "and", as in the show. a
    // no-break space, which Chrome types at the edge of an element, is half as wide again in Latin
    // Modern Roman, and the file is written with a plain space
    const gaps = await page.evaluate(`(() => {
      const sup = document.querySelector('.reveal section.present > p sup');
      const text = sup.nextSibling;
      const box = (a, b) => { const r = document.createRange(); r.setStart(text, a); r.setEnd(text, b); return r.getBoundingClientRect(); };
      return { data: text.data.slice(0, 9), after: box(0, 1).width, between: box(4, 5).width };
    })()`);
    assert.equal(gaps.data, ' and with', 'the space after the sup is not a plain space');
    assert.ok(Math.abs(gaps.after - gaps.between) < 0.5, `the space after the number is ${gaps.after} px wide, and the space after "and" ${gaps.between} px`);
    await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await byteExact(page, edits);
    const { text } = await saveAndReopen(page, `superscript-${platform}.html`);
    page.source = text;
    await byteExact(page);
    assert.deepEqual(page.errors.filter((e) => !e.includes('/favicon.ico')), []);
    await page.close();
  });
}
