// tests of R20.4 on both platforms with trusted input: the bullet kinds of a list, i.e. the chevron
// of a ul, the ring of a ul.dots, and the dash of a ul.dashes, drawn by the theme in the show and
// in the print view, and written by Dots and Dashes of Format > Text and of the Text pane. after
// each edit of the file the text is checked byte for byte after an undo, the edit again after a
// redo, and after a save and an open

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { editProblems, themeClasses } from '../src/editor/model/scope.ts';
import { click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-r20-4.html';
const PLATFORMS = ['mac', 'other'];
const KINDS = 0;
const NESTED = 1;
const APART = 2;
const DASHES = 3;

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
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const settle = async (page) => {
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 120))');
  await frames(page);
};
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
let saves = 0;

// the editor on slide n of the deck, served over HTTP, with the storage of the origin emptied
async function load(t, platform, n) {
  const page = await browser.newPage({ width: 1600, height: 1000 });
  t.after(() => page.close().catch(() => {}));
  page.platform = platform;
  const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
  await page.goto(url);
  await page.evaluate('localStorage.clear()');
  await page.goto(url);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(DECK, 'utf8');
  const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
  assert.deepEqual(s.problems, []);
  await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  return page;
}

// the edit checked against base after an undo, again after a redo, and after a save and an open,
// whose text becomes page.source
async function roundTrip(page, base = page.source) {
  const edited = await render(page);
  assert.notEqual(edited, base, 'the action does not change the file');
  await undo(page);
  assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
  await redo(page);
  assert.equal(await render(page), edited, 'the redo does not write the edit again');
  const { text } = await saveAndReopen(page, `r20-4-${++saves}.html`);
  assert.equal(text, edited);
  assert.deepEqual(errors(page), []);
  page.source = text;
  return edited;
}

// the shown element of selector with a text node of its own that holds needle, as an expression
const find = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && [...el.childNodes].some((n) => n.nodeType === 3 && n.data.includes(${js(needle)})))`;
const TEXT = '.reveal section.present li, .reveal section.present p';

// the caret put after needle in the item or paragraph that holds it
async function caretIn(page, needle) {
  await page.evaluate(`(() => {
    const el = ${find(TEXT, needle)};
    const n = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${js(needle)}));
    el.closest('[contenteditable="true"]').focus();
    getSelection().collapse(n, n.data.indexOf(${js(needle)}) + ${js(needle)}.length);
  })()`);
  await settle(page);
}

// the client point of the middle of the text needle
const pointOf = (page, needle) => page.evaluate(`(() => {
  const el = ${find(TEXT, needle)};
  const n = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${js(needle)}));
  const r = document.createRange();
  r.setStart(n, n.data.indexOf(${js(needle)}));
  r.setEnd(n, n.data.indexOf(${js(needle)}) + ${js(needle)}.length);
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`);

// the box and the look of the ::before of each item of selector, in px, and whether its
// background is the color of --accent, read from a probe in the first slide
const marks = (page, selector) => page.evaluate(`(() => {
  const probe = document.createElement('div');
  probe.style.background = 'var(--accent)';
  document.querySelector('.reveal .slides section').append(probe);
  const accent = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return [...document.querySelectorAll(${js(selector)})].map((li) => {
    const s = getComputedStyle(li, '::before');
    const px = (v) => Math.round(parseFloat(v) * 100) / 100;
    return {
      text: [...li.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('').trim(),
      width: px(s.width), height: px(s.height), left: px(s.left), middle: px(parseFloat(s.top) + parseFloat(s.height) / 2),
      round: s.borderRadius, clip: s.clipPath, mask: s.maskImage || s.webkitMaskImage || 'none', content: s.content,
      accent: s.backgroundColor === accent, pad: getComputedStyle(li).paddingLeft,
      hollow: s.backgroundColor === 'rgba(0, 0, 0, 0)', ring: px(s.borderTopWidth), ringAccent: s.borderTopColor === accent,
      points: s.clipPath.split(',').length,
    };
  });
})()`);

// checkMarks tests the marks of the items Alpha, Dot one, Dash one, and Inner arrow of the first
// slide: a chevron, a hollow ring, a dash, and a chevron, each in --accent and centered on the
// middle of the dash, with the text of each item at 54 px
function checkMarks(all) {
  const by = Object.fromEntries(all.map((m) => [m.text, m]));
  const arrow = by.Alpha;
  assert.match(arrow.clip, /^polygon\(/, `the chevron is not a polygon: ${js(arrow)}`);
  assert.equal(arrow.points, 6, `the chevron does not have six points: ${js(arrow)}`);
  assert.ok(arrow.width > 0 && arrow.height > 0 && arrow.left + arrow.width <= 28, `the chevron is not inside the place of the dash: ${js(arrow)}`);
  const dot = by['Dot one'];
  assert.ok(dot.width === dot.height && dot.width >= 8 && dot.width <= 16 && dot.round === '50%' && dot.clip === 'none', `the dot is not round: ${js(dot)}`);
  assert.ok(dot.hollow && dot.ringAccent && dot.ring >= 2 && dot.ring <= 3, `the dot is not a hollow ring in --accent: ${js(dot)}`);
  const dash = by['Dash one'];
  assert.deepEqual([dash.width, dash.height, dash.clip, dash.round], [28, 2, 'none', '0px'], `the dash changed: ${js(dash)}`);
  const inner = by['Inner arrow'];
  assert.match(inner.clip, /^polygon\(/, `a plain list in a dash list does not keep the chevron: ${js(inner)}`);
  for (const m of [arrow, dot, dash, inner]) {
    assert.equal(m.content, '""', `the mark of ${m.text} is a glyph`);
    assert.equal(m.mask, 'none', `the mark of ${m.text} has a mask`);
    assert.ok(m === dot ? m.ringAccent : m.accent, `the mark of ${m.text} is not in --accent`);
    assert.equal(m.pad, '54px', `the text of ${m.text} moved`);
  }
  for (const m of [arrow, dot]) assert.ok(Math.abs(m.middle - dash.middle) < 0.75, `the mark of ${m.text} is not centered on the dash: ${m.middle} and ${dash.middle}`);
}

test('the theme draws a chevron, a ring, and a dash in --accent in both modes, in the show and in the print view', async (t) => {
  const page = await browser.newPage({ width: 1600, height: 1000 });
  t.after(() => page.close().catch(() => {}));
  for (const [query, items] of [['still', '.reveal .slides section li'], ['print-pdf&still', '.pdf-page li']]) {
    if (query === 'still') {
      await page.goto(deckUrl(DECK, query));
      await page.waitFor(deckSettled);
    } else await printView(page, deckUrl(DECK, query));
    for (const mode of ['dark', 'light']) {
      await page.evaluate(`document.documentElement.dataset.theme = ${js(mode)}; true`);
      await frames(page);
      checkMarks((await marks(page, items)).slice(0, 6));
    }
  }
});

test('dots and dashes are classes of the theme in the scope rule', () => {
  const theme = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  for (const c of ['dots', 'dashes']) assert.ok(theme.has(c), c);
  assert.deepEqual(editProblems('ul', [], { classes: { dots: true } }, theme), []);
  assert.deepEqual(editProblems('ul', [], { classes: { dashes: true } }, theme), []);
});

const LIST_IDS = ['text.list.none', 'text.list.ul', 'text.list.dots', 'text.list.dashes', 'text.list.ol'];
const checked = async (page) => {
  const out = [];
  for (const id of LIST_IDS) if ((await state(page, id)).checked) out.push(id.slice(10));
  return out;
};

for (const platform of PLATFORMS) {
  test(`Dashes and Dots set the kind of the list of the caret on its start tag alone, as one entry List Style (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    await caretIn(page, 'Bravo');
    assert.deepEqual(await checked(page), ['ul']);
    await exec(page, 'text.list.dashes');
    await settle(page);
    assert.equal(await render(page), page.source.replace('<ul>\n    <li>Alpha', '<ul class="dashes">\n    <li>Alpha'));
    assert.equal(await undoLabel(page), 'Undo List Style');
    assert.deepEqual(await checked(page), ['dashes'], 'Arrows is checked on a dash list');
    assert.equal(await page.evaluate('getSelection().anchorNode.parentElement.textContent'), 'Bravo', 'the caret left the item');
    await roundTrip(page);
    await caretIn(page, 'Bravo');
    await exec(page, 'text.list.dots');
    await settle(page);
    assert.ok((await render(page)).includes('<ul class="dots">\n    <li>Alpha'));
    assert.deepEqual(await checked(page), ['dots']);
    await roundTrip(page);
  });

  test(`Dots makes a paragraph a dot list of one item, and Dashes retags a numbered list without its start (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    await caretIn(page, 'A lone paragraph');
    assert.deepEqual(await checked(page), ['none']);
    await exec(page, 'text.list.dots');
    await settle(page);
    assert.equal(await render(page), page.source.replace('<p>A lone paragraph</p>', '<ul class="dots">\n    <li>A lone paragraph</li>\n  </ul>'));
    assert.equal(await undoLabel(page), 'Undo List Style');
    await roundTrip(page);
    await caretIn(page, 'Four');
    await exec(page, 'text.list.dashes');
    await settle(page);
    assert.equal(await render(page), page.source.replace('<ol start="4">\n    <li>Four</li>\n  </ol>', '<ul class="dashes">\n    <li>Four</li>\n  </ul>'));
    await roundTrip(page);
  });

  test(`Numbers on a dash list takes the class off, and Arrows takes the class attribute off (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    const list = '<ul class="dashes">\n    <li>Dash one\n      <ul>\n        <li>Inner arrow</li>\n      </ul>\n    </li>\n    <li>Dash two</li>\n  </ul>';
    assert.ok(page.source.includes(list));
    await caretIn(page, 'Dash two');
    assert.deepEqual(await checked(page), ['dashes']);
    await exec(page, 'text.list.ol');
    await settle(page);
    assert.equal(await render(page), page.source.replace(list, list.replace('<ul class="dashes">', '<ol>').replace(/<\/ul>$/, '</ol>')));
    await roundTrip(page);
    await undo(page);
    await caretIn(page, 'Dash two');
    await exec(page, 'text.list.ul');
    await settle(page);
    assert.equal(await render(page), readFileSync(DECK, 'utf8').replace(list, list.replace('<ul class="dashes">', '<ul>')));
    assert.deepEqual(await checked(page), ['ul']);
  });

  test(`Dots with the caret at the second level changes only the nested list (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    await caretIn(page, 'Inner arrow');
    assert.deepEqual(await checked(page), ['ul']);
    await exec(page, 'text.list.dots');
    await settle(page);
    assert.equal(await render(page), page.source.replace('<ul>\n        <li>Inner arrow', '<ul class="dots">\n        <li>Inner arrow'));
    assert.deepEqual(await checked(page), ['dots']);
    await roundTrip(page);
  });

  test(`Tab in a dash list writes a nested dash list, and Shift+Tab with followers keeps the class on their list (${platform})`, async (t) => {
    const page = await load(t, platform, DASHES);
    const part = (text) => text.slice(text.indexOf('<li>One'), text.indexOf('</section>', text.indexOf('<li>One')));
    await caretIn(page, 'Two');
    await press(page, 'Tab');
    await settle(page);
    const one = await render(page);
    assert.match(part(one), /^<li>One\s*<ul class="dashes">\s*<li>Two<\/li>\s*<\/ul>\s*<\/li>/, `Tab does not write a nested dash list: ${part(one)}`);
    await roundTrip(page);
    await caretIn(page, 'Three');
    await press(page, 'Tab');
    await settle(page);
    const both = await render(page);
    assert.match(part(both), /^<li>One\s*<ul class="dashes">\s*<li>Two<\/li>\s*<li>Three<\/li>\s*<\/ul>\s*<\/li>/, `Tab does not join the nested list: ${part(both)}`);
    await roundTrip(page);
    // Shift+Tab on Two, whose follower Three goes into a list at the end of Two
    await caretIn(page, 'Two');
    await press(page, 'Shift+Tab');
    await settle(page);
    const out = await render(page);
    assert.match(part(out), /<\/li>\s*<li>Two\s*<ul class="dashes">\s*<li>Three<\/li>\s*<\/ul>\s*<\/li>/, `the followers lost the kind: ${part(out)}`);
    await roundTrip(page);
  });

  test(`Dashes on a list selected as an object sets its nested plain lists and keeps a nested numbered list (${platform})`, async (t) => {
    const page = await load(t, platform, NESTED);
    await clickText(page, await pointOf(page, 'Top two'));
    await press(page, 'Escape');
    await settle(page);
    assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['ul']);
    await exec(page, 'text.list.dashes');
    await settle(page);
    const want = page.source
      .replace('<ul>\n    <li>Top one', '<ul class="dashes">\n    <li>Top one')
      .replace('<ul>\n        <li>Sub arrow', '<ul class="dashes">\n        <li>Sub arrow');
    assert.equal(await render(page), want);
    assert.equal(await undoLabel(page), 'Undo List Style');
    assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName + "." + el.className)'), ['ul.dashes'], 'the list is not selected again');
    assert.equal((await state(page, 'text.list.dashes')).checked, true);
    await roundTrip(page);
    // Arrows takes the class off at both levels
    await clickText(page, await pointOf(page, 'Top two'));
    await press(page, 'Escape');
    await settle(page);
    await exec(page, 'text.list.ul');
    await settle(page);
    assert.equal(await render(page), readFileSync(DECK, 'utf8'));
  });

  test(`a plain list and a dash list are not joined after the paragraph between them is deleted (${platform})`, async (t) => {
    const page = await load(t, platform, APART);
    await caretIn(page, 'Dash item');
    await exec(page, 'text.list.dashes');
    await settle(page);
    assert.equal(await render(page), page.source.replace('<ul>\n    <li>Dash item', '<ul class="dashes">\n    <li>Dash item'));
    await roundTrip(page);
    await caretIn(page, 'Between');
    await press(page, 'Escape');
    await settle(page);
    assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['p']);
    await press(page, 'Delete');
    await settle(page);
    assert.equal(await render(page), page.source.replace('  <p>Between</p>\n', ''));
    await roundTrip(page);
  });

  test(`the Text pane chooses the kind of text and the bullet in two selectors, and the bullets are drawn large (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    // the Text pane of the item of the caret
    const textPane = async () => {
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await page.waitFor(`!!document.querySelector('.beeson-edit-inspector .ed-tabs button')`);
      const tab = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === 'Text'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, tab);
      await settle(page);
    };
    await caretIn(page, 'Bravo');
    await textPane();
    // the buttons of the selector of aria-label, with their words, state, and the size of their mark
    const selector = (label) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector [role="group"][aria-label="${label}"] button')].map((b) => {
      const r = b.getBoundingClientRect();
      const mark = b.querySelector('svg')?.getBoundingClientRect();
      return { id: b.dataset.command, text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), disabled: b.disabled, title: b.title, mark: mark ? Math.round(mark.width) : 0, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })`);
    const kinds = await selector('List');
    assert.deepEqual(kinds.map((s) => s.text), ['Paragraphs', 'Bullets', 'Numbers']);
    assert.deepEqual(kinds.map((s) => s.pressed), ['false', 'true', 'false']);
    let bullets = await selector('Bullet');
    assert.deepEqual(bullets.map((s) => s.text), ['Arrows', 'Dots', 'Dashes']);
    assert.deepEqual(bullets.map((s) => s.id), ['text.list.ul', 'text.list.dots', 'text.list.dashes']);
    assert.deepEqual(bullets.map((s) => s.pressed), ['true', 'false', 'false']);
    // each bullet is drawn at 20 px beside its name, and every target is at least 24 px high
    assert.ok(bullets.every((s) => s.mark >= 20 && !s.disabled), `a bullet is not drawn large: ${js(bullets)}`);
    assert.ok([...kinds, ...bullets].every((s) => s.height >= 24), `a target is less than 24 px high: ${js([...kinds, ...bullets])}`);
    await click(page, bullets[2]);
    await settle(page);
    assert.equal(await render(page), page.source.replace('<ul>\n    <li>Alpha', '<ul class="dashes">\n    <li>Alpha'));
    assert.equal(await undoLabel(page), 'Undo List Style');
    assert.deepEqual((await selector('List')).map((s) => s.pressed), ['false', 'true', 'false']);
    assert.deepEqual((await selector('Bullet')).map((s) => s.pressed), ['false', 'false', 'true']);
    assert.ok(await page.evaluate(`!!getSelection().anchorNode?.parentElement?.closest('li')`), 'the caret left the text');
    // Bullets keeps the dashes of the list
    const dashed = await render(page);
    await click(page, (await selector('List'))[1]);
    await settle(page);
    assert.equal(await render(page), dashed);
    // Numbers dims the bullets, and Bullets on the numbered list sets the default bullet, Arrows
    await click(page, (await selector('List'))[2]);
    await settle(page);
    bullets = await selector('Bullet');
    assert.ok(bullets.every((s) => s.disabled && / only /.test(s.title)), `the bullets are not dimmed with a reason on a numbered list: ${js(bullets)}`);
    const numbered = await render(page);
    assert.equal(numbered, page.source.replace('<ul>\n    <li>Alpha', '<ol>\n    <li>Alpha').replace('<li>Bravo</li>\n  </ul>', '<li>Bravo</li>\n  </ol>'));
    await click(page, (await selector('List'))[1]);
    await settle(page);
    assert.equal(await render(page), page.source);
    assert.deepEqual((await selector('Bullet')).map((s) => s.pressed), ['true', 'false', 'false']);
    await click(page, (await selector('List'))[0]);
    await settle(page);
    await roundTrip(page);
    assert.deepEqual(errors(page), []);
  });

  test(`Bullets on a dot list and a dash list selected together keeps the bullet of each (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    await clickText(page, await pointOf(page, 'Dot one'));
    await press(page, 'Escape');
    await click(page, await pointOf(page, 'Dash one'), { modifiers: 'Shift' });
    await settle(page);
    assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.className)'), ['dots', 'dashes']);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    const bullets = `[...document.querySelectorAll('.beeson-edit-inspector [role="group"][aria-label="List"] button')].find((b) => b.textContent.trim() === 'Bullets')`;
    await page.waitFor(`${bullets}?.getAttribute('aria-pressed') === 'true'`);
    await click(page, await page.evaluate(`(() => { const r = ${bullets}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await settle(page);
    assert.equal(await render(page), page.source);
    assert.deepEqual(errors(page), []);
  });

  test(`Format > Text lists Dots and Dashes between Arrows and Numbers, disabled in the notes, and Dashes in a new text box is written once its text is typed (${platform})`, async (t) => {
    const page = await load(t, platform, KINDS);
    await caretIn(page, 'Bravo');
    const text = await page.evaluate(`(() => {
      const E = window.BeesonEditor;
      const walk = (items) => items.flatMap((i) => i.rule ? [] : i.command ? [E.state(i.command).label] : walk(typeof i.items === 'function' ? i.items() : i.items));
      const format = window.BeesonEditorShell.menuItems('Format');
      const items = format.find((i) => i.label === 'Text').items;
      return walk(typeof items === 'function' ? items() : items);
    })()`);
    const at = text.indexOf('Arrows');
    assert.deepEqual(text.slice(at - 1, at + 4), ['Paragraphs', 'Arrows', 'Dots', 'Dashes', 'Numbers']);
    for (const id of ['text.list.dots', 'text.list.dashes']) assert.equal((await state(page, id)).enabled, true, `${id} is dimmed in a list`);
    // the notes take only arrows
    if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
    await frames(page);
    await clickText(page, '.reveal section.present > aside.notes');
    await settle(page);
    assert.equal((await state(page, 'text.list.ul')).enabled, true, 'the caret is not in the notes');
    for (const id of ['text.list.dots', 'text.list.dashes']) assert.equal((await state(page, id)).enabled, false, `${id} is enabled in the notes`);
    await exec(page, 'view.notes');
    await frames(page);
    // a new text box on the last slide
    await page.evaluate(`Reveal.slide(${DASHES})`);
    await frames(page);
    await exec(page, 'insert.text');
    await frames(page);
    await exec(page, 'text.list.dashes');
    assert.equal((await state(page, 'text.list.dashes')).checked, true);
    assert.equal((await state(page, 'text.list.ul')).checked, false);
    await type(page, 'Item');
    await settle(page);
    assert.match(await render(page), /<ul class="dashes"(?: style="[^"]*")?>\s*<li>Item<\/li>\s*<\/ul>/, `the new text is not a dash list: ${(await render(page)).match(/[^\n]*\n[^\n]*Item[^\n]*\n?[^\n]*/)?.[0]}`);
  });
}
