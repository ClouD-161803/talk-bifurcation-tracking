import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';

async function openDeck(t, query = '', { deck = 'test-deck.html', ...size } = {}) {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage(size);
  await page.goto(deckUrl(deck, query));
  await page.waitFor(deckSettled);
  const mouse = (type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
  const key = (code, k) => page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: code, key: k })
    .then(() => page.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: code, key: k }));
  const rest = async (x = 960) => {
    await mouse('mouseMoved', x, 1075);
    await page.waitFor(scrubbing);
  };
  const click = async (at, y = 1075) => {
    const x = Math.min(at, 1918);
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y);
    await mouse('mouseReleased', x, y);
  };
  const finger = (type, x, y) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  return { page, mouse, key, rest, click, finger };
}

const past = async (page, ms) => {
  const now = await page.evaluate('performance.now()');
  await page.waitFor(`performance.now() > ${now + ms}`);
};

const unpaced = `Reveal.getSlides().forEach((s) => delete s.dataset.timing); Reveal.configure({ totalTime: null, defaultTiming: null })`;

const look = `(() => {
  const bar = getComputedStyle(document.querySelector('.reveal .progress'));
  const band = getComputedStyle(document.querySelector('.reveal .scrub'));
  return { height: bar.height, opacity: bar.opacity, color: getComputedStyle(document.querySelector('.reveal .progress span')).backgroundColor, band: band.visibility };
})()`;

test('the progress line is left as drawn until the mouse rests at the bottom of the window', { timeout: 60000 }, async (t) => {
  const { page, mouse } = await openDeck(t);
  const before = await page.evaluate(look);
  assert.equal(before.height, '3px');
  assert.equal(before.band, 'hidden');

  await mouse('mouseMoved', 960, 500);
  assert.deepEqual(await page.evaluate(look), before);
  assert.equal(await page.evaluate(`document.querySelector('.reveal').classList.contains('scrubbing')`), false);

  await mouse('mouseMoved', 960, 1075);
  await page.waitFor(scrubbing);
  assert.equal((await page.evaluate(look)).band, 'visible');

  await mouse('mouseMoved', 960, 700);
  assert.deepEqual(await page.evaluate(look), before);
});

const scrubbing = `document.querySelector('.reveal').classList.contains('scrubbing')`;

test('the band is not opened by a pointer that does not rest in the reach', { timeout: 60000 }, async (t) => {
  const { page, mouse } = await openDeck(t);
  await mouse('mouseMoved', 960, 1040);
  await mouse('mouseMoved', 960, 1075);
  await mouse('mouseMoved', 960, 1000);
  await page.evaluate(`new Promise((done) => setTimeout(done, 1000))`);
  assert.equal(await page.evaluate(scrubbing), false, 'the band is open with the pointer 80 px above the bottom edge, without a rest in the reach');

  await mouse('mouseMoved', 960, 1075);
  await page.waitFor(scrubbing);
});

test('the reach follows the bottom edge of a window that grows taller at the same scale', { timeout: 60000 }, async (t) => {
  const { page, mouse } = await openDeck(t, '', { width: 1920, height: 1200 });
  const scale = await page.evaluate('Reveal.getScale()');
  await page.evaluate(`window.resized = 0; addEventListener('resize', () => { resized += 1; })`);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1350, deviceScaleFactor: 1, mobile: false });
  await page.waitFor(`resized && innerHeight === 1350`);
  assert.equal(await page.evaluate('Reveal.getScale()'), scale);
  await mouse('mouseMoved', 960, 1195);
  await past(page, 400);
  assert.equal(await page.evaluate(scrubbing), false, 'the band is opened by a rest at the old bottom edge');
  await mouse('mouseMoved', 960, 1340);
  await page.waitFor(scrubbing);

  await mouse('mouseMoved', 960, 700);
  await page.evaluate('resized = 0');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 540, deviceScaleFactor: 1, mobile: false });
  await page.waitFor(`resized && innerHeight === 540`);
  assert.ok(await page.evaluate(`Reveal.getScale() < ${scale}`));
  await mouse('mouseMoved', 100, 535);
  await past(page, 400);
  assert.equal(await page.evaluate(scrubbing), false, 'the band is opened by a rest beside it');
  await mouse('mouseMoved', 960, 535);
  await page.waitFor(scrubbing);
});

test('the open band is closed by a pointer above its rows of numbers and names', { timeout: 60000 }, async (t) => {
  const { page, mouse } = await openDeck(t);
  await mouse('mouseMoved', 960, 1075);
  await page.waitFor(scrubbing);
  await mouse('mouseMoved', 960, 975);
  assert.equal(await page.evaluate(scrubbing), false, 'the band is open with the pointer 105 px above the bottom edge');
});

const tickX = (i) => `(() => {
  const band = document.querySelector('.scrub').getBoundingClientRect();
  return band.left + band.width * parseFloat(document.querySelectorAll('.scrub-tick')[${i}].style.left) / 100;
})()`;
const shown = `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, y: (r.top + r.bottom) / 2 }; };
  const band = box(document.querySelector('.scrub'));
  return {
    band,
    ticks: [...document.querySelectorAll('.scrub-tick')].map((t) => ({
      number: t.firstChild.textContent, x: band.left + (band.right - band.left) * parseFloat(t.style.left) / 100,
      numbered: getComputedStyle(t.firstChild).visibility === 'visible', classes: [...t.classList].slice(1),
    })),
    names: [...document.querySelectorAll('.scrub-name')].map((n) => ({ text: n.textContent, ...box(n), classes: [...n.classList].slice(1) })),
    heading: document.querySelector('.scrub-heading').textContent,
  };
})()`;
const current = `({ h: Reveal.getIndices().h, f: Reveal.getIndices().f, heading: Reveal.getCurrentSlide().querySelector('h1, h2').textContent })`;

test('a click on the progress line before the mouse rests moves the show on, as a click on a slide does', { timeout: 60000 }, async (t) => {
  const { page, mouse } = await openDeck(t);
  await mouse('mousePressed', 1400, 1078);
  await mouse('mouseReleased', 1400, 1078);
  await page.waitFor(`Reveal.getIndices().h === 1`);
});

test('the band has a tick with the number of each numbered slide', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t);
  await page.evaluate(unpaced);
  await rest();
  const labels = await page.evaluate(`[...document.querySelectorAll('.scrub-tick')].map((t) => t.firstChild.textContent)`);
  const total = await page.evaluate('Reveal.getTotalSlides()');
  assert.deepEqual(labels, Array.from({ length: total }, (_, i) => String(i + 1)));
  assert.equal(await page.evaluate(`document.querySelectorAll('.scrub-time').length`), 0);
});

test('the name of each section is written over the first tick of its section, and that of the closing slide at the end', { timeout: 60000 }, async (t) => {
  const { page, rest, click } = await openDeck(t);
  await rest();
  const deck = await page.evaluate(`(() => {
    const numbered = Reveal.getSlides();
    return {
      sections: [...document.querySelectorAll('.reveal .slides > section.section')].map((s) => ({ name: s.querySelector('h2').textContent, first: numbered.indexOf(s.nextElementSibling) })),
      closing: document.querySelector('.reveal .slides > section.closing h1').textContent,
    };
  })()`);
  assert.ok(deck.sections.length > 1 && deck.sections.every((s) => s.first >= 0), 'the demo deck has two sections that start with a numbered slide');
  const band = await page.evaluate(shown);
  assert.deepEqual(band.names.map((n) => n.text), [...deck.sections.map((s) => s.name), deck.closing]);
  for (const [k, section] of deck.sections.entries()) {
    const tick = band.ticks[section.first];
    assert.ok(tick.classes.includes('section') && tick.numbered, `the first tick of ${section.name} is taller and has its number`);
    assert.ok(Math.abs(band.names[k].left - tick.x) < 1.5, `${section.name} starts at ${band.names[k].left}, and its first tick is at ${tick.x}`);
  }
  assert.ok(Math.abs(band.names.at(-1).right - band.band.right) < 1.5, 'the name of the closing slide ends at the end of the band');
  assert.deepEqual(band.ticks.filter((tick) => tick.numbered).map((tick) => tick.number), [...deck.sections.map((s) => String(s.first + 1)), String(band.ticks.length)]);

  const name = band.names[1];
  await click(name.left + 10, name.y);
  await page.waitFor(`Reveal.getCurrentSlide().classList.contains('section') && Reveal.getCurrentSlide().querySelector('h2').textContent === ${JSON.stringify(name.text)}`);
  await page.waitFor(`document.querySelector('.scrub-name.now')?.textContent === ${JSON.stringify(name.text)}`);
  await click(band.names.at(-1).right - 10, name.y);
  await page.waitFor(`Reveal.getCurrentSlide().classList.contains('closing')`);
});

test('the number and time of the last tick are not met by those of a section that starts before it', { timeout: 60000 }, async (t) => {
  const { page, mouse } = await openDeck(t, '', { width: 844, height: 600 });
  await page.evaluate(`(() => {
    ${unpaced};
    const closing = document.querySelector('.reveal .slides > section.closing');
    while (Reveal.getSlides().length < 41) {
      const slide = document.createElement('section');
      slide.innerHTML = '<h2>More</h2>';
      closing.before(slide);
      Reveal.sync();
    }
    const section = document.createElement('section');
    section.className = 'section';
    section.dataset.visibility = 'uncounted';
    section.innerHTML = '<h2>Chapter three</h2>';
    Reveal.getSlides().at(-3).before(section);
    Reveal.configure({ totalTime: 3600 });
    Reveal.sync();
  })()`);
  await mouse('mouseMoved', 422, 595);
  await page.waitFor(scrubbing);
  const ticks = await page.evaluate(`[...document.querySelectorAll('.scrub-tick')].map((t) => {
    const r = t.getBoundingClientRect();
    return { text: t.firstChild.textContent, left: r.left, right: r.right, quiet: t.classList.contains('quiet'), section: t.classList.contains('section') };
  })`);
  assert.equal(ticks.length, 41);
  assert.ok(ticks.at(-3).section, 'the third-to-last tick starts a section');
  const last = ticks.at(-1);
  assert.ok(!last.quiet, 'the last tick has its number');
  for (const tick of ticks.slice(0, -1).filter((tick) => !tick.quiet)) {
    assert.ok(tick.right < last.left, `the box of ${tick.text} ends at ${tick.right} px, and that of ${last.text} starts at ${last.left} px`);
  }
});

test('a click on a tick ahead shows its slide at its first step, and a click on a tick behind shows every step',{ timeout: 60000 }, async (t) => {
  const { page, mouse, rest, click } = await openDeck(t);
  await rest();
  const deck = await page.evaluate(`(() => {
    const slides = Reveal.getSlides();
    const stepped = slides.map((s, i) => i).filter((i) => i > 0 && i < slides.length - 1 && slides[i].querySelector('.fragment'));
    return { ahead: stepped[1], behind: stepped[0], last: slides.length - 1, h: slides.map((s) => Reveal.getIndices(s).h) };
  })()`);
  assert.ok(deck.behind > 0 && deck.ahead > deck.behind, 'the demo deck has two slides with steps between its first and its last numbered slide');

  const x = await page.evaluate(tickX(deck.ahead));
  await mouse('mouseMoved', x, 1075);
  const hovered = await page.evaluate(shown);
  assert.ok(hovered.ticks[deck.ahead].classes.includes('hover'));
  assert.notEqual(hovered.heading, '');
  await click(x);
  await page.waitFor(`Reveal.getIndices().h === ${deck.h[deck.ahead]}`);
  assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('.fragment.visible').length`), 0);
  await page.waitFor(`document.querySelectorAll('.scrub-tick')[${deck.ahead}].classList.contains('now')`);

  await click(await page.evaluate(tickX(deck.last)));
  await page.waitFor(`Reveal.getIndices().h === ${deck.h[deck.last]}`);
  await click(await page.evaluate(tickX(deck.behind)));
  await page.waitFor(`Reveal.getIndices().h === ${deck.h[deck.behind]}`);
  const steps = await page.evaluate(`[Reveal.getCurrentSlide().querySelectorAll('.fragment.visible').length, Reveal.getCurrentSlide().querySelectorAll('.fragment').length]`);
  assert.equal(steps[0], steps[1]);
});

test('the last viewed slide is shown on the band, and a click on it shows the step left', { timeout: 60000 }, async (t) => {
  const { page, key, rest, click } = await openDeck(t);
  const deck = await page.evaluate(`(() => {
    const slides = Reveal.getSlides();
    const i = slides.findIndex((s, i) => i > 0 && i < slides.length - 2 && s.querySelectorAll('.fragment').length > 2);
    return { i, last: slides.length - 1, h: slides.map((s) => Reveal.getIndices(s).h) };
  })()`);
  assert.ok(deck.i > 0, 'the demo deck has a slide with three steps before its last two numbered slides');
  await page.evaluate(`Reveal.slide(${deck.h[deck.i]}, 0, 1)`);
  const left = await page.evaluate(current);
  assert.equal(left.f, 1);

  await rest();
  await click(await page.evaluate(tickX(deck.last)));
  await page.waitFor(`Reveal.getIndices().h === ${deck.h[deck.last]}`);
  await page.waitFor(`document.querySelector('.scrub-tick.viewed')`);
  let band = await page.evaluate(shown);
  assert.deepEqual(band.ticks.filter((tick) => tick.classes.includes('viewed')).map((tick) => tick.number), [String(deck.i + 1)]);
  assert.ok(band.ticks[deck.i].numbered, 'the last viewed slide has its number');
  await click(band.ticks[deck.i].x);
  await page.waitFor(`Reveal.getIndices().h === ${left.h}`);
  assert.deepEqual(await page.evaluate(current), left);
  await page.waitFor(`document.querySelectorAll('.scrub-tick')[${deck.last}].classList.contains('viewed')`);

  await key(39, 'ArrowRight');
  await rest();
  band = await page.evaluate(shown);
  assert.ok(band.ticks[deck.last].classes.includes('viewed'));
  const before = await page.evaluate(current);
  await key(35, 'End');
  await page.waitFor(`Reveal.isLastSlide()`);
  await rest();
  band = await page.evaluate(shown);
  assert.deepEqual(band.ticks.filter((tick) => tick.classes.includes('viewed')).map((tick) => tick.number), [String(deck.h.indexOf(before.h) + 1)]);
});

test('the slide at which the overview was opened is the last viewed slide after a slide is chosen in it', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t);
  const h = await page.evaluate(`Reveal.getSlides().map((s) => Reveal.getIndices(s).h)`);
  await page.evaluate(`Reveal.slide(${h[1]})`);
  await page.evaluate(`Reveal.slide(${h[2]})`);
  await page.evaluate(`Reveal.toggleOverview(true)`);
  for (const k of [3, 4, 5]) await page.evaluate(`Reveal.slide(${h[k]})`);
  await page.evaluate(`Reveal.toggleOverview(false)`);
  await rest();
  const band = await page.evaluate(shown);
  assert.deepEqual(band.ticks.filter((tick) => tick.classes.includes('viewed')).map((tick) => tick.number), ['3']);
});

test('the slide at which the overview was opened is the last viewed slide after a click on a slide in it', { timeout: 60000 }, async (t) => {
  const { page, key, rest, click } = await openDeck(t);
  const h = await page.evaluate(`Reveal.getSlides().map((s) => Reveal.getIndices(s).h)`);
  assert.ok(h[5] - (h[2] + 2) > 1, 'the sixth numbered slide is more than one slide after the second slide after the third');
  await page.evaluate(`Reveal.slide(${h[2]})`);
  await page.evaluate(`Reveal.toggleOverview(true)`);
  await key(39, 'ArrowRight');
  await key(39, 'ArrowRight');
  await page.waitFor(`Reveal.getIndices().h === ${h[2] + 2}`);
  const box = `(() => {
    const r = Reveal.getSlides()[5].getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  })()`;
  for (let k = 0; k < 10 && await page.evaluate('Reveal.isOverview()'); k += 1) {
    const { x, y } = await page.evaluate(box);
    await click(x, y);
  }
  await page.waitFor(`!Reveal.isOverview() && Reveal.getIndices().h === ${h[5]}`);
  await rest();
  const band = await page.evaluate(shown);
  assert.deepEqual(band.ticks.filter((tick) => tick.classes.includes('viewed')).map((tick) => tick.number), ['3']);
  assert.deepEqual(band.names.filter((name) => name.classes.includes('viewed')), []);
});

test('a key closes the band', { timeout: 60000 }, async (t) => {
  const { page, key, rest } = await openDeck(t);
  await rest();
  await key(39, 'ArrowRight');
  assert.equal(await page.evaluate(scrubbing), false);
});

test('the key G does not open the jump box of reveal.js', { timeout: 60000 }, async (t) => {
  const { page, key } = await openDeck(t);
  await key(71, 'g');
  assert.equal(await page.evaluate(`document.querySelector('.jump-to-slide')`), null);
});

test('the start time of each slide is shown with totalTime, as in the speaker view', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t);
  const total = await page.evaluate('Reveal.getTotalSlides()');
  await page.evaluate(unpaced);
  await page.evaluate(`Reveal.getSlides()[1].dataset.timing = '90'; Reveal.configure({ totalTime: ${90 + 60 * (total - 1)} })`);
  await rest();
  const times = await page.evaluate(`[...document.querySelectorAll('.scrub-time')].map((t) => t.textContent)`);
  assert.deepEqual(times.slice(0, 4), ['0:00', '1:00', '2:30', '3:30']);
  assert.equal(times.length, total);
});

const phone = { width: 844, height: 390, mobile: true };

test('a finger at rest in the reach opens the band, and the slide of the tick under it is shown when it is lifted', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  await page.evaluate('Reveal.slide(3)');
  const before = await page.evaluate('Reveal.getIndices()');
  await finger('touchStart', 200, 375);
  await page.waitFor(scrubbing);
  const band = await page.evaluate(shown);
  const target = band.ticks.at(-2);
  await finger('touchMove', target.x, 372);
  await page.waitFor(`document.querySelectorAll('.scrub-tick')[${band.ticks.length - 2}].classList.contains('hover')`);
  assert.deepEqual(await page.evaluate('Reveal.getIndices()'), before);
  const heading = await page.evaluate(`document.querySelector('.scrub-heading').textContent`);
  assert.ok(heading.startsWith(`${target.number} · `), `the number of the tick is written before the heading, in "${heading}"`);
  await finger('touchEnd');
  await page.waitFor(`Reveal.getSlidePastCount() === ${band.ticks.length - 2}`);
  assert.equal(await page.evaluate(scrubbing), false);
  assert.ok(heading.endsWith((await page.evaluate(current)).heading));
});

const tickOf = (slide) => `(() => {
  const band = document.querySelector('.scrub').getBoundingClientRect();
  return band.left + band.width * Reveal.getSlidePastCount(${slide}) / (Reveal.getTotalSlides() - 1);
})()`;

test('the click that Chrome makes of a finger lifted from the band without a move does not move the show on', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  const k = await page.evaluate(`Reveal.getSlides().map((s, i) => i).filter((i) => i > 0 && Reveal.getSlides()[i].querySelector('.fragment'))[1]`);
  assert.ok(k > 0, 'the demo deck has a second slide with steps');
  await page.evaluate(`window.clicks = 0; window.addEventListener('click', () => { clicks += 1; }, true)`);
  const x = await page.evaluate(tickOf(`Reveal.getSlides()[${k}]`));
  await finger('touchStart', x, 375);
  await page.waitFor(scrubbing);
  await page.waitFor(`document.querySelectorAll('.scrub-tick')[${k}].classList.contains('hover')`);
  await finger('touchEnd');
  await page.waitFor(`clicks === 1`);
  assert.equal(await page.evaluate(`Reveal.getSlidePastCount()`), k);
  assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('.fragment.visible').length`), 0);
});

test('a click more than 500 ms after a finger slid along the band and lifted is not canceled', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  await finger('touchStart', 200, 375);
  await page.waitFor(scrubbing);
  const band = await page.evaluate(shown);
  await finger('touchMove', band.ticks.at(-2).x, 372);
  await page.waitFor(`document.querySelectorAll('.scrub-tick')[${band.ticks.length - 2}].classList.contains('hover')`);
  await finger('touchEnd');
  await page.waitFor(`Reveal.getSlidePastCount() === ${band.ticks.length - 2}`);
  await past(page, 500);
  const mode = await page.evaluate('document.documentElement.dataset.theme');
  await page.evaluate(`document.querySelector('.theme-switch').click()`);
  await page.waitFor(`document.documentElement.dataset.theme !== ${JSON.stringify(mode)}`);
});

test('a finger picks a name as the mouse does, and the heading over the band shows the name under it', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  const at = {
    'Thank you': `Reveal.getCurrentSlide().classList.contains('closing')`,
    'Chapter two': `Reveal.getCurrentSlide().classList.contains('section') && Reveal.getCurrentSlide().querySelector('h2').textContent === 'Chapter two'`,
  };
  for (const [text, reached] of Object.entries(at)) {
    await page.evaluate('Reveal.slide(3)');
    await finger('touchStart', 200, 375);
    await page.waitFor(scrubbing);
    const name = (await page.evaluate(shown)).names.find((n) => n.text === text);
    assert.ok(name, `the band has the name ${text}`);
    await finger('touchMove', (name.left + name.right) / 2, name.y);
    await page.waitFor(`document.querySelector('.scrub-heading').textContent === ${JSON.stringify(text)}`);
    await finger('touchEnd');
    await page.waitFor(reached);
  }
});

test('a finger that rests on a name and is lifted without a move shows the slide of the name', { timeout: 60000 }, async (t) => {
  const { page, key, finger } = await openDeck(t, '', phone);
  await page.evaluate('Reveal.slide(3)');
  await finger('touchStart', 200, 375);
  await page.waitFor(scrubbing);
  const name = (await page.evaluate(shown)).names.find((n) => n.text === 'Chapter two');
  assert.ok(name, 'the band has the name Chapter two');
  await key(16, 'Shift');
  await finger('touchEnd');
  await page.waitFor(`!(${scrubbing})`);

  await finger('touchStart', (name.left + name.right) / 2, name.y);
  await page.waitFor(scrubbing);
  assert.equal(await page.evaluate(`document.querySelector('.scrub-name.hover')?.textContent ?? null`), 'Chapter two');
  await finger('touchEnd');
  await page.waitFor(`Reveal.getCurrentSlide().classList.contains('section') && Reveal.getCurrentSlide().querySelector('h2').textContent === 'Chapter two'`);
});

test('a new finger closes a band left open by a finger whose lift was lost, and a second finger does not', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  await finger('touchStart', 200, 375);
  await page.waitFor(scrubbing);
  const press = (primary) => page.evaluate(`document.querySelector('.reveal .slides').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4242, pointerType: 'touch', isPrimary: ${primary}, bubbles: true, clientX: 400, clientY: 375 }))`);
  await press(false);
  assert.equal(await page.evaluate(scrubbing), true, 'the band is closed by a second finger');
  await press(true);
  assert.equal(await page.evaluate(scrubbing), false, 'the band is left open by a new finger');
  await page.waitFor(scrubbing);
});

test('a finger on a band closed by a key does not show another slide when it is lifted', { timeout: 60000 }, async (t) => {
  const { page, key, finger } = await openDeck(t, '', phone);
  await page.evaluate('Reveal.slide(3)');
  const before = await page.evaluate('Reveal.getIndices()');
  await finger('touchStart', 200, 375);
  await page.waitFor(scrubbing);
  const band = await page.evaluate(shown);
  await key(16, 'Shift');
  assert.equal(await page.evaluate(scrubbing), false);
  await finger('touchMove', band.ticks.at(-2).x, 372);
  await finger('touchEnd');
  assert.deepEqual(await page.evaluate('Reveal.getIndices()'), before);
});

test('a finger that rests on a surface low on a slide drags the surface, and it does not open the band', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  const h = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('.surface'))`);
  assert.ok(h > 0, 'the demo deck has a slide with a surface');
  await page.evaluate(`Reveal.slide(${h})`);
  const x = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('.surface').getBoundingClientRect(); return (r.left + r.right) / 2; })()`);
  await page.waitFor(`!!document.elementFromPoint(${x}, 365)?.closest('.surface')`, 60000);
  await finger('touchStart', x, 365);
  await past(page, 300);
  await finger('touchMove', x + 100, 365);
  assert.equal(await page.evaluate(scrubbing), false);
  await finger('touchEnd');
  assert.equal(await page.evaluate('Reveal.getIndices().h'), h);
});

test('a finger that leaves the band upward does not show another slide or step', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  await page.evaluate('Reveal.slide(3)');
  const before = await page.evaluate('Reveal.getIndices()');
  await page.evaluate(`(() => {
    const r = window.record = { events: [], closed: false };
    const t0 = performance.now();
    const add = (text) => r.events.push(\`\${Math.round(performance.now() - t0)} ms \${text}\`);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) addEventListener(type, (e) => add(\`\${type} of a \${e.pointerType} at y \${Math.round(e.clientY)}\`), true);
    const reveal = document.querySelector('.reveal');
    new MutationObserver(() => {
      const open = reveal.classList.contains('scrubbing');
      add(open ? 'open' : 'closed');
      r.closed = !open && r.events.some((e) => e.includes('pointermove of a touch at y 250'));
    }).observe(reveal, { attributeFilter: ['class'] });
    return true;
  })()`);
  const record = () => page.evaluate('window.record.events.join(", ")');
  assert.equal(await page.evaluate(scrubbing), false, 'the band is open before the finger is down');
  await finger('touchStart', 600, 375);
  await page.waitFor(scrubbing);
  await finger('touchMove', 600, 250);
  await page.waitFor('window.record.closed', 5000).catch(async () => assert.fail(`the band is not closed by the move: ${await record()}`));
  await finger('touchMove', 500, 250);
  await finger('touchEnd');
  await page.evaluate(`new Promise((done) => setTimeout(done, 1000))`);
  assert.deepEqual(await page.evaluate('Reveal.getIndices()'), before);
});

test('a tap in the reach moves the show on, and it does not open the band', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', phone);
  const before = await page.evaluate(current);
  await finger('touchStart', 600, 388);
  await finger('touchEnd');
  await page.waitFor(`Reveal.getIndices().h === ${before.h + 1}`);
  await past(page, 200);
  assert.equal(await page.evaluate(scrubbing), false);
});

const counted = `(() => {
  window.calls = { enter: 0, exit: 0 };
  let full = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => full });
  document.documentElement.requestFullscreen = () => { calls.enter++; full = document.documentElement; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
  document.exitFullscreen = () => { calls.exit++; full = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
})()`;

test('F enters full screen and leaves it', { timeout: 60000 }, async (t) => {
  const { page, key } = await openDeck(t);
  await page.evaluate(counted);
  await key(70, 'f');
  assert.deepEqual(await page.evaluate('calls'), { enter: 1, exit: 0 });
  await key(70, 'f');
  assert.deepEqual(await page.evaluate('calls'), { enter: 1, exit: 1 });
});

const systemFull = (on, outerWidth = 1920) => `(() => {
  for (const [k, v] of Object.entries({ outerWidth: ${outerWidth}, outerHeight: ${on ? 1080 : 1000}, innerHeight: 1000 })) Object.defineProperty(window, k, { configurable: true, value: v });
  for (const [k, v] of Object.entries({ width: 1920, height: 1080 })) Object.defineProperty(screen, k, { configurable: true, value: v });
  window.dispatchEvent(new Event('resize'));
})()`;

test('a window in the full screen of the system is taken into full screen at the next key', { timeout: 60000 }, async (t) => {
  const { page, key } = await openDeck(t);
  await page.evaluate(counted);
  await page.evaluate(systemFull(true));
  await key(39, 'ArrowRight');
  assert.deepEqual(await page.evaluate('calls'), { enter: 1, exit: 0 });

  await page.evaluate('document.exitFullscreen()');
  await page.evaluate(systemFull(true));
  await key(39, 'ArrowRight');
  assert.deepEqual(await page.evaluate('calls'), { enter: 1, exit: 1 });

  await page.evaluate(systemFull(false));
  await page.evaluate(systemFull(true));
  await key(37, 'ArrowLeft');
  assert.deepEqual(await page.evaluate('calls'), { enter: 2, exit: 1 });
});

test('a maximized window of Windows, wider than the screen by its frame, is not taken into full screen', { timeout: 60000 }, async (t) => {
  const { page, key } = await openDeck(t);
  await page.evaluate(counted);
  await page.evaluate(systemFull(true, 1936));
  await key(39, 'ArrowRight');
  assert.deepEqual(await page.evaluate('calls'), { enter: 0, exit: 0 });
});

test('a deck in a window as narrow as a phone is shown as slides, not as the scroll view of reveal.js', { timeout: 60000 }, async (t) => {
  const { page } = await openDeck(t, '', { width: 390, height: 844, mobile: true });
  assert.equal(await page.evaluate('Reveal.isScrollView()'), false);
});

test('a window that does not cover the screen is not taken into full screen', { timeout: 60000 }, async (t) => {
  const { page, key } = await openDeck(t);
  await page.evaluate(counted);
  await page.evaluate(systemFull(false));
  await key(39, 'ArrowRight');
  assert.deepEqual(await page.evaluate('calls'), { enter: 0, exit: 0 });
});

test('the title, section, and closing slides are not numbered, and the slides after the closing slide are numbered A1, A2', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl('test/pages/numbers.html'));
  await page.waitFor(deckSettled);
  const numbers = await page.evaluate(`(async () => {
    const out = [];
    for (let i = 0; i < document.querySelectorAll('.reveal .slides > section').length; i += 1) {
      Reveal.slide(i);
      await new Promise((done) => setTimeout(done, 50));
      out.push(document.querySelector('.reveal .slide-number').textContent.replace(/\\s+/g, ' ').trim());
    }
    return out;
  })()`);
  assert.deepEqual(numbers, ['', '', '1 / 3', '2 / 3', '', '3 / 3', '', 'A1', 'A2']);

  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 1075, button: 'none' });
  await page.waitFor(scrubbing);
  const labels = await page.evaluate(`[...document.querySelectorAll('.scrub-tick')].map((t) => t.firstChild.textContent)`);
  assert.deepEqual(labels, ['1', '2', '3']);

  const runs = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].map((s) => s.querySelector('.run')?.textContent ?? '')`);
  assert.deepEqual(runs, ['', '', 'Chapter one', 'Chapter one', '', 'Chapter two', '', 'Appendix slides', 'Appendix slides']);
});

test('the section slides after the closing slide are lettered A, B in their labels, running heads, outline lists, and names on the band, past a hidden one', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t, '', { deck: 'test/pages/appendix-sections.html' });
  await rest();
  const names = await page.evaluate(`[...document.querySelectorAll('.scrub-name')].map((n) => n.textContent)`);
  assert.deepEqual(names, ['Chapter one', 'Thank you', 'A: Convergence proofs', 'B: Data']);

  const slides = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].map((s) => {
    const h = s.querySelector('h1, h2');
    const label = getComputedStyle(h, '::before').content;
    return { heading: h.textContent, letter: h.dataset.appendixLetter ?? '', drawn: label !== 'none' && label !== 'normal', run: s.querySelector('.run')?.textContent ?? '' };
  })`);
  assert.deepEqual(slides.map((s) => [s.heading, s.letter, s.drawn]), [
    ['A title', '', false], ['Chapter one', '', false], ['First', '', false], ['Second', '', false], ['Thank you', '', false], ['Loose slide', '', false],
    ['Convergence proofs', 'A', true], ['Proof one', '', false], ['After the hidden part', '', false], ['Numerical data', 'B', true], ['Table one', '', false],
  ]);
  assert.deepEqual(slides.map((s) => s.run), ['', '', 'Chapter one', 'Chapter one', '', 'Appendix slides', '', 'Appendix A: Convergence proofs', 'Appendix A: Convergence proofs', '', 'Appendix B: Data']);

  const outline = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')[6].querySelectorAll('.outline > li')].map((li) => [li.textContent, li.classList.contains('now'), getComputedStyle(li, '::before').content !== 'none'])`);
  assert.deepEqual(outline, [['Chapter one', false, true], ['Appendix A: Convergence proofs', true, false], ['Appendix B: Numerical data', false, false]]);

});

test('a hidden slide does not take a number, before the closing slide or after it, in the show, in the print view, and on the band', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t, '', { deck: 'test/pages/appendix-sections.html' });
  const deck = 'test/pages/appendix-sections.html';
  const shown = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].map((s, i) => {
    Reveal.slide(i);
    return [s.querySelector('h1, h2').textContent, document.querySelector('.reveal .slide-number').textContent.replace(/\\s+/g, ' ').trim()];
  })`);
  const NUMBERS = [
    ['A title', ''], ['Chapter one', ''], ['First', '1 / 2'], ['Second', '2 / 2'], ['Thank you', ''], ['Loose slide', 'A1'],
    ['Convergence proofs', 'A2'], ['Proof one', 'A3'], ['After the hidden part', 'A4'], ['Numerical data', 'A5'], ['Table one', 'A6'],
  ];
  assert.deepEqual(shown, NUMBERS);

  await page.evaluate(`Reveal.slide(${NUMBERS.findIndex(([h]) => h === 'Table one')})`);
  await rest();
  await page.evaluate('Reveal.slide(0)');
  await page.waitFor(`document.querySelector('.scrub-name.viewed')?.textContent === 'A6'`);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.scrub-tick')].map((t) => t.firstChild.textContent)`), ['1', '2']);

  await printView(page, deckUrl(deck, 'print-pdf&still'));
  const printed = await page.evaluate(`[...document.querySelectorAll('.pdf-page')].map((p) => [p.querySelector('h1, h2').textContent, p.querySelector('.slide-number-pdf')?.textContent.replace(/\\s+/g, '') ?? ''])`);
  assert.deepEqual(printed, NUMBERS.map(([h, n]) => [h, n.replace(/ /g, '')]));
});

test('the slides of a stack have ticks, and a step down a stack is not a jump', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t, '', { deck: 'test/pages/stack.html' });
  const at = (heading) => `Reveal.getCurrentSlide().querySelector('h1, h2').textContent === ${JSON.stringify(heading)}`;
  await rest();
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.scrub-tick')].map((t) => t.firstChild.textContent)`), ['1', '2', '3', '4']);

  await page.evaluate('Reveal.slide(1)');
  for (const heading of ['Second', 'Third', 'Fourth']) {
    await page.evaluate('Reveal.next()');
    await page.waitFor(at(heading));
  }
  await past(page, 100);
  assert.equal(await page.evaluate(`document.querySelector('.scrub .viewed')`), null, 'a slide is marked as the last viewed slide');

  await page.evaluate('Reveal.slide(0)');
  await page.waitFor(`document.querySelector('.scrub-tick.viewed')?.firstChild.textContent === '4'`);
});

test('a last viewed slide without a tick has its name at its end of the band', { timeout: 60000 }, async (t) => {
  const { page, rest, click } = await openDeck(t, '', { deck: 'test/pages/numbers.html' });
  const at = (heading) => `Reveal.getCurrentSlide().querySelector('h1, h2').textContent === ${JSON.stringify(heading)}`;
  const viewed = `(() => {
    const name = document.querySelector('.scrub-name.viewed');
    const [band, box] = [document.querySelector('.scrub'), name].map((el) => el?.getBoundingClientRect());
    return name && { text: name.textContent, left: box.left - band.left, right: band.right - box.right, y: (box.top + box.bottom) / 2 };
  })()`;
  const h = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.dataset.appendix === '2')`);
  assert.ok(h > 0, 'the page has a second slide in its appendix');

  await page.evaluate(`Reveal.slide(${h})`);
  await rest();
  await click(960);
  await page.waitFor(at('Second'));
  await page.waitFor(`document.querySelector('.scrub-name.viewed')`);
  let name = await page.evaluate(viewed);
  assert.equal(name.text, 'A2');
  assert.ok(Math.abs(name.right) < 1.5, `the name of the appendix slide ends ${name.right} px before the end of the band`);
  await click(1900, name.y);
  await page.waitFor(at('Appendix two'));

  await page.evaluate(`Reveal.slide(0)`);
  await click(960);
  await page.waitFor(at('Second'));
  await page.waitFor(`document.querySelector('.scrub-name.viewed')?.textContent === 'A title'`);
  name = await page.evaluate(viewed);
  assert.ok(Math.abs(name.left) < 1.5, `the name of the title slide starts ${name.left} px after the start of the band`);
  await click(20, name.y);
  await page.waitFor(at('A title'));
});

test('the names on a narrow band are cut, and they do not run into each other', { timeout: 60000 }, async (t) => {
  const { page, finger } = await openDeck(t, '', { width: 390, height: 844, mobile: true });
  await page.evaluate(`document.querySelector('.reveal .slides > section.section').dataset.run = 'The name of a section that is far too long for a phone'`);
  await finger('touchStart', 100, 830);
  await page.waitFor(scrubbing);
  const band = await page.evaluate(`(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; };
    return { ...box(document.querySelector('.scrub')), names: [...document.querySelectorAll('.scrub-name')].map((n) => ({ ...box(n), cut: n.scrollWidth > n.clientWidth })) };
  })()`);
  await finger('touchEnd');
  assert.equal(band.names.length, 3);
  assert.ok(band.names[0].cut, 'the long name is cut');
  for (const [k, name] of band.names.entries()) {
    assert.ok(name.left >= band.left - 0.5 && name.right <= band.right + 0.5, `name ${k} is inside the band`);
    if (k) assert.ok(name.left >= band.names[k - 1].right, `name ${k} starts after the end of name ${k - 1}`);
  }
});

test('the title over the band is not cut at its descenders', { timeout: 60000 }, async (t) => {
  const { page, rest } = await openDeck(t);
  await rest();
  const room = await page.evaluate(`(() => {
    const card = document.querySelector('.scrub-heading');
    card.textContent = 'gyp';
    const mark = document.createElement('span');
    mark.style.cssText = 'display: inline-block; width: 0; height: 0';
    card.append(mark);
    const baseline = mark.getBoundingClientRect().top;
    const style = getComputedStyle(card);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
    const descent = ctx.measureText('gyp').actualBoundingBoxDescent;
    return card.getBoundingClientRect().bottom - (baseline + descent);
  })()`);
  assert.ok(room >= 0, `the descenders run ${-room} px past the bottom of the title`);
});
