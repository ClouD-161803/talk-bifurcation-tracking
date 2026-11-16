// the preview of Version History in Chrome, on the edit command started on a temporary talk folder
// with SLIDES_HISTORY set so that a version is closed only when it is named: the layout of a phone
// in portrait and in landscape with 1, 8, and 40 changed slides, the slide after a hidden slide, a
// changed step and changed notes, the keys inside the preview, a new list that leaves the bar
// alone, one read of the text per preview, the memory of a preview hidden, and converge() of the
// helpers, which ends at its time limit

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, HISTORY_KEY, ONLINE, open, sessionUrl, show, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, press, type } from './helpers/editor.mjs';

// a version is closed only when the current state is named
const HELD = { SLIDES_HISTORY: JSON.stringify({ quiet: 3_600_000, longest: 3_600_000 }) };

const PANE = '.beeson-session-history';
const SHOWN = `!!document.querySelector('${PANE}:not([hidden])')`;
const BAR = '.beeson-session-preview .bar';
const FRAME = `document.querySelector('.beeson-session-preview iframe')`;
// before reveal.js is started in the page of the preview, window.Reveal is there without getCurrentSlide
const CURRENT = `${FRAME}?.contentWindow?.Reveal?.getCurrentSlide?.()?.querySelector('h2')?.textContent`;
const button = (scope, text) => `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent === ${JSON.stringify(text)} && b.getClientRects().length)`;
const rowByTitle = (title) => `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === ${JSON.stringify(title)})`;

// a tap on the element of expression, scrolled into view in a pane that scrolls
async function tapOrClick(page, expression) {
  await page.waitFor(`!!(${expression})`);
  const point = await page.evaluate(`(() => { const el = ${expression}; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, point);
}

const press$ = (page, scope, text) => tapOrClick(page, button(scope, text));

async function openPane(page) {
  await front(page);
  await press(page, HISTORY_KEY);
  await page.waitFor(SHOWN);
}

// the current state named through the client, which closes a version, resolved with the version
const nameNow = (page, name) => page.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: ${JSON.stringify(name)} })`);
const rename = (page, id, name) => page.evaluate(`${C}.transport.post('history/' + ${JSON.stringify(id)} + '/name', { token: ${C}.token, name: ${JSON.stringify(name)} }).then(() => true)`);

// index.html written outside the editor, and the page once it holds the text of mark
async function write(server, page, text, mark) {
  writeFileSync(server.file, text);
  await page.waitFor(`${ONLINE} && ${TEXT}.includes(${JSON.stringify(mark)})`, 30_000);
}

const HEAD = TALK.slice(0, TALK.indexOf('<section>'));
const TAIL = TALK.slice(TALK.lastIndexOf('</section>') + '</section>'.length);

// a deck of 45 slides, of which the first changed ones carry mark in their heading
const many = (changed, mark) => HEAD + Array.from({ length: 45 }, (_, i) => `\n<section>\n  <h2>Slide ${i + 1}${i < changed ? ` ${mark}` : ''}</h2>\n  <p>Text ${i + 1}</p>\n</section>\n`).join('') + TAIL;

// the preview at the size of a phone, as numbers that the test bounds: the height of the iframe, the
// places of Restore and More, the rows of the bar, the slide buttons, and the sheet of the pane
const MEASURE = `(() => {
  const box = (el) => {
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, hit: el.contains(hit), big: r.width >= 32 && r.height >= 32 };
  };
  const bar = document.querySelector('${BAR}');
  const parts = [...bar.children].filter((c) => c.getClientRects().length && c.getBoundingClientRect().height > 0).map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top);
  let rows = 0;
  let bottom = -Infinity;
  for (const r of parts) if (r.top >= bottom - 1) { rows++; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom);
  const slides = [...bar.querySelectorAll('button.slide')];
  const pane = document.querySelector('${PANE}').getBoundingClientRect();
  const shown = [...document.querySelectorAll('${PANE} .row')].filter((r) => r.getClientRects().length);
  return {
    frame: Math.round(${FRAME}.getBoundingClientRect().height),
    restore: box(${button(BAR, 'Restore this version')}),
    more: box(bar.querySelector('button.more')),
    rows,
    slides: slides.length,
    oneRow: new Set(slides.map((b) => Math.round(b.getBoundingClientRect().top))).size <= 1,
    name: !!${button(BAR, 'Name this version')},
    sheet: { phone: innerWidth < 600, low: pane.height < innerHeight * 0.55 - 1, rows: shown.length, chosen: shown.length === 1 && shown[0].getAttribute('aria-current') === 'true', versions: box(${button(PANE, 'Versions')}) },
  };
})()`;

test('on a phone in portrait and in landscape, with 1, 8, and 40 changed slides, the preview keeps the deck in view and Restore and More in reach', { timeout: 600_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  writeFileSync(server.file, many(0, ''));
  await server.edit.child.kill();
  await server.edit.exited;
  await server.start();
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  const versions = [[1, 'One changed'], [8, 'Eight changed'], [40, 'Forty changed']];
  for (const [n, title] of versions) {
    await write(server, ann, many(n, title), `Slide ${n} ${title}`);
    await nameNow(ann, title);
  }
  await tapOrClick(ann, `document.querySelector('.beeson-session-state')`);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Version History')`);
  await ann.waitFor(SHOWN);
  await ann.waitFor(`!!(${rowByTitle('Forty changed')})`);
  // the least height of the iframe at each size
  const sizes = [[390, 844, 200], [390, 664, 120], [844, 390, 120], [664, 390, 120]];
  for (const [width, height, least] of sizes) {
    await t.test(`${width} by ${height}`, async () => {
      await ann.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await ann.waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
      for (const [n, title] of versions) {
        // the list is brought back where the sheet of a phone shows the chosen version alone
        if (await ann.evaluate(`!!(${button(PANE, 'Versions')})`)) await press$(ann, PANE, 'Versions');
        await tapOrClick(ann, rowByTitle(title));
        await ann.waitFor(`document.querySelectorAll('${BAR} button.slide').length === ${n} && ${FRAME}?.contentDocument?.querySelectorAll('[data-beeson-changed]').length > 0`, 60_000);
        const narrow = width < 600;
        const ok = (m) => m.frame >= least && m.rows <= 2 && m.oneRow && m.slides === n && JSON.stringify([m.restore, m.more]) === JSON.stringify([{ inside: true, hit: true, big: true }, { inside: true, hit: true, big: true }]) && (!m.sheet.phone || (m.sheet.low && m.sheet.chosen && m.sheet.versions?.inside && m.sheet.versions.hit && m.sheet.versions.big));
        await ann.waitFor(`(${ok})(${MEASURE})`, 10_000).catch(() => {});
        const m = await ann.evaluate(MEASURE);
        assert.ok(ok(m), `${n} changed slides at ${width} by ${height}: ${JSON.stringify(m)}`);
        t.diagnostic(`${n} changed slides at ${width} by ${height}: iframe ${m.frame} px, ${m.rows} rows`);
        assert.equal(m.sheet.phone, narrow);
        // below 600 px Name and Download are in the More menu
        await press$(ann, BAR, '⋯');
        await ann.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
        const items = await ann.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((b) => b.textContent)`);
        const wide = await ann.evaluate(`document.querySelector('${BAR}').getBoundingClientRect().width >= 600`);
        assert.deepEqual([items, m.name], wide ? [['Download This Version'], true] : [['Name this version', 'Download This Version'], false]);
        await press(ann, 'Escape');
        await ann.waitFor(`!document.querySelector('.beeson-edit-menu')`);
        if (narrow) {
          await press$(ann, PANE, 'Versions');
          await ann.waitFor(`[...document.querySelectorAll('${PANE} .row')].filter((r) => r.getClientRects().length).length > 1`);
        }
      }
    });
  }
  clean(ann);
});

const STEPS = (three, step, note) => `${HEAD}
<section>
  <h2>One</h2>
  <p>First slide</p>
</section>

<section data-visibility="hidden">
  <h2>Hidden</h2>
  <p>Hidden slide</p>
</section>

<section>
  <h2>Three</h2>
  <p>${three}</p>
  <p class="fragment">${step}</p>
  <aside class="notes">${note}</aside>
</section>
${TAIL}`;

test('the preview of a deck with a hidden slide, a changed step, and changed notes, and the keys inside it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  writeFileSync(server.file, STEPS('Third slide', 'Step text', 'A note'));
  await server.edit.child.kill();
  await server.edit.exited;
  await server.start();
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await write(server, ann, STEPS('Third slide changed', 'Step text changed', 'A note changed'), 'A note changed');
  await nameNow(ann, 'Changed');
  await openPane(ann);
  await tapOrClick(ann, rowByTitle('Changed'));
  const doc = `${FRAME}.contentDocument`;
  await ann.waitFor(`${doc}?.querySelectorAll('[data-beeson-changed]').length === 3 && ${FRAME}.contentWindow.Reveal?.isReady()`, 30_000);

  await t.test('the preview opens at the first changed slide that is shown, and Slide 2 shows the slide after the hidden slide', async () => {
    assert.deepEqual(await ann.evaluate(`[...document.querySelectorAll('${BAR} button.slide')].map((b) => b.textContent)`), ['Slide 2']);
    await ann.waitFor(`${CURRENT} === 'Three'`);
    await ann.evaluate(`${FRAME}.contentWindow.Reveal.slide(0), true`);
    await ann.waitFor(`${CURRENT} === 'One'`);
    await press$(ann, BAR, 'Slide 2');
    await ann.waitFor(`${CURRENT} === 'Three'`);
  });

  await t.test('a changed step is shown with its outline, and changed notes are named in the bar', async () => {
    // the step fades in by the transition of the theme once it is marked, after the load
    await ann.waitFor(`${FRAME}.contentWindow.getComputedStyle([...${doc}.querySelectorAll('p.fragment')][0]).opacity === '1'`);
    const step = await ann.evaluate(`(() => {
      const p = [...${doc}.querySelectorAll('p.fragment')][0];
      const s = ${FRAME}.contentWindow.getComputedStyle(p);
      return { changed: p.hasAttribute('data-beeson-changed'), opacity: s.opacity, visibility: s.visibility, outline: s.outlineStyle };
    })()`);
    assert.deepEqual(step, { changed: true, opacity: '1', visibility: 'visible', outline: 'solid' });
    assert.equal(await ann.evaluate(`document.querySelector('${BAR} .notes')?.textContent`), 'Notes of Slide 2 changed');
  });

  await t.test('in the preview the arrows move through its slides, the keys of reveal.js are held, and Esc leaves Version History', async () => {
    const r = await ann.evaluate(`(() => { const r = ${FRAME}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    // a click on a slide plays its next step, see src/click.ts
    await click(ann, r);
    await ann.waitFor(`document.activeElement === ${FRAME}`);
    await press(ann, 'Home');
    await ann.waitFor(`${CURRENT} === 'One'`);
    // O opens the overview of reveal.js. the keys of the page are taken in order, hence O is
    // taken once the arrow after it moves the slide
    await press(ann, 'o');
    await press(ann, 'ArrowRight');
    await ann.waitFor(`${CURRENT} === 'Three'`);
    await ann.evaluate(`window.__shown = ${FRAME}.contentWindow, true`);
    assert.equal(await ann.evaluate('window.__shown.Reveal.isOverview()'), false);
    await press(ann, 'Escape');
    await ann.waitFor(`!(${SHOWN})`);
    assert.equal(await ann.evaluate('window.__shown.Reveal.isOverview()'), false);
    assert.equal(await ann.evaluate(`document.documentElement.classList.contains('beeson-history')`), false);
  });
  clean(ann);
});

// a deck with a plugin of reveal.js whose init ends after the page is loaded. reveal.js takes the
// hidden slides out of the page only once every plugin is started
const late = (text) => text.replace('Beeson.start({})', `Beeson.start({ plugins: [{ id: 'late', init: () => new Promise((done) => setTimeout(done, 1500)) }] })`);

test('the preview of a deck whose plugin of reveal.js starts after the page is loaded opens at the first changed slide that is shown', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  writeFileSync(server.file, late(STEPS('Third slide', 'Step text', 'A note')));
  await server.edit.child.kill();
  await server.edit.exited;
  await server.start();
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await write(server, ann, late(STEPS('Third slide changed', 'Step text', 'A note')), 'Third slide changed');
  await nameNow(ann, 'Changed');
  await openPane(ann);
  await tapOrClick(ann, rowByTitle('Changed'));
  // the hidden slide is still in the page when it is loaded
  await ann.waitFor(`${FRAME}?.contentDocument?.readyState === 'complete' && ${FRAME}.contentWindow.Reveal?.isReady() === false`, 30_000);
  assert.equal(await ann.evaluate(`${FRAME}.contentDocument.querySelectorAll('.reveal .slides section').length`), 3);
  await ann.waitFor(`${FRAME}.contentWindow.Reveal.isReady()`, 30_000);
  assert.equal(await ann.evaluate(`${FRAME}.contentDocument.querySelectorAll('.reveal .slides section').length`), 2);
  await ann.waitFor(`${CURRENT} === 'Three'`);
  assert.deepEqual(await ann.evaluate(`[...${FRAME}.contentDocument.querySelectorAll('[data-beeson-changed]')].map((e) => e.textContent)`), ['Third slide changed']);
  await ann.evaluate(`${FRAME}.contentWindow.Reveal.slide(0), true`);
  await ann.waitFor(`${CURRENT} === 'One'`);
  await press$(ann, BAR, 'Slide 2');
  await ann.waitFor(`${CURRENT} === 'Three'`);
  clean(ann);
});

// a name of more than about 26 characters is cut on a phone, and the selected row of the pane shows it
const LONG = 'A much longer name of a version for the review';

test('on a phone of 390 px, the bar of the preview shows a short name and the time of a version by one person in full, and the button of the changed slide next to a long name', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  await show(ann, 'One');
  for (const [typed, name] of [[' on a phone', 'Draft for review'], [' again', LONG]]) {
    await caretAtEnd(ann, `document.querySelector('.reveal .slides > section h2')`);
    await type(ann, typed);
    await converge(server, [ann]);
    await nameNow(ann, name);
  }
  await tapOrClick(ann, `document.querySelector('.beeson-session-state')`);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Version History')`);
  await ann.waitFor(SHOWN);
  for (const height of [844, 664]) {
    await ann.send('Emulation.setDeviceMetricsOverride', { width: 390, height, deviceScaleFactor: 1, mobile: true });
    await ann.waitFor(`innerWidth === 390 && innerHeight === ${height}`);
    for (const name of ['Draft for review', LONG]) {
      if (await ann.evaluate(`!!(${button(PANE, 'Versions')})`)) await press$(ann, PANE, 'Versions');
      await tapOrClick(ann, rowByTitle(name));
      await ann.waitFor(`document.querySelector('${BAR} .date').textContent.startsWith(${JSON.stringify(name)}) && document.querySelectorAll('${BAR} button.slide').length === 1`, 60_000);
      // whether the name is cut, and whether the button of the changed slide is in view next to it
      const date = `(() => {
        const d = document.querySelector('${BAR} .date');
        const strip = document.querySelector('${BAR} .slides').getBoundingClientRect();
        const slide = document.querySelector('${BAR} button.slide').getBoundingClientRect();
        return { text: d.textContent, cut: d.scrollWidth > d.clientWidth, who: document.querySelector('${BAR} .who').textContent, slide: slide.left >= strip.left - 0.5 && slide.right <= strip.right + 0.5 };
      })()`;
      const m = { ...(await ann.evaluate(MEASURE)), date: await ann.evaluate(date) };
      assert.ok((name === LONG || !m.date.cut) && m.date.who === 'Ann' && m.date.slide && m.rows <= 2 && m.oneRow, `${name} at 390 by ${height}: ${JSON.stringify(m)}`);
    }
  }
  clean(ann);
});

test('a version that changes only the start tag of a slide outlines the slide itself', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const second = TALK.indexOf('<section>', TALK.indexOf('<section>') + 1);
  await write(server, ann, `${TALK.slice(0, second)}<section class="two">${TALK.slice(second + '<section>'.length)}`, 'class="two"');
  await nameNow(ann, 'Tag');
  await openPane(ann);
  await tapOrClick(ann, rowByTitle('Tag'));
  // the outlines are set before the preview moves to the first changed slide
  await ann.waitFor(`${CURRENT} === 'Two'`, 30_000);
  const outlined = `[...${FRAME}.contentDocument.querySelectorAll('[data-beeson-changed]')].map((e) => e.localName + (e.classList.contains('two') ? ' two' : ''))`;
  assert.deepEqual(await ann.evaluate(outlined), ['section two']);
  clean(ann);
});

test('the preview draws neither the switch of the mode, the slide number, nor the progress bar of the show', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await write(server, ann, TALK.replace('<h2>Two</h2>', '<h2>Two changed</h2>'), 'Two changed');
  await nameNow(ann, 'Changed');
  await openPane(ann);
  await tapOrClick(ann, rowByTitle('Changed'));
  await ann.waitFor(`${CURRENT} === 'Two changed'`, 30_000);
  // each control of the show is in the page of the preview, and is not drawn
  const controls = `['.theme-switch', '.reveal .slide-number', '.reveal .progress'].map((s) => { const el = ${FRAME}.contentDocument.querySelector(s); return el ? el.getClientRects().length : null; })`;
  await ann.waitFor(`!${controls}.includes(null)`);
  assert.deepEqual(await ann.evaluate(controls), [0, 0, 0]);
  clean(ann);
});

test('the preview of a text set aside lists the slides on which it differs from the current deck, and opens on the first of them', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const aside = await ann.evaluate(`${C}.transport.post('aside', { token: ${C}.token, text: ${JSON.stringify(TALK.replace('<p>Second slide</p>', '<p>Second slide set aside</p>'))} })`);
  await openPane(ann);
  await tapOrClick(ann, `document.querySelector('${PANE} .row[data-id="aside:${aside.id}"]')`);
  await ann.waitFor(`!!${FRAME}?.contentWindow?.Reveal?.isReady() && !!${FRAME}.contentDocument.querySelector('.theme-switch')`, 30_000);
  assert.deepEqual(await ann.evaluate(`[...document.querySelectorAll('${BAR} button.slide')].map((b) => b.textContent)`), ['Slide 2']);
  await ann.waitFor(`${CURRENT} === 'Two'`);
  assert.equal(await ann.evaluate(`${FRAME}.contentDocument.querySelector('.theme-switch').getClientRects().length`), 0);
  await ann.evaluate(`${FRAME}.contentWindow.Reveal.slide(0), true`);
  await ann.waitFor(`${CURRENT} === 'One'`);
  await press$(ann, BAR, 'Slide 2');
  await ann.waitFor(`${CURRENT} === 'Two'`);
  clean(ann);
});

test('the preview of a text set aside that only moved slides lists the slides that read differently at their place', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  // the two slides of the deck in the other order
  const one = TALK.slice(TALK.indexOf('<section>'), TALK.indexOf('</section>') + '</section>'.length);
  const two = TALK.slice(TALK.indexOf('<section>', TALK.indexOf('</section>')), TALK.lastIndexOf('</section>') + '</section>'.length);
  assert.ok(one.includes('<h2>One</h2>') && two.includes('<h2>Two</h2>') && !two.includes('<h2>One</h2>'));
  const moved = TALK.replace(one, '@@').replace(two, one).replace('@@', two);
  const aside = await ann.evaluate(`${C}.transport.post('aside', { token: ${C}.token, text: ${JSON.stringify(moved)} })`);
  await openPane(ann);
  await tapOrClick(ann, `document.querySelector('${PANE} .row[data-id="aside:${aside.id}"]')`);
  await ann.waitFor(`!!${FRAME}?.contentWindow?.Reveal?.isReady()`, 30_000);
  await ann.waitFor(`${CURRENT} === 'Two'`);
  assert.deepEqual(await ann.evaluate(`[...document.querySelectorAll('${BAR} button.slide')].map((b) => b.textContent)`), ['Slide 1', 'Slide 2']);
  await press$(ann, BAR, 'Slide 2');
  await ann.waitFor(`${CURRENT} === 'One'`);
  clean(ann);
});

test('a slide chosen in the bar while the page of a preview is loading is shown once the page is loaded', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // a picture that is answered only once the test lets it go, which holds the load of the page
  const waiting = [];
  let free = false;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const answer = (res) => res.writeHead(200, { 'content-type': 'image/png' }).end(png);
  const pictures = createServer((_, res) => (free ? answer(res) : waiting.push(res)));
  await new Promise((done) => pictures.listen(0, '127.0.0.1', done));
  const release = () => {
    free = true;
    waiting.splice(0).forEach(answer);
  };
  t.after(() => {
    release();
    pictures.close();
  });
  const picture = `\n  <img src="http://127.0.0.1:${pictures.address().port}/held.png" alt="">`;
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const loading = `!!${FRAME}?.contentWindow?.Reveal?.isReady() && ${FRAME}.contentDocument.readyState !== 'complete'`;

  // a text set aside in which both slides differ, and which opens on its first slide
  const text = TALK.replace('<h2>One</h2>', '<h2>One aside</h2>').replace('<h2>Two</h2>', `<h2>Two aside</h2>${picture}`);
  const aside = await ann.evaluate(`${C}.transport.post('aside', { token: ${C}.token, text: ${JSON.stringify(text)} })`);
  await openPane(ann);
  await tapOrClick(ann, `document.querySelector('${PANE} .row[data-id="aside:${aside.id}"]')`);
  await ann.waitFor(loading, 30_000);
  await press$(ann, BAR, 'Slide 2');
  assert.equal(await ann.evaluate(loading), true, 'the page was still loading at the press');
  release();
  await ann.waitFor(`${FRAME}.contentDocument.readyState === 'complete'`, 30_000);
  await ann.waitFor(`${CURRENT} === 'Two aside'`, 30_000);

  // a version in which both slides changed, shown after the text set aside
  free = false;
  await write(server, ann, TALK.replace('<h2>One</h2>', '<h2>One changed</h2>').replace('<h2>Two</h2>', `<h2>Two changed</h2>${picture}`), 'Two changed');
  await nameNow(ann, 'Both');
  await tapOrClick(ann, rowByTitle('Both'));
  await ann.waitFor(loading, 30_000);
  assert.deepEqual(await ann.evaluate(`[...document.querySelectorAll('${BAR} button.slide')].map((b) => b.textContent)`), ['Slide 1', 'Slide 2']);
  await press$(ann, BAR, 'Slide 2');
  assert.equal(await ann.evaluate(loading), true, 'the page was still loading at the press');
  release();
  await ann.waitFor(`${FRAME}.contentDocument.readyState === 'complete'`, 30_000);
  await ann.waitFor(`${CURRENT} === 'Two changed'`, 30_000);
  clean(ann);
});

test('a new list leaves the bar alone, the text of a version is read once per preview, and a hidden preview keeps nothing', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await write(server, ann, TALK.replace('<h2>One</h2>', '<h2>One first</h2>'), 'One first');
  const first = (await nameNow(ann, 'First')).id;
  await write(server, ann, TALK.replace('<p>Second slide</p>', '<p>Second slide changed</p>'), 'Second slide changed');
  const second = (await nameNow(ann, 'Second')).id;
  // the initiators of the reads of the text of a version by the page, and the downloads
  await ann.evaluate(`(() => {
    performance.setResourceTimingBufferSize(100000);
    window.__reads = (id) => performance.getEntriesByType('resource').filter((e) => e.name.includes('version=' + id)).map((e) => e.initiatorType);
    ${C}.shell.download = (text) => { window.__downloaded = text; };
    return true;
  })()`);
  const documents = async () => {
    for (let i = 0; i < 3; i++) await ann.send('HeapProfiler.collectGarbage');
    return (await ann.send('Memory.getDOMCounters')).documents;
  };
  await openPane(ann);
  await ann.waitFor(`!!document.querySelector('${PANE} .row[data-id="version:${second}"]')`);
  const before = await documents();
  // the preview of the version of id, once its changed element, which holds mark, is outlined
  const preview = async (id, mark) => {
    await tapOrClick(ann, `document.querySelector('${PANE} .row[data-id="version:${id}"]')`);
    await ann.waitFor(`document.querySelector('${PANE} .row[aria-current="true"]')?.dataset.id === 'version:${id}' && [...(${FRAME}?.contentDocument?.querySelectorAll('[data-beeson-changed]') ?? [])].some((e) => e.textContent.includes(${JSON.stringify(mark)}))`, 30_000);
  };
  const download = async () => {
    await ann.evaluate('window.__downloaded = null, true');
    await tapOrClick(ann, `document.querySelector('${BAR} button.more')`);
    await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Download This Version')`);
    await ann.waitFor('typeof window.__downloaded === "string"');
    assert.match(await ann.evaluate('window.__downloaded'), /<h2>One first<\/h2>/);
  };

  await t.test('a preview and its download read the text of the version once', async () => {
    await preview(first, 'One first');
    await download();
    assert.deepEqual(await ann.evaluate(`window.__reads(${JSON.stringify(first)})`), ['fetch']);
  });

  await t.test('a new list changes only what differs in the bar, and keeps the focus and an open More menu', async () => {
    await ann.evaluate(`(window.__focused = ${button(BAR, 'Restore this version')}).focus(), true`);
    await rename(ann, first, 'First again');
    await ann.waitFor(`document.querySelector('${BAR} .date')?.textContent.startsWith('First again,')`);
    assert.deepEqual(await ann.evaluate(`[document.activeElement === window.__focused, window.__focused.isConnected]`), [true, true]);
    await tapOrClick(ann, `document.querySelector('${BAR} button.more')`);
    await ann.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    await ann.evaluate(`window.__more = document.querySelector('${BAR} button.more'), true`);
    await rename(ann, first, 'First');
    await ann.waitFor(`document.querySelector('${BAR} .date')?.textContent.startsWith('First,')`);
    assert.deepEqual(await ann.evaluate(`[window.__more.isConnected, window.__more.getAttribute('aria-expanded'), !!document.querySelector('.beeson-edit-menu')]`), [true, 'true', true]);
    await press(ann, 'Escape');
    await ann.waitFor(`!document.querySelector('.beeson-edit-menu') && document.activeElement === window.__more`);
  });

  await t.test('the preview keeps the text of the version it shows, and of no other one', async () => {
    await preview(second, 'Second slide changed');
    await preview(first, 'One first');
    await download();
    assert.deepEqual(await ann.evaluate(`window.__reads(${JSON.stringify(first)})`), ['fetch', 'fetch']);
  });

  await t.test('once Version History is left, the preview keeps neither the document nor the text of the version', async () => {
    await press(ann, 'Escape');
    await ann.waitFor(`!(${SHOWN})`);
    assert.equal(await documents(), before);
    await openPane(ann);
    await preview(first, 'One first');
    await download();
    assert.deepEqual(await ann.evaluate(`window.__reads(${JSON.stringify(first)})`), ['fetch', 'fetch', 'fetch']);
  });
  clean(ann);
});

test('converge ends with a failure at its time limit while one page is in step with the file and another is not', { timeout: 60_000 }, async () => {
  const helpers = pathToFileURL(resolve('test/helpers/client.mjs')).href;
  // a worker, since a converge that loops without an await holds the thread that runs it
  const worker = new Worker(`(async () => {
    const { parentPort } = require('node:worker_threads');
    const { converge } = await import(${JSON.stringify(helpers)});
    const page = (text) => ({ send: async () => ({}), evaluate: async () => text });
    const server = { read: () => 'the text of the file, which is long enough to be cut in the message' };
    converge(server, [page(server.read()), page('the text of another file')], 'the pages to agree', 300).then(() => parentPort.postMessage({ value: true }), (e) => parentPort.postMessage({ error: e.message }));
  })()`, { eval: true });
  let timer;
  const answer = await Promise.race([
    new Promise((done) => worker.once('message', done)),
    new Promise((done) => (timer = setTimeout(() => done({ hung: true }), 20_000))),
  ]);
  clearTimeout(timer);
  await worker.terminate();
  assert.deepEqual(answer.hung, undefined, 'converge did not end within 20 s');
  assert.match(answer.error ?? '', /^timed out waiting for the pages to agree\npage 0: agrees\npage 1: "the text of another file" where the file has "the text of the file, which is long enough to be cut in the message"$/);
});
