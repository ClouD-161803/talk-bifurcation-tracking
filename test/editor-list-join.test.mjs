import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { center, click, press, saveAndReopen, type } from './helpers/editor.mjs';

describe('two lists of one kind joined', () => {
  const LISTS = 'test/pages/editor-r13-3.html';
  const TABLES = 'test/pages/editor-tables.html';
  const PLATFORMS = ['mac', 'other'];

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

  const js = (v) => JSON.stringify(v);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const settle = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 100))');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  async function load(t, platform, deck, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    page.platform = platform;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await settle(page);
    return page;
  }

  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r15-11-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    return edited;
  }

  const find = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;
  const ITEM = '.reveal section.present ol > li, .reveal section.present ul > li';

  const caretIn = (page, needle, end = true) => page.evaluate(`(() => {
  const li = ${find(ITEM, needle)};
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) texts.push(n);
  li.closest('[contenteditable="true"]').focus();
  const n = ${end} ? texts.at(-1) : texts[0];
  getSelection().collapse(n, ${end} ? n.length : 0);
})()`);

  const lists = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present > :is(ul, ol)')].map((l) => l.localName + (l.start > 1 ? ':' + l.start : '') + ' ' + [...l.children].filter((c) => c.localName === 'li').map((li) => li.textContent.trim().split(' ')[0]).join(','))`);

  async function clip(page, command) {
    const [key, code, kc] = command === 'cut' ? ['x', 'KeyX', 88] : ['c', 'KeyC', 67];
    const modifiers = page.platform === 'mac' ? 4 : 2;
    await page.evaluate(`(() => { window.__w = []; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (t, v) { window.__w.push([t, v]); return o.call(this, t, v); }; })()`);
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: kc, modifiers, commands: [command] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, modifiers });
    await settle(page);
    const w = await page.evaluate('window.__w');
    return { plain: w.find((x) => x[0] === 'text/plain')?.[1] ?? '', html: w.find((x) => x[0] === 'text/html')?.[1] ?? '' };
  }

  async function selectParagraph(page) {
    await press(page, 'Escape');
    await settle(page);
    assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['p'], 'the paragraph is not selected');
  }

  const listPart = (text) => {
    const at = text.indexOf('<h2>Show your steps one at a time');
    return text.slice(text.indexOf('<ul>', at), text.indexOf('<div class="backdrop"', at));
  };

  async function cutDemoList(page) {
    await caretIn(page, 'Two elements with the same');
    await press(page, 'Enter');
    await press(page, 'Enter');
    await settle(page);
    assert.deepEqual(await lists(page), ['ul Each,Two', 'ul When']);
  }

  for (const platform of PLATFORMS) {
    test(`two dash lists are joined after Delete of the paragraph between them, and after Backspace in an empty one (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await cutDemoList(page);
      const empty = await render(page);
      await press(page, 'Backspace');
      await settle(page);
      assert.equal(await render(page), page.source, `Backspace does not give the one list back: ${listPart(await render(page))}`);
      assert.deepEqual(await lists(page), ['ul Each,Two,When']);
      assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
      await roundTrip(page, empty);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), page.source);
      await caretIn(page, 'Two elements with the same');
      await press(page, 'Enter');
      await press(page, 'Enter');
      await type(page, 'Between');
      await settle(page);
      const between = await render(page);
      assert.match(listPart(between), /together\.<\/li>\n {2}<\/ul>\n {2}<p>Between<\/p>\n {2}<ul>/);
      await selectParagraph(page);
      await press(page, 'Delete');
      await settle(page);
      assert.equal(await render(page), page.source, `Delete does not give the one list back: ${listPart(await render(page))}`);
      assert.deepEqual(await lists(page), ['ul Each,Two,When']);
      assert.equal(await undoLabel(page), 'Undo Delete');
      await roundTrip(page, between);
    });

    test(`two numbered lists are joined after Cut of the paragraph between them, with the count continued and the start of the second dropped (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await caretIn(page, 'Seventh', false);
      await press(page, 'Backspace');
      await settle(page);
      const parted = await render(page);
      assert.ok(parted.includes('<li>Echo</li>\n  </ol>\n  <p>Seventh</p>\n  <ol start="7">\n    <li>Eighth</li>\n  </ol>'), parted);
      await selectParagraph(page);
      await clip(page, 'cut');
      await settle(page);
      const joined = await render(page);
      assert.ok(joined.includes('<li>Echo</li>\n    <li>Eighth</li>\n  </ol>\n</section>'), `the lists are not joined: ${joined.slice(joined.indexOf('<li>Echo'), joined.indexOf('</section>') + 10)}`);
      assert.ok(!joined.includes('start='), 'the start of the second list is kept');
      assert.deepEqual(await lists(page), ['ol Alpha,Bravo,Charlie,Delta,Echo,Eighth']);
      assert.equal(await undoLabel(page), 'Undo Cut');
      await roundTrip(page, parted);
    });

    test(`a dash list and a numbered list are left apart after Delete of the paragraph between them (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await cutDemoList(page);
      await type(page, 'Between');
      await caretIn(page, 'When exporting');
      await exec(page, 'text.list.ol');
      await settle(page);
      assert.deepEqual(await lists(page), ['ul Each,Two', 'ol When']);
      const numbered = await render(page);
      await page.evaluate(`(() => { const p = ${find('.reveal section.present > p', 'Between')}; p.focus(); getSelection().collapse(p.firstChild, 3); })()`);
      await selectParagraph(page);
      await press(page, 'Delete');
      await settle(page);
      assert.deepEqual(await lists(page), ['ul Each,Two', 'ol When']);
      assert.match(listPart(await render(page)), /together\.<\/li>\n {2}<\/ul>\n {2}<ol>\n {4}<li class="fragment" data-fragment-index="3">When/);
      await roundTrip(page, numbered);
    });
  }

  const at = (page, r, c) => page.evaluate(`(() => { const t = Reveal.getCurrentSlide().querySelector('table'); const b = t.rows[${r}].cells[${c}].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);

  async function range(page, a, b) {
    await click(page, await at(page, ...a));
    await settle(page);
    await click(page, await at(page, ...b), { modifiers: 'Shift' });
    await settle(page);
    assert.ok(await page.evaluate(`(() => { const o = document.querySelector('.beeson-table-bars .cell.range'); return !!o && !o.hidden; })()`), 'the range is not selected');
  }

  async function paste(page, plain, html) {
    const done = await page.evaluate(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${js(plain)}); dt.setData('text/html', ${js(html)}); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(ev); return ev.defaultPrevented; })()`);
    assert.ok(done, 'the paste is not taken by the editor');
    await settle(page);
  }

  for (const platform of PLATFORMS) {
    test(`a range with a bold word and a formula pasted onto a slide is a new table with the bold and the formula (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, 1);
      const europa = await at(page, 2, 0);
      await click(page, europa);
      await settle(page);
      await click(page, europa, { count: 2 });
      await settle(page);
      await press(page, 'Mod+B');
      await settle(page);
      await press(page, 'Escape');
      await settle(page);
      const bold = await render(page);
      assert.ok(bold.includes('<tr><td><strong>Europa</strong></td><td>2.53e-5</td><td>Jupiter</td></tr>'));
      await range(page, [1, 0], [2, 1]);
      const { plain, html } = await clip(page, 'copy');
      assert.ok(html.includes('<td><strong>Europa</strong></td>') && html.includes('<td>\\(0.01215\\)</td>'), html);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await page.evaluate('Reveal.slide(0)');
      await settle(page);
      await page.evaluate('document.activeElement?.blur()');
      await paste(page, plain, html);
      const pasted = await render(page);
      const right = '<td style="text-align: right">';
      const table = `<tbody>\n      <tr><td>Moon</td><td style="text-align: right">\\(0.01215\\)</td></tr>\n      <tr><td><strong>Europa</strong></td>${right}2.53e-5</td></tr>\n    </tbody>\n  </table>`;
      assert.ok(pasted.includes(table), `the new table is not written with its bold and its formula:\n${pasted.slice(pasted.indexOf('</table>') + 8, pasted.indexOf('A plain table'))}`);
      assert.equal(await undoLabel(page), 'Undo Paste');
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table')[1].querySelectorAll('strong').length`), 1);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table')[1].querySelectorAll('mjx-container').length`), 1);
      await roundTrip(page, bold);
    });
  }
});

describe('a hand-numbered start kept and Backspace undo', () => {
  const PLATFORMS = ['mac', 'other'];
  const LISTS = 'test/pages/editor-r13-3.html';
  const DECK = 'test/pages/editor-r16-4.html';

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

  const js = (v) => JSON.stringify(v);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  async function load(t, platform, deck, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r16-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    return edited;
  }

  async function undoAll(page) {
    for (let n = 0; n < 20 && (await state(page)).enabled; n++) await undo(page);
    assert.equal(await render(page), page.source, 'the undo of every entry does not give the file back byte for byte');
  }
  const state = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')`);

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  const caretIn = (page, needle, all = false) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  if (${all}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, n.length);
})()`);

  const caretInEmpty = (page) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => !p.textContent.trim());
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p, 0);
})()`);

  const starts = (page) => page.evaluate(`[...document.querySelectorAll('${SLIDE} > ol')].map((ol) => ol.start)`);

  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

  async function typedAt(page, base, where, ch) {
    await key(page, ch);
    const text = await render(page);
    const at = base.indexOf(where.replace('|', ''));
    assert.ok(at >= 0, `${where} is not in the file`);
    const i = at + where.indexOf('|');
    let d = 0;
    while (d < text.length && text[d] === base[d]) d++;
    const got = text.length === base.length ? 'nowhere' : js(text.slice(Math.max(0, d - 30), d + 30));
    assert.ok(text === base.slice(0, i) + ch + base.slice(i), `the key ${ch} is not typed at ${js(where)} but ${got}`);
  }

  const SEVENTH = '<ol start="7">\n    <li>Seventh</li>\n    <li>Eighth</li>\n  </ol>';

  for (const platform of PLATFORMS) {
    const ROUTES = {
      'made a paragraph': { act: async (page) => { await caretIn(page, 'Seventh'); await exec(page, 'text.list.none'); } },
      'emptied and taken off by Return': {
        prep: async (page) => { await caretIn(page, 'Seventh', true); await press(page, 'Backspace'); },
        act: (page) => press(page, 'Enter'),
      },
    };
    for (const [route, { prep, act }] of Object.entries(ROUTES)) {
      test(`a list numbered by hand keeps its start after its first item is ${route} (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        assert.ok(page.source.includes(SEVENTH));
        if (prep) await prep(page);
        await wait(page);
        const base = await render(page);
        await act(page);
        await wait(page);
        const text = await render(page);
        assert.ok(/<\/ol>\n {2}<p>(Seventh)?<\/p>\n {2}<ol start="7">\n {4}<li>Eighth<\/li>/.test(text), `the list of Eighth does not keep start="7": ${js(text.slice(text.indexOf('<li>Echo'), text.indexOf('</section>')))}`);
        assert.deepEqual(await starts(page), [1, 7]);
        await caretIn(page, 'Alpha');
        await press(page, 'Enter');
        await wait(page);
        assert.deepEqual(await starts(page), [1, 7], 'a new item of the list before renumbers the list of Eighth');
        await undo(page);
        assert.equal(await render(page), text);
        await undo(page);
        assert.equal(await render(page), base);
        if (prep) {
          await undoAll(page);
          await redo(page);
          assert.equal(await render(page), base);
        }
        await redo(page);
        await roundTrip(page, base);
      });
    }
  }

  for (const platform of PLATFORMS) {
    const CASES = [
      [0, '<p>|</p>\n  <ol start="2">', '<li>Pone|</li>', ['  </ol>\n  <p></p>\n  <ol start="2">\n', '']],
      [1, '</ul>\n  <p>|</p>', '<li>Btwo|</li>', ['</ul>\n  <p></p>\n', '</ul>\n']],
    ];
    for (const [slide, empty, last, [from, to]] of CASES) {
      test(`after an undo of Backspace in an empty paragraph after a list on slide ${slide}, the caret is in the paragraph, and after the redo at the end of the list (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, slide);
        await caretInEmpty(page);
        await press(page, 'Backspace');
        await wait(page);
        const dropped = await render(page);
        assert.equal(dropped, page.source.replace(from, to), 'Backspace does not take the paragraph off');
        assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), page.source);
        await typedAt(page, page.source, empty, 'Y');
        await undo(page);
        assert.equal(await render(page), page.source);
        await caretInEmpty(page);
        await press(page, 'Backspace');
        await wait(page);
        await press(page, 'Mod+Z');
        await wait(page);
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), dropped);
        await typedAt(page, dropped, last, 'q');
        await undo(page);
        assert.equal(await render(page), dropped);
        await undoAll(page);
        assert.deepEqual(page.errors, []);
      });
    }
  }

  for (const platform of PLATFORMS) {
    for (const [needle, what] of [['Echo', 'ends the list'], ['Bravo', 'cuts the list']]) {
      test(`after an undo of Return on an empty item that ${what}, the caret is in the item, and after the redo in the new paragraph (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        await caretIn(page, needle);
        await press(page, 'Enter');
        await wait(page);
        const item = await render(page);
        await press(page, 'Enter');
        await wait(page);
        const ended = await render(page);
        assert.ok(ended.includes(`<li>${needle}</li>\n  </ol>\n  <p></p>`), `Return does not take the empty item off: ${ended.slice(ended.indexOf('<li>Alpha'), ended.indexOf('</section>'))}`);
        assert.equal(await undoLabel(page), 'Undo New Paragraph');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), item);
        await typedAt(page, item, `<li>${needle}</li>\n    <li>|</li>`, 'q');
        await undo(page);
        assert.equal(await render(page), item);
        await page.evaluate(`(() => { const li = ${find(needle)}.nextElementSibling; li.closest('[contenteditable="true"]').focus(); getSelection().collapse(li, 0); })()`);
        await press(page, 'Enter');
        await wait(page);
        assert.equal(await render(page), ended);
        await press(page, 'Mod+Z');
        await wait(page);
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), ended);
        await typedAt(page, ended, `<li>${needle}</li>\n  </ol>\n  <p>|</p>`, 'q');
        await undo(page);
        assert.equal(await render(page), ended);
        await undoAll(page);
        assert.deepEqual(page.errors, []);
      });
    }
  }

  for (const platform of PLATFORMS) {
    for (const k of ['Delete', 'Backspace']) {
      test(`${k} of the paragraph between two locked lists leaves both lists as they are (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, 2);
        await page.evaluate(`(() => { const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.includes('Middle')); p.closest('[contenteditable="true"]').focus(); getSelection().collapse(p.firstChild, 3); })()`);
        await press(page, 'Escape');
        await wait(page);
        assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['p']);
        await press(page, k);
        await wait(page);
        const text = await render(page);
        const part = text.slice(text.indexOf('<h2>Locked'), text.indexOf('</section>', text.indexOf('<h2>Locked')));
        assert.equal(text, page.source.replace('  <p>Middle three</p>\n', ''), `the locked lists are changed: ${js(part)}`);
        await roundTrip(page, page.source);
      });
    }

    test(`Delete of a figure of the zone between two lists in the file leaves both lists as they are (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 3);
      await click(page, await center(page, `${SLIDE} figure.figure-box img`));
      await wait(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['figure']);
      await press(page, 'Delete');
      await wait(page);
      const text = await render(page);
      const figure = page.source.slice(page.source.indexOf('  <figure class="figure-box">'), page.source.indexOf('</figure>') + 10);
      const part = text.slice(text.indexOf('<h2>A figure'), text.indexOf('</section>', text.indexOf('<h2>A figure')));
      assert.equal(text, page.source.replace(figure, ''), `the lists are changed: ${js(part)}`);
      assert.equal(await page.evaluate(`document.querySelectorAll('${SLIDE} > ul').length`), 2);
      await roundTrip(page, page.source);
    });
  }
});

describe('Backspace by a locked list, and List None', () => {
  const PLATFORMS = ['mac', 'other'];
  const LOCKED = 'test/pages/editor-r16-4.html';
  const DECK = 'test/pages/editor-r18-2.html';

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

  const js = (v) => JSON.stringify(v);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  async function load(t, platform, deck, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r18-2-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    return edited;
  }

  async function undoAll(page) {
    for (let n = 0; n < 20 && (await state(page)).enabled; n++) await undo(page);
    assert.equal(await render(page), page.source, 'the undo of every entry does not give the file back byte for byte');
  }
  const state = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')`);

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].findLast((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  const caretIn = (page, needle, all = false) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  if (${all}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, n.length);
})()`);

  const caretInEmpty = (page) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => !p.textContent.trim());
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p, 0);
})()`);

  const caretInEmptyItem = (page) => page.evaluate(`(() => {
  const li = [...document.querySelectorAll('${SLIDE} li')].find((li) => !li.textContent.trim());
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(li, 0);
})()`);

  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

  async function typedAt(page, base, where, ch) {
    await key(page, ch);
    const text = await render(page);
    const at = base.indexOf(where.replace('|', ''));
    assert.ok(at >= 0, `${where} is not in the file`);
    const i = at + where.indexOf('|');
    let d = 0;
    while (d < text.length && text[d] === base[d]) d++;
    const got = text.length === base.length ? 'nowhere' : js(text.slice(Math.max(0, d - 30), d + 30));
    assert.ok(text === base.slice(0, i) + ch + base.slice(i), `the key ${ch} is not typed at ${js(where)} but ${got}`);
  }

  for (const platform of PLATFORMS) {
    test(`Backspace in an empty paragraph after a locked list leaves the paragraph and its caret in place (${platform})`, async (t) => {
      const page = await load(t, platform, LOCKED, 2);
      await page.evaluate(`(() => { const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.includes('Middle')); p.closest('[contenteditable="true"]').focus(); getSelection().selectAllChildren(p); })()`);
      await press(page, 'Backspace');
      await wait(page, 1200);
      const emptied = await render(page);
      assert.match(emptied, /<\/ul>\n {2}<p>(<br>)?<\/p>\n {2}<ul data-locked>/);
      await caretInEmpty(page);
      await press(page, 'Backspace');
      await wait(page);
      assert.equal(await render(page), emptied, 'Backspace changes the file');
      await key(page, 'q');
      const text = await render(page);
      assert.match(text, /<\/ul>\n {2}<p>q(<br>)?<\/p>\n {2}<ul data-locked>/, `the key q is not typed into the paragraph: ${js(text.slice(text.indexOf('<h2>Locked'), text.indexOf('</section>', text.indexOf('<h2>Locked'))))}`);
      await undoAll(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a forward Delete in an empty paragraph before a locked list leaves the paragraph and its caret in place (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 2);
      await caretInEmpty(page);
      await press(page, 'Delete');
      await wait(page);
      assert.equal(await render(page), page.source, 'Delete changes the file');
      await typedAt(page, page.source, '<p>|</p>', 'q');
      await undoAll(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`after an undo and a redo of Return on an empty nested item, a typed key is written in the empty item (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 0);
      await caretIn(page, 'Nsub');
      await press(page, 'Enter');
      await wait(page);
      const one = await render(page);
      assert.equal((one.match(/<li><\/li>/g) ?? []).length, 1, `Return does not add an empty nested item: ${js(one.slice(one.indexOf('<h2>A nested'), one.indexOf('</section>')))}`);
      await press(page, 'Enter');
      await wait(page);
      const two = await render(page);
      assert.notEqual(two, one, 'Return does not move the empty item out');
      assert.equal(await undoLabel(page), 'Undo New Paragraph');
      await press(page, 'Mod+Z');
      await wait(page);
      assert.equal(await render(page), one);
      await typedAt(page, one, '<li>|</li>', 'q');
      await undo(page);
      assert.equal(await render(page), one);
      await caretInEmptyItem(page);
      await press(page, 'Enter');
      await wait(page);
      assert.equal(await render(page), two);
      await press(page, 'Mod+Z');
      await wait(page);
      await press(page, 'Mod+Shift+Z');
      await wait(page);
      assert.equal(await render(page), two);
      await typedAt(page, two, '<li>|</li>', 'q');
      await undo(page);
      assert.equal(await render(page), two);
      await undoAll(page);
      assert.deepEqual(page.errors, []);
    });

    test(`List None on a middle item of a list with an id leaves the id on the first list alone (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 1);
      await caretIn(page, 'Itwo');
      await exec(page, 'text.list.none');
      await wait(page);
      const text = await render(page);
      const part = text.slice(text.indexOf('<ol id="plan"'), text.indexOf('</section>', text.indexOf('<ol id="plan"')));
      assert.equal(part, '<ol id="plan" data-id="plan">\n    <li>Ione</li>\n  </ol>\n  <p>Itwo</p>\n  <ol data-id="plan" start="2">\n    <li>Ithree</li>\n  </ol>\n', `the id is written twice: ${js(part)}`);
      assert.equal(await page.evaluate(`document.querySelectorAll('#plan').length`), 1);
      await roundTrip(page, page.source);
    });
  }
});

describe('blank-line pastes and Delete between lists', () => {
  const PLATFORMS = ['mac', 'other'];
  const LISTS = 'test/pages/editor-r13-3.html';

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

  const js = (v) => JSON.stringify(v);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);

  async function load(t, platform, deck, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  const caretIn = (page, needle, at = null) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].filter((c) => c.nodeType === 3 && c.data.trim()).at(${at === null ? -1 : 0});
  li.closest('[contenteditable="true"]').focus();
  if (${at === true}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, ${at === null ? 'n.length' : Number(at)});
})()`);

  const caretInParagraph = (page, text) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.trim() === ${js(text)});
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p.firstChild ?? p, 0);
})()`);

  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

  async function typedAt(page, base, where, ch) {
    await key(page, ch);
    const text = await render(page);
    const at = base.indexOf(where.replace('|', ''));
    assert.ok(at >= 0, `${where} is not in the file`);
    const i = at + where.indexOf('|');
    let d = 0;
    while (d < text.length && text[d] === base[d]) d++;
    const got = text.length === base.length ? 'nowhere' : js(text.slice(Math.max(0, d - 30), d + 30));
    assert.ok(text === base.slice(0, i) + ch + base.slice(i), `the key ${ch} is not typed at ${js(where)} but ${got}`);
  }

  const SAME = 'Two elements with the same index are shown together.';
  async function undo1(page) { await press(page, 'Mod+Z'); await wait(page); }
  async function redo1(page) { await press(page, 'Mod+Shift+Z'); await wait(page); }

  const selectText = (page, needle, from, to) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  getSelection().setBaseAndExtent(n, ${from}, n, ${to});
})()`);

  for (const platform of PLATFORMS) {
    const PASTES = [
      ['\nAone\nBtwo', 1, 3, '<li>B</li>\n    <li>Aone</li>\n    <li>Btwovo</li>'],
      ['\nAone', 3, 5, '<li>Bra</li>\n    <li>Aone</li>'],
    ];
    for (const [text, from, to, items] of PASTES) {
      test(`a paste of ${js(text)} over a selected text after other text of an item is undone byte for byte (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        await selectText(page, 'Bravo', from, to);
        await exec(page, 'edit.paste', text);
        await wait(page);
        assert.equal(await render(page), page.source.replace('<li>Bravo</li>', items));
        assert.equal(await undoLabel(page), 'Undo Paste');
        await undo(page);
        assert.equal(await render(page), page.source, 'one undo does not give the file back byte for byte');
        await redo(page);
        assert.equal(await render(page), page.source.replace('<li>Bravo</li>', items));
        assert.deepEqual(page.errors, []);
      });
    }

    test(`Return over a selected text of an item is undone byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await selectText(page, 'Bravo', 1, 3);
      await press(page, 'Enter');
      await wait(page);
      assert.equal(await render(page), page.source.replace('<li>Bravo</li>', '<li>B</li>\n    <li>vo</li>'));
      await undo1(page);
      assert.equal(await render(page), page.source, 'one undo does not give the file back byte for byte');
      await redo1(page);
      assert.equal(await render(page), page.source.replace('<li>Bravo</li>', '<li>B</li>\n    <li>vo</li>'));
      await typedAt(page, await render(page), '<li>|vo</li>', 'w');
      assert.deepEqual(page.errors, []);
    });
  }

  const WHEN = '<li class="fragment" data-fragment-index="3">|When';

  async function emptyBetween(page, deck) {
    if (deck === 'test-deck.html') {
      await caretIn(page, SAME);
      await press(page, 'Enter');
      await press(page, 'Enter');
    } else await caretInParagraph(page, '');
    await wait(page);
  }

  for (const platform of PLATFORMS) {
    for (const [deck, slide, where] of [['test-deck.html', 2, WHEN], ['test/pages/editor-r16-4.html', 0, '<li>|Qtwo</li>']]) {
      test(`after a forward Delete in the empty paragraph between two lists of ${deck}, a key is typed at the start of the first item of the second list (${platform})`, async (t) => {
        const page = await load(t, platform, deck, slide);
        await emptyBetween(page, deck);
        await press(page, 'Delete');
        await wait(page);
        assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
        await typedAt(page, await render(page), where, 'w');
      });
    }

    for (const away of [false, true]) {
      test(`after a redo of a forward Delete between two lists${away ? ' with the caret in the heading' : ''}, a key is typed at the start of the first item of the second list (${platform})`, async (t) => {
        const page = await load(t, platform, 'test-deck.html', 2);
        await emptyBetween(page, 'test-deck.html');
        await press(page, 'Delete');
        await wait(page);
        const joined = await render(page);
        await undo1(page);
        if (away) {
          const at = await page.evaluate(`(() => { const r = document.querySelector('${SLIDE} h2').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
          await click(page, at);
          await click(page, at);
          await wait(page);
          assert.ok(await page.evaluate(`!!document.activeElement?.matches('${SLIDE} h2')`), 'the caret is not in the heading');
        }
        await redo1(page);
        assert.equal(await render(page), joined);
        await typedAt(page, joined, WHEN, 'w');
      });
    }
  }
});
