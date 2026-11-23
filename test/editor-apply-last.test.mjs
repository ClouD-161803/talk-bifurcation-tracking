import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { E, applied, applyOn, front, sessionPage, showSlide } from './helpers/apply.mjs';
import { looksFresh } from './helpers/fresh.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const SECTIONS = `document.querySelectorAll('.reveal .slides > section').length`;
const NEW = '<section>\n  <h2>Added at the end</h2>\n  <p>A slide of another person.</p>\n</section>\n';

function beforeEnd(text, bytes) {
  const at = text.indexOf('</div>\n</div>\n<script');
  assert.ok(at > 0 && text.slice(0, at).endsWith('</section>\n\n'), 'the deck ends with a slide and a blank line');
  return text.slice(0, at) + bytes + text.slice(at);
}

function withoutLast(text) {
  const from = text.lastIndexOf('<section class="closing">');
  const to = text.indexOf('</section>\n\n', from) + '</section>\n\n'.length;
  assert.ok(from > 0 && to > from, 'the deck ends with the closing slide');
  return text.slice(0, from) + text.slice(to);
}

for (const deck of ['test-deck.html', 'index.html']) {
  for (const id of ['slide.new', 'slide.duplicate']) {
    test(`${id} on the last slide of ${deck} is applied on another page without a reload`, async (t) => {
      const a = await sessionPage(browser, { deck });
      t.after(() => a.close());
      await front(a);
      await showSlide(a, 'Thank you');
      const count = await a.evaluate(SECTIONS);
      const told = await a.evaluate('window.__changes');
      await a.evaluate(`${E}.exec(${JSON.stringify(id)}).then(() => true)`);
      await a.waitFor(`${SECTIONS} === ${count + 1} && window.__changes > ${told}`);
      const text = await a.evaluate(`${E}.session.text()`);
      assert.ok(text.lastIndexOf('</section>') > text.lastIndexOf('<section class="closing">') + 30, `${id} adds a slide after the closing slide`);
      const b = await sessionPage(browser, { deck });
      t.after(() => b.close());
      // index.html of a talk is the talk, hence a slide that it has is shown there
      await showSlide(b, deck === 'index.html' ? 'Presentation outline' : 'Show your steps');
      assert.equal((await applyOn(b, text)).reload, false, `${id}: the apply asks for a reload`);
      await applied(b, text, id);
      assert.equal(await b.evaluate(SECTIONS), count + 1);
      await looksFresh(t, browser, b, text, id);
      assert.deepEqual(b.errors, []);
    });
  }
}

const BY_HAND = [
  ['a slide put before the end tag of div.slides, with a blank line after it', (text) => beforeEnd(text, `${NEW}\n`)],
  ['a slide put before the end tag of div.slides, without a blank line after it', (text) => beforeEnd(text, NEW)],
  ['the last slide taken off', withoutLast],
];

for (const [label, change] of BY_HAND) {
  test(`${label} is applied without a reload`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    const text = change(b.source);
    assert.equal((await applyOn(b, text)).reload, false, `${label}: the apply asks for a reload`);
    await applied(b, text, label);
    await looksFresh(t, browser, b, text, label);
    assert.deepEqual(b.errors, []);
  });
}
