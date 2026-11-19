import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, press } from './helpers/editor.mjs';
import { DRAWN, shapePath } from '../src/shapes.ts';

describe('the Preview button of the toolbar', () => {
  const DECK = 'test/pages/editor-r22-2.html';
  const PLATFORMS = ['mac', 'other'];
  const MAIN = '.beeson-edit-top [data-command="preview.slide"]';
  const LAYER = '.beeson-edit-play';
  const BOTH = 0, BACKDROP = 1, STEPS = 2, NEITHER = 3, STEPPED = 4;

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

  let last = null;

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => d(true), ${ms}))`);
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.matches('.backdrop') ? 'backdrop' : el.localName)`);
  const rafs = (page) => page.evaluate('Beeson.backdrops.filter((b) => b.raf).length');
  const layer = (page) => page.evaluate(`!!document.querySelector('${LAYER}')`);
  const centerOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const face = (page) => page.evaluate(`(() => {
  const b = document.querySelector('${MAIN}');
  return { label: b.querySelector('.label').textContent, d: [...b.querySelectorAll('svg path')].map((p) => p.getAttribute('d')), pressed: b.getAttribute('aria-pressed') === 'true' };
})()`);
  const PLAY = ['M6.5 4.25v11.5L15.75 10z'];
  const PAUSE = ['M5.5 4.5h3v11h-3z', 'M11.5 4.5h3v11h-3z'];
  const REHEARSE = ['M3 4.5h14v9H3z', 'M8.75 7v4l3.25-2z', 'M7 16.5h6'];

  async function previewPage(platform, n, { motion = false, step = 1000 } = {}) {
    await last?.close().catch(() => {});
    const page = await browser.newPage(motion ? { motion: true } : undefined);
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit${motion ? '' : '&still'}&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`if (window.BeesonEditor.preview) window.BeesonEditor.preview.step = ${step}`);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function splitMenu(page, command) {
    await click(page, await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-top [data-command="${command}"]').parentElement.querySelector('.more').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await frames(page);
    return page.evaluate(`[...document.querySelector('.beeson-edit-menu').children].map((i) => i.matches('.rule') ? '-' : i.querySelector('.label')?.textContent.trim() + (i.getAttribute('aria-disabled') === 'true' ? ' (dimmed)' : ''))`);
  }

  async function menuOf(page, name) {
    await clickText(page, await page.evaluate(`(() => {
    const t = [...document.querySelectorAll('.beeson-edit-header [aria-haspopup="menu"]')].find((b) => b.textContent === ${JSON.stringify(name)});
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
    const items = await page.evaluate(`[...document.querySelector('.beeson-edit-menu').children].map((i) => i.matches('.rule') ? '-' : i.querySelector('.label')?.textContent.trim())`);
    await press(page, 'Escape');
    return items;
  }

  async function unchanged(page, selection = []) {
    assert.equal(await render(page), page.source, 'the preview changed the file');
    const s = await status(page);
    assert.equal(s.undo, false, 'the preview added an entry to the history');
    assert.equal(s.dirty, false, 'the preview marked the deck as changed');
    assert.deepEqual(await selected(page), selection, 'the preview changed the selection');
  }

  const SAMPLE = `(() => {
  const out = [];
  const sample = () => {
    const host = document.querySelector('${LAYER} .shot');
    const s = host?.shadowRoot?.querySelector('.slides > section');
    const sig = s ? [...s.querySelectorAll(':scope > p, :scope > .backdrop')].map((p) => (p.classList.contains('beeson-off') || getComputedStyle(p).visibility === 'hidden' ? 'off' : p.style.opacity === '0.45' ? 'dim' : 'on') + (p.querySelector('.key.hl-accent') ? '+' : '')).join(' ') : 'none';
    if (out[out.length - 1] !== sig) out.push(sig);
    if (sig !== 'none' || out.length === 1) requestAnimationFrame(sample);
  };
  window.__samples = out;
  sample();
})()`;

  for (const platform of PLATFORMS) {
    test(`Preview is a split button before Present with the icon play, and its menu and the Play menu list its commands (${platform})`, async () => {
      const page = await previewPage(platform, BOTH);
      const ids = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-top .tb[data-command]')].map((b) => b.dataset.command)`);
      assert.equal(ids[ids.indexOf('file.present') - 1], 'preview.slide', 'Preview is not directly before Present');
      const f = await face(page);
      assert.equal(f.label, 'Preview');
      assert.deepEqual(f.d, PLAY);
      assert.equal(f.pressed, false);
      assert.equal(await page.evaluate(`!!document.querySelector('${MAIN}').parentElement.matches('.beeson-edit-split')`), true, 'Preview is not a split button');
      assert.deepEqual(await splitMenu(page, 'preview.slide'), ['Play Slide', 'Trace Backdrop', 'Play Steps', '-', 'Select Backdrop', 'Add Backdrop… (dimmed)']);
      await press(page, 'Escape');
      const play = await menuOf(page, 'Play');
      const at = play.indexOf('Play Slide');
      assert.ok(at > play.indexOf('Present') && at < play.indexOf('Rehearse Timings'), `the Play menu is ${play.join(', ')}`);
      assert.deepEqual(play.slice(at - 1, at + 4), ['-', 'Play Slide', 'Trace Backdrop', 'Play Steps', '-']);
      assert.ok(!play.includes('Select Backdrop') && !play.includes('Add Backdrop…'));
    });

    test(`the entries of Preview are dimmed by what the slide has (${platform})`, async () => {
      const page = await previewPage(platform, BOTH);
      const IDS = ['preview.slide', 'preview.backdrop', 'preview.steps', 'preview.selectBackdrop', 'preview.addBackdrop'];
      const expected = {
        [BOTH]: [true, true, true, true, false],
        [BACKDROP]: [true, true, false, true, false],
        [STEPS]: [true, false, true, false, true],
        [NEITHER]: [false, false, false, false, true],
        [STEPPED]: [true, true, true, true, false],
      };
      for (const [n, want] of Object.entries(expected)) {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        const got = [];
        for (const id of IDS) got.push((await state(page, id)).enabled);
        assert.deepEqual(got, want, `slide ${n}`);
      }
      await page.evaluate(`Reveal.slide(${NEITHER})`);
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('${MAIN}').disabled`), true, 'the main part of Preview is not dimmed on a slide without a backdrop and a step');
    });

    test(`Trace Backdrop traces the backdrop once on the canvas without selecting it, and leaves the file, the history, and the selection (${platform})`, async () => {
      const page = await previewPage(platform, BACKDROP, { motion: true });
      await exec(page, 'preview.backdrop');
      await frames(page);
      assert.ok((await rafs(page)) > 0, 'the backdrop is not traced');
      assert.equal(await layer(page), false, 'a trace is drawn on a layer');
      assert.equal((await face(page)).pressed, true);
      await unchanged(page);
      await page.waitFor(`Beeson.backdrops.every((b) => !b.raf)`, 4000);
      await wait(page, 200);
      assert.equal((await face(page)).pressed, false, 'Preview is pressed after the trace');
      assert.equal((await face(page)).label, 'Preview');
      await unchanged(page);
    });

    test(`Play Steps draws each step as the show draws it, one per step delay, and the slide complete after the last (${platform})`, async () => {
      const page = await previewPage(platform, STEPS, { step: 300 });
      const drawn = () => page.evaluate(`[...document.querySelectorAll('section.present > *')].map((el) => [el.className, el.getAttribute('style'), getComputedStyle(el).opacity])`);
      const before = await drawn();
      const started = Date.now();
      await page.evaluate(SAMPLE);
      await exec(page, 'preview.steps');
      await page.waitFor(`window.__samples.at(-1) === 'none' && window.__samples.length > 1`, 8000);
      const took = Date.now() - started;
      assert.deepEqual(await page.evaluate('window.__samples'), ['none', 'off on off', 'on on off', 'dim off off', 'dim off on+', 'on off on+', 'none']);
      assert.ok(took >= 1400 && took < 4000, `the steps took ${took} ms`);
      await unchanged(page);
      assert.deepEqual(await drawn(), before, 'the slide is not drawn as the editor draws it');
    });

    test(`Play Steps traces a backdrop that is a step at its step (${platform})`, async () => {
      const page = await previewPage(platform, STEPPED, { motion: true, step: 700 });
      await page.evaluate(SAMPLE);
      await exec(page, 'preview.steps');
      await page.waitFor(`window.__samples.includes('on on')`, 4000);
      const ink = `(() => {
      const c = document.querySelector('${LAYER} .shot').shadowRoot.querySelector('.backdrop canvas.orbits-base');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i]) n++;
      return n;
    })()`;
      await wait(page, 80);
      const early = await page.evaluate(ink);
      await wait(page, 400);
      const later = await page.evaluate(ink);
      assert.ok(later > early, `the backdrop is not traced at its step (${early}, then ${later})`);
      await page.waitFor(`window.__samples.at(-1) === 'none'`, 6000);
      assert.deepEqual(await page.evaluate('window.__samples'), ['none', 'on off', 'on on', 'none']);
      await unchanged(page);
    });

    test(`Play Slide traces the backdrop and then plays the steps, and Preview reads Stop with the icon pause while it plays (${platform})`, async () => {
      const page = await previewPage(platform, BOTH, { motion: true, step: 250 });
      await clickText(page, await centerOf(page, 'section.present h2'));
      await press(page, 'Escape');
      const selection = await selected(page);
      assert.deepEqual(selection, ['h2']);
      await page.evaluate(SAMPLE);
      await clickText(page, await centerOf(page, MAIN));
      await frames(page);
      assert.ok((await rafs(page)) > 0, 'the backdrop is not traced first');
      assert.equal(await layer(page), false, 'the steps are played before the trace ends');
      assert.deepEqual(await face(page), { label: 'Stop', d: PAUSE, pressed: true });
      await page.waitFor(`!!document.querySelector('${LAYER}')`, 4000);
      assert.equal(await rafs(page), 0, 'the trace runs during the steps');
      assert.deepEqual(await face(page), { label: 'Stop', d: PAUSE, pressed: true });
      await page.waitFor(`window.__samples.at(-1) === 'none' && window.__samples.length > 1`, 4000);
      assert.deepEqual(await page.evaluate('window.__samples'), ['none', 'off off on', 'on off on', 'dim on on', 'on on on', 'none']);
      await frames(page);
      assert.deepEqual(await face(page), { label: 'Preview', d: PLAY, pressed: false });
      await unchanged(page, selection);
    });

    test(`Play Slide runs the one part that a slide has (${platform})`, async () => {
      const page = await previewPage(platform, BACKDROP, { motion: true, step: 200 });
      await exec(page, 'preview.slide');
      await frames(page);
      assert.ok((await rafs(page)) > 0);
      await page.waitFor(`Beeson.backdrops.every((b) => !b.raf)`, 4000);
      await wait(page, 200);
      assert.equal(await layer(page), false, 'steps are played on a slide without a step');
      assert.equal((await face(page)).pressed, false);
      await page.evaluate(`Reveal.slide(${STEPS})`);
      await frames(page);
      await exec(page, 'preview.slide');
      await frames(page);
      assert.equal(await layer(page), true, 'the steps are not played at once on a slide without a backdrop');
      await page.waitFor(`!document.querySelector('${LAYER}')`, 4000);
      await unchanged(page);
    });

    test(`a click on Stop, Esc, a press on the canvas, a change of slide, and an edit each stop a preview at once (${platform})`, async () => {
      const page = await previewPage(platform, BOTH, { motion: true, step: 5000 });
      const playing = async (how) => {
        await exec(page, 'preview.steps');
        await frames(page);
        assert.equal(await layer(page), true, `the steps are not played before ${how}`);
      };
      const stopped = async (how) => {
        await frames(page);
        assert.equal(await layer(page), false, `${how} does not stop the steps`);
        assert.equal(await rafs(page), 0, `${how} does not stop the trace`);
        assert.deepEqual(await face(page), { label: 'Preview', d: PLAY, pressed: false }, `Preview after ${how}`);
      };
      await playing('the click on Stop');
      await clickText(page, await centerOf(page, MAIN));
      await stopped('a click on Stop');
      await unchanged(page);
      await playing('Esc');
      await press(page, 'Escape');
      await stopped('Esc');
      await exec(page, 'preview.backdrop');
      await frames(page);
      await press(page, 'Escape');
      await stopped('Esc during a trace');
      await playing('a press on the canvas');
      await clickText(page, await centerOf(page, 'section.present h2'));
      await stopped('a press on the canvas');
      await press(page, 'Escape');
      await press(page, 'Escape');
      await unchanged(page);
      await playing('a change of slide');
      await page.evaluate(`Reveal.slide(${BACKDROP})`);
      await stopped('a change of slide');
      await exec(page, 'preview.backdrop');
      await frames(page);
      await page.evaluate(`Reveal.slide(${BOTH})`);
      await stopped('a change of slide during a trace');
      await unchanged(page);
      await playing('an edit');
      await exec(page, 'slide.hide');
      await stopped('an edit');
      assert.notEqual(await render(page), page.source);
    });

    test(`Select Backdrop selects the backdrop and shows the Backdrop pane, and Add Backdrop… opens the gallery (${platform})`, async () => {
      const page = await previewPage(platform, BACKDROP);
      await splitMenu(page, 'preview.slide');
      await click(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.textContent.includes('Select Backdrop')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      assert.deepEqual(await selected(page), ['backdrop']);
      assert.equal((await state(page, 'shell.format')).checked, true, 'the inspector is not shown');
      assert.equal(await page.evaluate(`!!document.querySelector('#beeson-edit-panel-format:not([hidden]) [data-pane="backdrop"], #beeson-edit-panel-format:not([hidden]) .pane-backdrop')`), true, 'the Backdrop pane is not shown');
      await page.evaluate(`Reveal.slide(${STEPS})`);
      await frames(page);
      await exec(page, 'preview.addBackdrop');
      await frames(page);
      assert.equal(await page.evaluate(`!!document.querySelector('.beeson-backdrop-gallery')`), true, 'the gallery is not open');
      assert.equal(await render(page), page.source);
    });

    test(`the icon of Present is a board on a post and a foot, and the icon of a new slide is a rounded rectangle with a plus (${platform})`, async () => {
      const page = await previewPage(platform, BOTH);
      const paths = (command) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-top [data-command="${command}"] svg path')].map((p) => { const b = p.getBBox(); return { d: p.getAttribute('d'), x: b.x, y: b.y, w: b.width, h: b.height }; })`);
      const present = await paths('file.present');
      const ds = present.map((p) => p.d);
      assert.notDeepEqual(ds, PLAY);
      assert.notDeepEqual(ds, REHEARSE);
      const board = present.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      assert.ok(board.w >= 12 && board.w > board.h, 'the board is not wide');
      const post = present.find((p) => p.w < 0.01 && p.h > 2 && Math.abs(p.x - 10) < 0.01);
      assert.ok(post && post.y >= board.y + board.h - 0.01, 'the post is not under the middle of the board');
      const foot = present.filter((p) => p.h < 0.01 && p.w > 3 && Math.abs(p.x + p.w / 2 - 10) < 0.01).sort((a, b) => b.y - a.y)[0];
      assert.ok(foot && foot.y >= post.y + post.h - 0.01, 'the foot is not under the post');
      const add = await paths('slide.gallery');
      const rect = add.find((p) => /a/.test(p.d) && /z$/i.test(p.d));
      assert.ok(rect, `the icon of a new slide has no rounded rectangle: ${add.map((p) => p.d).join(' ')}`);
      const plus = add.filter((p) => p !== rect);
      assert.equal(plus.length, 2);
      for (const p of plus) {
        assert.ok(Math.abs(p.x + p.w / 2 - (rect.x + rect.w / 2)) < 0.01 && Math.abs(p.y + p.h / 2 - (rect.y + rect.h / 2)) < 0.01, 'the plus is not centered in the rectangle');
      }
    });

    test(`each entry of the Shape menu has the icon of what it draws, drawn from the geometry of src/shapes.ts (${platform})`, async () => {
      const page = await previewPage(platform, NEITHER);
      const command = await page.evaluate(`document.querySelector('.beeson-edit-top [data-command^="insert.shape."]').dataset.command`);
      const labels = (await splitMenu(page, command)).filter((l) => l !== '-');
      assert.deepEqual(labels, ['Rounded Rectangle', 'Rectangle', 'Ellipse', 'Triangle', 'Block Arrow', 'Double Block Arrow', 'Brace', 'Plus', 'Equals', 'Line', 'Arrow', 'Curved Arrow', 'Elbow Arrow']);
      const icons = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => {
      const svg = i.querySelector('.label svg.beeson-icon');
      return svg && { command: i.dataset.command, view: svg.getAttribute('viewBox'), d: [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')), html: svg.innerHTML };
    })`);
      assert.equal(icons.length, 13);
      assert.ok(icons.every(Boolean), 'an entry has no icon');
      assert.equal(new Set(icons.map((i) => i.html)).size, 13, 'two entries have the same icon');
      for (const kind of DRAWN) {
        const i = icons.find((x) => x.command === `insert.shape.${kind}`);
        const [x, y] = i.view.split(' ').map(Number);
        assert.deepEqual(i.d, [shapePath(kind, 20 + 2 * x, 20 + 2 * y, 1.5)], `the icon of ${kind}`);
      }
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item .label')][3].textContent`), 'Triangle');
    });
  }
});

describe('a preview runs until the backdrop is traced', () => {
  const DECK = 'test/pages/editor-r26-1.html';
  const PLATFORMS = ['mac', 'other'];
  const MAIN = '.beeson-edit-top [data-command="preview.slide"]';
  const VIEW = '.beeson-edit-top [data-command="toolbar.view"]';
  const LAYER = '.beeson-edit-play';
  const STAGGER = 0, STEPPED = 1, LOOP = 2, HIDDEN = 3, STEPS = 4;

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

  let last = null;

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.matches('.backdrop') ? 'backdrop' : el.localName)`);
  const rafs = (page) => page.evaluate('Beeson.backdrops.filter((b) => b.raf).length');
  const layer = (page) => page.evaluate(`!!document.querySelector('${LAYER}')`);
  const pressed = (page) => page.evaluate(`document.querySelector('${MAIN}').getAttribute('aria-pressed') === 'true'`);
  const centerOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

  async function previewPage(platform, n, { motion = false, step = 1000 } = {}) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width: 1600, height: 1000, ...(motion ? { motion: true } : {}) });
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit${motion ? '' : '&still'}&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`window.BeesonEditor.preview.step = ${step}`);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const orbitOf = (n) => `Beeson.backdrops.find((b) => b.el === document.querySelectorAll('.reveal .slides > section')[${n}].querySelector('.backdrop'))`;

  async function spanOf(page, n) {
    await page.waitFor(`(${orbitOf(n)})?.trajectories.length > 1`);
    return page.evaluate(`(() => {
    const b = ${orbitOf(n)};
    const T = Math.max(...b.trajectories.map((s) => s.T));
    return Math.max(...b.trajectories.map((s, i) => (s.times.at(-1) / T) * b.duration + i * b.stagger));
  })()`);
  }

  async function watch(page, id, n) {
    await page.evaluate(`(() => {
    const w = window.__w = { on: null, off: null, end: null, whole: null, released: null };
    const b = ${n === null ? 'null' : orbitOf(n)};
    const t0 = performance.now();
    let started = false, seen = false;
    const tick = () => {
      const t = performance.now() - t0;
      const l = !!document.querySelector('${LAYER}');
      if (l && w.on === null) w.on = t;
      if (!l && w.on !== null && w.off === null) w.off = t;
      if (b?.raf) started = true;
      if (b && started && !b.raf && w.end === null) {
        w.end = t;
        w.whole = b.trajectories.every((s, i) => b.idx[i] === s.times.length - 1);
      }
      if (document.querySelector('${MAIN}').getAttribute('aria-pressed') === 'true') seen = true;
      else if (seen && w.released === null) w.released = t;
      if (w.released === null) requestAnimationFrame(tick);
    };
    window.BeesonEditor.exec(${JSON.stringify(id)});
    requestAnimationFrame(tick);
  })()`);
  }

  const watched = async (page, timeout = 15000) => {
    await page.waitFor('window.__w.released !== null', timeout);
    return page.evaluate('window.__w');
  };

  const box = (page, selector) => page.evaluate(`(() => {
  const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
  return r ? [r.left, r.top, r.width, r.height].map(Math.round) : null;
})()`);

  const placed = (page) => page.evaluate(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
  const l = document.querySelector('${LAYER}');
  if (!l) return null;
  const stage = document.querySelector('.reveal .slides');
  const s = stage.getBoundingClientRect(), v = window.BeesonEditorShell.stage.viewport;
  const cut = [v.top - s.top, s.right - v.right, s.bottom - v.bottom, v.left - s.left].map((d) => Math.round(Math.max(0, d)));
  const d = (/inset\\(([^)]*)\\)/.exec(l.style.clipPath)?.[1] ?? '0px').split(' ').map((x) => Math.round(parseFloat(x)));
  const clip = [d[0], d[1] ?? d[0], d[2] ?? d[0], d[3] ?? d[1] ?? d[0]];
  return { layer: r(l), shot: r(l.querySelector('.shot').shadowRoot.querySelector('.slides')), slides: r(stage), clip, cut };
})()`);

  for (const platform of PLATFORMS) {
    test(`Trace Backdrop of a staggered backdrop runs until its last trajectory is traced (${platform})`, async () => {
      const page = await previewPage(platform, STAGGER, { motion: true });
      const span = await spanOf(page, STAGGER);
      assert.ok(span > 2, `the trace of the test backdrop takes ${span} s`);
      await watch(page, 'preview.backdrop', STAGGER);
      const w = await watched(page);
      assert.ok(w.end !== null, 'the trace did not end');
      assert.ok(w.end >= span * 1000 - 150, `the trace ends at ${Math.round(w.end)} ms, before its last trajectory at ${Math.round(span * 1000)} ms`);
      assert.equal(w.whole, true, 'the trace snaps to the finished drawing');
      assert.ok(w.released >= w.end - 20 && w.released < span * 1000 + 1500, `Preview is released at ${Math.round(w.released)} ms`);
    });

    test(`Play Slide traces a staggered backdrop until its last trajectory before it plays the steps (${platform})`, async () => {
      const page = await previewPage(platform, STAGGER, { motion: true, step: 200 });
      const span = await spanOf(page, STAGGER);
      await watch(page, 'preview.slide', STAGGER);
      const w = await watched(page);
      assert.equal(w.whole, true, 'the trace snaps to the finished drawing');
      assert.ok(w.on !== null && w.on >= span * 1000 - 150, `the steps start at ${Math.round(w.on)} ms, before the last trajectory at ${Math.round(span * 1000)} ms`);
    });

    test(`Play Steps runs until the last trajectory of a staggered backdrop that is a step is traced (${platform})`, async () => {
      const page = await previewPage(platform, STEPPED, { motion: true, step: 300 });
      const span = await spanOf(page, STEPPED);
      await watch(page, 'preview.steps', null);
      const w = await watched(page);
      assert.ok(w.off !== null && w.off >= 300 + span * 1000 - 150, `the layer is taken down at ${Math.round(w.off)} ms, before the last trajectory at ${Math.round(300 + span * 1000)} ms`);
      assert.ok(w.off < 300 + span * 1000 + 2000, `the layer is taken down at ${Math.round(w.off)} ms`);
    });

    test(`Trace Backdrop of a staggered loop ends (${platform})`, async () => {
      const page = await previewPage(platform, LOOP, { motion: true });
      const span = await spanOf(page, LOOP);
      await watch(page, 'preview.backdrop', null);
      const w = await watched(page);
      assert.ok(w.released >= 1000 - 150 && w.released < span * 1000 + 1500, `the loop is released at ${Math.round(w.released)} ms, with the last trajectory at ${Math.round(span * 1000)} ms`);
    });

    test(`a backdrop hidden in the shown layer is not traced by Trace Backdrop or Play Slide (${platform})`, async () => {
      const page = await previewPage(platform, HIDDEN, { motion: true, step: 5000 });
      assert.equal(await page.evaluate(`document.querySelector('section.present > .backdrop').classList.contains('beeson-off')`), true, 'the backdrop is not hidden in the first layer');
      assert.equal((await state(page, 'preview.backdrop')).enabled, false, 'Trace Backdrop is enabled');
      assert.equal((await state(page, 'preview.slide')).enabled, true, 'Play Slide is dimmed on a slide with steps');
      await exec(page, 'preview.backdrop');
      await frames(page);
      assert.equal(await rafs(page), 0, 'Trace Backdrop traces the hidden backdrop');
      assert.equal(await pressed(page), false);
      await exec(page, 'preview.slide');
      await frames(page);
      assert.equal(await rafs(page), 0, 'Play Slide traces the hidden backdrop');
      assert.equal(await layer(page), true, 'Play Slide does not play the steps at once');
      await press(page, 'Escape');
    });

    test(`Play Slide, Trace Backdrop, and Play Steps are dimmed in Slide Sorter, which stops a preview (${platform})`, async () => {
      const page = await previewPage(platform, STAGGER, { motion: true, step: 5000 });
      await exec(page, 'view.lightTable');
      await frames(page);
      assert.equal((await state(page, 'view.lightTable')).checked, true);
      for (const id of ['preview.slide', 'preview.backdrop', 'preview.steps']) assert.equal((await state(page, id)).enabled, false, `${id} in Slide Sorter`);
      assert.equal(await page.evaluate(`document.querySelector('${MAIN}').disabled`), true, 'the main part of Preview is not dimmed');
      await clickText(page, await page.evaluate(`(() => {
      const t = [...document.querySelectorAll('.beeson-edit-header [aria-haspopup="menu"]')].find((b) => b.textContent === 'Play');
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`));
      await frames(page);
      const dim = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => ['Play Slide', 'Trace Backdrop', 'Play Steps'].includes(i.querySelector('.label')?.textContent.trim())).map((i) => i.getAttribute('aria-disabled'))`);
      assert.deepEqual(dim, ['true', 'true', 'true'], 'an entry of the Play menu is not dimmed');
      await press(page, 'Escape');
      await exec(page, 'view.lightTable');
      await frames(page);
      for (const id of ['preview.steps', 'preview.backdrop', 'preview.slide']) {
        await exec(page, id);
        await frames(page);
        assert.equal(await pressed(page), true, `${id} does not play`);
        await exec(page, 'view.lightTable');
        await frames(page);
        await frames(page);
        assert.equal(await pressed(page), false, `${id} plays on in Slide Sorter`);
        assert.equal(await layer(page), false, `the layer of ${id} is drawn over Slide Sorter`);
        assert.equal(await rafs(page), 0, `the trace of ${id} runs on in Slide Sorter`);
        await exec(page, 'view.lightTable');
        await frames(page);
      }
    });

    test(`the layer of Play Steps follows the slide through a zoom, a pinch, a scroll, the View button, and Rulers (${platform})`, async () => {
      const page = await previewPage(platform, STEPS, { step: 20000 });
      await exec(page, 'preview.steps');
      await frames(page);
      const follows = async (how) => {
        await frames(page);
        await frames(page);
        const p = await placed(page);
        assert.ok(p, `the preview stops at ${how}`);
        assert.equal(await pressed(page), true, `Preview is released at ${how}`);
        for (const k of [0, 1, 2, 3]) {
          assert.ok(Math.abs(p.layer[k] - p.slides[k]) <= 1, `the layer is at ${p.layer} and the slides at ${p.slides} after ${how}`);
          assert.ok(Math.abs(p.shot[k] - p.slides[k]) <= 1, `the slide of the layer is at ${p.shot} and the slides at ${p.slides} after ${how}`);
          assert.ok(Math.abs(p.clip[k] - p.cut[k]) <= 1, `the clip of the layer is ${p.clip} and the viewport cuts ${p.cut} after ${how}`);
        }
      };
      await follows('the start');
      await exec(page, 'zoom.in');
      await follows('zoom.in');
      const v = await page.evaluate('window.BeesonEditorShell.stage.viewport.toJSON()');
      const x = v.left + v.width / 2, y = v.top + v.height / 2;
      await mouse(page, 'mouseMoved', x, y);
      for (let i = 0; i < 6; i++) {
        await mouse(page, 'mouseWheel', x, y, { deltaX: 0, deltaY: -30, modifiers: 2 });
        await frames(page);
      }
      await follows('a pinch');
      await exec(page, 'zoom.in');
      await exec(page, 'zoom.in');
      await frames(page);
      const before = await box(page, '.reveal .slides');
      await mouse(page, 'mouseWheel', x, y, { deltaX: 0, deltaY: 300 });
      await page.waitFor(`Math.round(document.querySelector('.reveal .slides').getBoundingClientRect().top) !== ${before[1]}`, 2000);
      await follows('a scroll');
      await exec(page, 'zoom.fit');
      await follows('zoom.fit');
      await clickText(page, await centerOf(page, VIEW));
      await follows('a click on the View button');
      await exec(page, 'view.rulers');
      await follows('Rulers');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await layer(page), false);
    });

    test(`Esc that stops a preview keeps the selection, as Stop does (${platform})`, async () => {
      const page = await previewPage(platform, STEPS, { step: 5000 });
      await clickText(page, await centerOf(page, 'section.present h2'));
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), ['h2']);
      for (const id of ['preview.steps', 'preview.slide']) {
        await exec(page, id);
        await frames(page);
        assert.equal(await layer(page), true, `${id} does not play`);
        await press(page, 'Escape');
        await frames(page);
        assert.equal(await layer(page), false, `Esc does not stop ${id}`);
        assert.deepEqual(await selected(page), ['h2'], `Esc that stops ${id} changes the selection`);
      }
      await page.evaluate(`Reveal.slide(${STAGGER})`);
      await frames(page);
      await exec(page, 'preview.selectBackdrop');
      assert.deepEqual(await selected(page), ['backdrop']);
      await exec(page, 'preview.steps');
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await layer(page), false);
      assert.deepEqual(await selected(page), ['backdrop'], 'Esc that stops a preview drops the selected backdrop');
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), []);
    });

    test(`Deselect and its key Mod+Shift+A work while a preview plays (${platform})`, async () => {
      const page = await previewPage(platform, STEPS, { step: 5000 });
      await clickText(page, await centerOf(page, 'section.present h2'));
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), ['h2']);
      await exec(page, 'preview.steps');
      await frames(page);
      assert.equal(await layer(page), true);
      assert.equal((await state(page, 'selection.clear')).enabled, true, 'Deselect is dimmed while a preview plays');
      await press(page, 'Mod+Shift+A');
      await frames(page);
      assert.deepEqual(await selected(page), [], 'Mod+Shift+A does not deselect while a preview plays');
      assert.equal(await layer(page), true, 'Mod+Shift+A stops the preview');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await layer(page), false);
    });
  }
});

describe('no selection frame drawn during a preview', () => {
  const DECK = 'test/pages/editor-r32-3.html';
  const PLATFORMS = ['mac', 'other'];
  const MAIN = '.beeson-edit-top [data-command="preview.slide"]';
  const PREVIEWS = ['preview.backdrop', 'preview.slide', 'preview.steps', 'steps.preview', 'slide.previewTransition'];

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

  let last = null;

  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const wait = (ms) => new Promise((d) => setTimeout(d, ms));
  const centerOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  async function previewPage(platform) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width: 1600, height: 1000, motion: true });
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate('window.BeesonEditor.preview.step = 3000');
    if (!(await page.evaluate(`window.BeesonEditor.state('view.rulers').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.rulers')`);
    await page.waitFor(`window.BeesonEditor.state('preview.backdrop').enabled`);
    await frames(page);
    return page;
  }

  const DRAWN = `(() => {
  const shown = (el) => {
    if (el.hidden) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const parts = {
    frame: '.beeson-overlay .beeson-frame.selected',
    group: '.beeson-overlay .beeson-frame.union',
    hover: '.beeson-overlay .beeson-frame:not(.selected):not(.union):not(.entered)',
    grip: '.beeson-overlay .beeson-grip',
    rotor: '.beeson-overlay .beeson-rotor',
    handle: '.beeson-overlay .beeson-handle',
    size: '.beeson-overlay .beeson-offset',
    snap: '.beeson-overlay .beeson-guide',
    end: '.beeson-line-layer .beeson-line-end',
    cut: '.beeson-backdrop-cuts > *',
    guide: '.beeson-guides .beeson-hand-guide',
  };
  const drawn = {};
  for (const [name, sel] of Object.entries(parts)) {
    const n = [...document.querySelectorAll(sel)].filter(shown).length;
    if (n) drawn[name] = n;
  }
  const sel = window.BeesonEditor.selection();
  const top = document.querySelector('.beeson-ruler[data-axis="x"]');
  if (top && !top.hidden && sel.length) {
    const r = sel[0].getBoundingClientRect(), t = top.getBoundingClientRect();
    const g = top.getContext('2d');
    const px = g.getImageData(Math.round((r.left + r.width / 2 - t.left) * devicePixelRatio), 0, 1, 1).data;
    const bg = g.getImageData(1, 0, 1, 1).data;
    if (px[0] !== bg[0] || px[1] !== bg[1] || px[2] !== bg[2]) drawn.band = 1;
  }
  const a = document.activeElement;
  const s = getSelection();
  const editing = !!(a && a.isContentEditable && s.rangeCount && s.isCollapsed);
  if (editing && !['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(a).caretColor)) drawn.caret = 1;
  return {
    drawn,
    focus: a ? a.localName + (a.isContentEditable ? ':' + a.textContent.slice(0, 12) : '') : null,
    offset: editing ? s.anchorOffset : null,
    selection: sel.map((el) => el.matches('.backdrop') ? 'backdrop' : el.localName + (el.classList.contains('shape') ? '.shape' : '')),
  };
})()`;
  const measure = (page) => page.evaluate(DRAWN);

  const SELECTIONS = {
    block: async (page) => { await clickText(page, 'section.present h2'); await press(page, 'Escape'); },
    caret: async (page) => { await clickText(page, 'section.present > p:not(.fragment)'); },
    figure: async (page) => { await clickText(page, 'section.present figure img'); },
    shape: async (page) => { await clickText(page, 'section.present .shape.tone-blue'); },
    line: async (page) => { await clickText(page, await centerOf(page, 'section.present svg.line line')); },
    group: async (page) => { await clickText(page, 'section.present .shape.tone-accent'); },
    backdrop: async (page) => { await page.evaluate(`window.BeesonEditor.exec('preview.selectBackdrop')`); },
    several: async (page) => {
      await clickText(page, 'section.present h2');
      await press(page, 'Escape');
      await click(page, 'section.present .shape.tone-blue', { modifiers: 'Shift' });
    },
  };

  const playingOf = (id) => (id.startsWith('preview.')
    ? `document.querySelector('${MAIN}').getAttribute('aria-pressed') === 'true'`
    : id === 'steps.preview' ? `document.documentElement.classList.contains('beeson-previewing')` : `!!document.querySelector('.beeson-edit-preview')`);

  async function start(page, id) {
    await page.evaluate(`(() => { void window.BeesonEditor.exec(${JSON.stringify(id)}); return true; })()`);
    await page.waitFor(playingOf(id), 3000);
    await frames(page);
  }

  const longMove = (page) => page.evaluate('(Reveal.configure({ autoAnimateDuration: 60 }), true)');

  async function select(page, kind) {
    await page.evaluate('Reveal.slide(0)');
    await frames(page);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
    await SELECTIONS[kind](page);
    await frames(page);
    return measure(page);
  }

  for (const platform of PLATFORMS) {
    for (const id of PREVIEWS) {
      test(`nothing of the selection is drawn while ${id} plays, and Esc draws the same selection again (${platform})`, async () => {
        const page = await previewPage(platform);
        await longMove(page);
        for (const kind of Object.keys(SELECTIONS)) {
          const before = await select(page, kind);
          assert.ok(Object.keys(before.drawn).length, `the ${kind} selection draws nothing before the preview`);
          await start(page, id);
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await centerOf(page, 'section.present .shape.tone-violet')) });
          await frames(page);
          const during = await measure(page);
          assert.ok(await page.evaluate(playingOf(id)), `${id} ended before the reading of the ${kind} selection`);
          assert.deepEqual(during.drawn, {}, `drawn over the slide during ${id} with the ${kind} selection`);
          await press(page, 'Escape');
          await frames(page);
          assert.equal(await page.evaluate(playingOf(id)), false, `Esc does not stop ${id}`);
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
          await frames(page);
          const after = await measure(page);
          assert.deepEqual(after, before, `the ${kind} selection after Esc that stops ${id}`);
        }
      });
    }

    test(`Esc that stops Preview Steps or Preview Transition keeps the selection, the caret, and the focus (${platform})`, async () => {
      const page = await previewPage(platform);
      await longMove(page);
      for (const id of ['steps.preview', 'slide.previewTransition']) {
        for (const kind of ['block', 'caret', 'several']) {
          const before = await select(page, kind);
          await start(page, id);
          await press(page, 'Escape');
          await frames(page);
          assert.equal(await page.evaluate(playingOf(id)), false, `Esc does not stop ${id}`);
          const after = await measure(page);
          assert.deepEqual({ ...after, drawn: undefined }, { ...before, drawn: undefined }, `the ${kind} selection after Esc that stops ${id}`);
        }
      }
    });

    test(`the selection is drawn again at the end of each preview and at Stop (${platform})`, async () => {
      const page = await previewPage(platform);
      for (const id of PREVIEWS) {
        const before = await select(page, 'shape');
        await start(page, id);
        assert.deepEqual((await measure(page)).drawn, {}, `drawn during ${id}`);
        await page.waitFor(`!(${playingOf(id)})`, 15000);
        await frames(page);
        assert.deepEqual(await measure(page), before, `the selection at the end of ${id}`);
      }
      const before = await select(page, 'caret');
      await start(page, 'preview.slide');
      assert.deepEqual((await measure(page)).drawn, {}, 'drawn during Play Slide');
      await clickText(page, MAIN);
      await frames(page);
      assert.equal(await page.evaluate(playingOf('preview.slide')), false, 'Stop does not stop Play Slide');
      assert.deepEqual(await measure(page), before, 'the caret after Stop');
    });

    test(`a preview started with the Preview button or the Play button of the Steps pane hides the caret and gives it back at Esc (${platform})`, async () => {
      const page = await previewPage(platform);
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
      for (const [button, id] of [[MAIN, 'preview.slide'], ['.beeson-edit-side button.play', 'steps.preview']]) {
        const before = await select(page, 'caret');
        assert.equal(before.drawn.caret, 1);
        await clickText(page, button);
        await page.waitFor(playingOf(id), 3000);
        await frames(page);
        assert.deepEqual((await measure(page)).drawn, {}, `drawn during ${id}`);
        await press(page, 'Escape');
        await frames(page);
        assert.deepEqual(await measure(page), before, `the caret after Esc that stops ${id}`);
      }
    });

    test(`a preview does not make an entry of the history or change a byte of the file (${platform})`, async () => {
      const page = await previewPage(platform);
      await select(page, 'group');
      for (const id of PREVIEWS) {
        await start(page, id);
        await page.waitFor(`!(${playingOf(id)})`, 15000);
        await start(page, id);
        await press(page, 'Escape');
        await frames(page);
      }
      const s = await page.evaluate('window.BeesonEditor.status()');
      assert.equal(s.undo, false, 'a preview made an entry of the history');
      assert.equal(s.dirty, false, 'a preview marked the file changed');
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    });

    test(`a click on the slide during a preview stops it and selects as it does without one (${platform})`, async () => {
      const page = await previewPage(platform);
      const shape = await select(page, 'shape');
      await select(page, 'block');
      await start(page, 'preview.backdrop');
      await clickText(page, 'section.present .shape.tone-blue');
      await frames(page);
      assert.equal(await page.evaluate(playingOf('preview.backdrop')), false, 'a click does not stop the preview');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
      await frames(page);
      assert.deepEqual(await measure(page), shape);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a key typed in a text during a preview stops the preview before it is written (${platform})`, async () => {
      const page = await previewPage(platform);
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
      await page.evaluate(`(() => {
      window.__inputs = [];
      for (const type of ['beforeinput', 'input']) document.addEventListener(type, (ev) => {
        const t = ev.target instanceof Element ? ev.target : null;
        window.__inputs.push({ type, playing: document.documentElement.classList.contains('beeson-playing'), off: !!t?.closest('.beeson-pv-off') });
      }, true);
      new MutationObserver((records) => {
        if (records.some((r) => [...r.addedNodes].some((n) => n.localName === 'p'))) window.__inputs.push({ type: 'paragraph', playing: document.documentElement.classList.contains('beeson-playing'), off: false });
      }).observe(document.querySelector('.reveal .slides'), { childList: true, subtree: true });
      return true;
    })()`);
      for (const id of ['steps.preview', ...PREVIEWS.filter((p) => p !== 'steps.preview')]) {
        for (const key of ['q', 'Backspace', 'Enter']) {
          await page.evaluate('Reveal.slide(0)');
          await frames(page);
          await clickText(page, 'section.present p.fragment');
          await press(page, 'End');
          await frames(page);
          const text = await page.evaluate(`document.querySelector('section.present p.fragment').textContent`);
          const count = () => page.evaluate(`document.querySelectorAll('section.present p').length`);
          const paragraphs = await count();
          if (id === 'steps.preview') {
            await click(page, '.beeson-edit-side button.play');
            await page.waitFor(playingOf(id), 3000);
            await frames(page);
          } else await start(page, id);
          assert.ok(await page.evaluate(playingOf(id)), `${id} does not play`);
          await page.evaluate('window.__inputs.length = 0');
          await press(page, key);
          await frames(page);
          const inputs = await page.evaluate('window.__inputs');
          if (key !== 'Enter') assert.ok(inputs.length, `${key} typed during ${id} is not written`);
          assert.deepEqual(inputs.filter((i) => i.playing || i.off), [], `${key} written into the text while ${id} plays`);
          assert.equal(await page.evaluate(playingOf(id)), false, `${key} typed in a text does not stop ${id}`);
          const now = await page.evaluate(`document.querySelector('section.present p.fragment').textContent`);
          if (key === 'Enter') assert.equal(await count(), paragraphs + 1, `Enter typed during ${id} does not make a paragraph`);
          else assert.equal(now, key === 'q' ? `${text}q` : text.slice(0, -1), `the text after ${key} typed during ${id}`);
          assert.equal(await page.evaluate(`document.activeElement.isContentEditable`), true, `the focus after ${key} typed during ${id}`);
          await press(page, 'Escape');
          await press(page, 'Escape');
          await page.evaluate(`window.BeesonEditor.exec('edit.undo')`);
          await frames(page);
          assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source, `the undo of ${key} typed during ${id}`);
        }
      }
    });
  }
});

describe('table bars and zoom keys during a preview', () => {
  const DECK = 'test/pages/editor-r32-4.html';
  const PLATFORMS = ['mac', 'other'];
  const MAIN = '.beeson-edit-top [data-command="preview.slide"]';
  const PREVIEWS = ['preview.backdrop', 'preview.slide', 'preview.steps', 'steps.preview', 'slide.previewTransition'];

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

  let last = null;

  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

  async function previewPage(platform) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width: 1600, height: 1000, motion: true });
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate('window.BeesonEditor.preview.step = 3000');
    await page.waitFor(`window.BeesonEditor.state('preview.backdrop').enabled`);
    await frames(page);
    return page;
  }

  const DRAWN = `(() => {
  const shown = (el) => {
    if (el.hidden) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const parts = {
    frame: '.beeson-overlay .beeson-frame.selected',
    handle: '.beeson-overlay .beeson-handle',
    bar: '.beeson-table-bars .bar',
    grip: '.beeson-table-bars .beeson-grip',
    fill: '.beeson-table-bars .fill',
    corner: '.beeson-table-bars .corner',
  };
  const drawn = {};
  for (const [name, sel] of Object.entries(parts)) {
    const n = [...document.querySelectorAll(sel)].filter(shown).length;
    if (n) drawn[name] = n;
  }
  const a = document.activeElement;
  const s = getSelection();
  const editing = !!(a && a.isContentEditable && s.rangeCount && s.isCollapsed);
  if (editing && !['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(a).caretColor)) drawn.caret = 1;
  return {
    drawn,
    focus: a ? a.localName + (a.isContentEditable ? ':' + a.textContent.slice(0, 12) : '') : null,
    selection: window.BeesonEditor.selection().map((el) => el.localName),
  };
})()`;
  const measure = (page) => page.evaluate(DRAWN);

  const SELECTIONS = {
    cell: async (page) => { await clickText(page, 'section.present tr:nth-child(2) td'); },
    range: async (page) => {
      await clickText(page, 'section.present tr:nth-child(2) td');
      await click(page, 'section.present tr:last-child td:last-child', { modifiers: 'Shift' });
    },
    table: async (page) => {
      await clickText(page, 'section.present tr:nth-child(2) td');
      await press(page, 'Escape');
      await press(page, 'Escape');
    },
  };

  const playingOf = (id) => (id.startsWith('preview.')
    ? `document.querySelector('${MAIN}').getAttribute('aria-pressed') === 'true'`
    : id === 'steps.preview' ? `document.documentElement.classList.contains('beeson-previewing')` : `!!document.querySelector('.beeson-edit-preview')`);

  async function start(page, id) {
    await page.evaluate(`(() => { void window.BeesonEditor.exec(${JSON.stringify(id)}); return true; })()`);
    await page.waitFor(playingOf(id), 3000);
    await frames(page);
  }

  async function select(page, kind) {
    await page.evaluate('Reveal.slide(0)');
    await frames(page);
    await press(page, 'Escape');
    await press(page, 'Escape');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
    await SELECTIONS[kind](page);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
    await frames(page);
    return measure(page);
  }

  async function zoomKey(page, platform, out) {
    const modifiers = platform === 'mac' ? 4 : 2;
    const key = out ? { key: '-', code: 'Minus', windowsVirtualKeyCode: 189 } : { key: '=', code: 'Equal', windowsVirtualKeyCode: 187 };
    for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, ...key, modifiers });
    await frames(page);
  }
  const zoomOf = (page) => page.evaluate(`document.querySelector('input[aria-label=Zoom]').value`);

  for (const platform of PLATFORMS) {
    for (const id of PREVIEWS) {
      test(`nothing of a table selection is drawn while ${id} plays, and Esc draws the same selection again (${platform})`, async () => {
        const page = await previewPage(platform);
        for (const kind of Object.keys(SELECTIONS)) {
          const before = await select(page, kind);
          assert.ok(before.drawn.bar, `the ${kind} selection draws no bar of the table before the preview`);
          await start(page, id);
          const during = await measure(page);
          assert.ok(await page.evaluate(playingOf(id)), `${id} ended before the reading of the ${kind} selection`);
          assert.deepEqual(during.drawn, {}, `drawn over the slide during ${id} with the ${kind} selection`);
          await press(page, 'Escape');
          await frames(page);
          assert.equal(await page.evaluate(playingOf(id)), false, `Esc does not stop ${id} with the ${kind} selection`);
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
          await frames(page);
          assert.deepEqual(await measure(page), before, `the ${kind} selection after Esc that stops ${id}`);
        }
      });
    }

    test(`a zoom key in a text plays Play Slide on at the new zoom, and a key that is written stops it (${platform})`, async () => {
      const page = await previewPage(platform);
      for (const out of [false, true]) {
        await page.evaluate('Reveal.slide(0)');
        await frames(page);
        await clickText(page, 'section.present h2');
        await press(page, 'End');
        await clickText(page, MAIN);
        await page.waitFor(playingOf('preview.slide'), 3000);
        await frames(page);
        assert.equal(await page.evaluate('document.activeElement.localName'), 'h2', 'the caret is not kept in the heading');
        const zoom = Number(await zoomOf(page));
        await zoomKey(page, platform, out);
        const now = Number(await zoomOf(page));
        assert.ok(out ? now < zoom : now > zoom, `the zoom after the key is ${now}, from ${zoom}`);
        assert.ok(await page.evaluate(playingOf('preview.slide')), `a zoom ${out ? 'out' : 'in'} key in a text stops Play Slide`);
        assert.deepEqual((await measure(page)).drawn, {}, 'drawn over the slide after the zoom key');
        const text = await page.evaluate(`document.querySelector('section.present h2').textContent`);
        await press(page, 'q');
        await frames(page);
        assert.equal(await page.evaluate(playingOf('preview.slide')), false, 'a key written into the text does not stop Play Slide');
        assert.equal(await page.evaluate(`document.querySelector('section.present h2').textContent`), `${text}q`);
        await press(page, 'Escape');
        await press(page, 'Escape');
        await page.evaluate(`window.BeesonEditor.exec('edit.undo')`);
        await page.evaluate(`window.BeesonEditor.exec('zoom.fit')`);
        await frames(page);
        assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      }
    });
  }
});

describe('Preview of the Backdrop pane', () => {
  const DECK = 'test/pages/editor-r32-3.html';
  const PLATFORMS = ['mac', 'other'];
  const PANE = '.beeson-edit-inspector [data-command="backdrop.preview"]';

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

  let last = null;

  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

  async function previewPage(platform) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width: 1600, height: 1000, motion: true });
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate('window.BeesonEditor.preview.step = 3000');
    if (!(await page.evaluate(`window.BeesonEditor.state('view.rulers').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.rulers')`);
    await page.waitFor(`window.BeesonEditor.state('preview.backdrop').enabled`);
    await frames(page);
    return page;
  }

  const DRAWN = `(() => {
  const shown = (el) => {
    if (el.hidden) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const parts = {
    frame: '.beeson-overlay .beeson-frame.selected',
    group: '.beeson-overlay .beeson-frame.union',
    hover: '.beeson-overlay .beeson-frame:not(.selected):not(.union):not(.entered)',
    grip: '.beeson-overlay .beeson-grip',
    rotor: '.beeson-overlay .beeson-rotor',
    handle: '.beeson-overlay .beeson-handle',
    size: '.beeson-overlay .beeson-offset',
    snap: '.beeson-overlay .beeson-guide',
    end: '.beeson-line-layer .beeson-line-end',
    cut: '.beeson-backdrop-cuts > *',
    guide: '.beeson-guides .beeson-hand-guide',
  };
  const drawn = {};
  for (const [name, sel] of Object.entries(parts)) {
    const n = [...document.querySelectorAll(sel)].filter(shown).length;
    if (n) drawn[name] = n;
  }
  const sel = window.BeesonEditor.selection();
  const top = document.querySelector('.beeson-ruler[data-axis="x"]');
  if (top && !top.hidden && sel.length) {
    const r = sel[0].getBoundingClientRect(), t = top.getBoundingClientRect();
    const g = top.getContext('2d');
    const px = g.getImageData(Math.round((r.left + r.width / 2 - t.left) * devicePixelRatio), 0, 1, 1).data;
    const bg = g.getImageData(1, 0, 1, 1).data;
    if (px[0] !== bg[0] || px[1] !== bg[1] || px[2] !== bg[2]) drawn.band = 1;
  }
  const a = document.activeElement;
  const s = getSelection();
  const editing = !!(a && a.isContentEditable && s.rangeCount && s.isCollapsed);
  if (editing && !['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(a).caretColor)) drawn.caret = 1;
  return {
    drawn,
    focus: a ? a.localName + (a.isContentEditable ? ':' + a.textContent.slice(0, 12) : '') : null,
    offset: editing ? s.anchorOffset : null,
    selection: sel.map((el) => el.matches('.backdrop') ? 'backdrop' : el.localName + (el.classList.contains('shape') ? '.shape' : '')),
  };
})()`;
  const measure = (page) => page.evaluate(DRAWN);

  const tracing = (page) => page.evaluate('Beeson.backdrops.filter((b) => b.raf).length > 0');

  async function selectBackdrop(page) {
    await page.evaluate('Reveal.slide(0)');
    await frames(page);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
    await page.evaluate(`window.BeesonEditor.exec('preview.selectBackdrop')`);
    await page.waitFor(`!!document.querySelector(${JSON.stringify(PANE)})`, 3000);
    await frames(page);
    return measure(page);
  }

  async function startPane(page) {
    await click(page, PANE);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`nothing of the selection is drawn while Preview of the Backdrop pane traces, and Esc draws the same selection again (${platform})`, async () => {
      const page = await previewPage(platform);
      const before = await selectBackdrop(page);
      assert.deepEqual(before.selection, ['backdrop']);
      assert.ok(before.drawn.frame && before.drawn.grip, 'the selected backdrop draws no frame before the preview');
      await startPane(page);
      assert.ok(await tracing(page), 'the backdrop is not traced');
      const during = await measure(page);
      assert.deepEqual(during.drawn, {}, 'drawn over the slide during Preview of the pane');
      assert.deepEqual(during.selection, ['backdrop']);
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await tracing(page), false, 'Esc does not complete the trace');
      assert.deepEqual(await measure(page), before, 'the selection after Esc');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual((await measure(page)).selection, []);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    });

    test(`the selection is drawn again at the end of the trace of Preview of the Backdrop pane (${platform})`, async () => {
      const page = await previewPage(platform);
      const before = await selectBackdrop(page);
      await startPane(page);
      assert.deepEqual((await measure(page)).drawn, {}, 'drawn over the slide during Preview of the pane');
      await page.waitFor(`!document.documentElement.classList.contains('beeson-playing')`, 15000);
      await frames(page);
      assert.deepEqual(await measure(page), before, 'the selection at the end of the trace');
      const s = await page.evaluate('window.BeesonEditor.status()');
      assert.equal(s.undo, false, 'the preview made an entry of the history');
      assert.equal(s.dirty, false, 'the preview marked the file changed');
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    });

    test(`a press on the slide during Preview of the Backdrop pane draws the selection again (${platform})`, async () => {
      const page = await previewPage(platform);
      const before = await selectBackdrop(page);
      await startPane(page);
      assert.deepEqual((await measure(page)).drawn, {}, 'drawn over the slide during Preview of the pane');
      const box = await page.evaluate(`(() => { const r = document.querySelector('section.present .backdrop').getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + r.height * 0.15 }; })()`);
      await click(page, box);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 995 });
      await frames(page);
      const after = await measure(page);
      assert.deepEqual(after.selection, ['backdrop']);
      assert.deepEqual(after.drawn, before.drawn, 'the selection after a press on the slide');
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    });
  }
});
