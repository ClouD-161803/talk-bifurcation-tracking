import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deckUrl, launch, printView } from './chrome.mjs';
import { pptx } from './pptx.mjs';
import { recorder } from './record.mjs';
import { recordScenes, showFirstFrames } from './scenes.mjs';
import { listAnimations, recordAnimation } from './animations.mjs';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--still');
if (unknown.length) {
  console.error(`unknown option ${unknown.join(', ')}. Usage: node scripts/export-pptx.mjs [--still] [deck] [output]`);
  process.exit(1);
}
const still = args.includes('--still');
const [deck = 'index.html', output = 'slides.pptx'] = args.filter((arg) => arg !== '--still');

const listSteps = `[...document.querySelectorAll('.pdf-page')].map((step) => {
  const page = step.getBoundingClientRect();
  const notes = [...step.querySelectorAll('aside.notes')]
    .flatMap((aside) => {
      const copy = aside.cloneNode(true);
      for (const li of copy.querySelectorAll('li')) {
        li.prepend('\\n\\n– ');
        li.append('\\n\\n');
      }
      return copy.textContent.split(/\\n\\s*\\n/);
    })
    .map((text) => text.replace(/\\s+/g, ' ').trim())
    .filter(Boolean);
  const videos = [...step.querySelectorAll(${JSON.stringify(still ? 'video' : 'video, .viewer-still')})]
    .filter((video) => video.getClientRects().length && getComputedStyle(video).visibility !== 'hidden'
      && !video.closest('.fragment:not(.visible)'))
    .map((video) => {
      const box = video.getBoundingClientRect();
      if (video.localName !== 'video') {
        return { scene: Number(video.dataset.still), x: box.x - page.x, y: box.y - page.y, width: box.width, height: box.height };
      }
      const [left, top] = getComputedStyle(video).objectPosition.split(' ').map((p) => parseFloat(p) / 100);
      const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
      const width = video.videoWidth * scale, height = video.videoHeight * scale;
      return {
        sources: [video.src, ...[...video.querySelectorAll('source')].map((source) => source.src)].filter(Boolean),
        x: box.x - page.x + (box.width - width) * left,
        y: box.y - page.y + (box.height - height) * top,
        width,
        height,
        duration: video.duration * 1000,
        loop: video.loop,
        muted: video.defaultMuted,
      };
    });
  return {
    top: window.scrollY + page.y,
    continues: !!step.querySelector('.fragment.visible'),
    name: step.querySelector('h1, h2')?.textContent ?? '',
    notes,
    videos,
  };
})`;

function stackSteps(steps, live) {
  const slides = [];
  let recorded = null, started = false;
  for (const [index, { top, continues, ...step }] of steps.entries()) {
    if (!continues) started = false;
    const last = slides.at(-1);
    const same = continues && JSON.stringify(step.videos) === JSON.stringify(last?.videos);
    if (same && (step.videos.length || last === recorded)) {
      last.offsets.push(top);
      last.steps.push(index);
      continue;
    }
    const slide = { ...step, offsets: [top], steps: [index], recorded: !started && !!live?.[index].length };
    started ||= slide.recorded;
    recorded = slide.recorded ? slide : null;
    slides.push(slide);
  }
  return slides;
}

function localFile(video) {
  const source = video.sources.find((url) => new URL(url).pathname.toLowerCase().endsWith('.mp4'));
  if (!source) throw new Error(`a video does not have an MP4 source, which PowerPoint needs: ${video.sources.join(', ') || 'no source'}`);
  if (!Number.isFinite(video.duration)) throw new Error(`a video did not load: ${source}`);
  return fileURLToPath(source);
}

function sceneBoxes(slides) {
  const boxes = new Map();
  for (const slide of slides) {
    for (const { scene, width, height } of slide.videos) {
      if (scene !== undefined && !boxes.has(scene)) boxes.set(scene, { width, height, name: slide.name });
    }
  }
  return boxes;
}

const traced = `[...document.querySelectorAll('.pdf-page .backdrop')].some((el) => {
  const orbits = Beeson.backdrops.find((o) => o.el === el);
  return !!orbits && Beeson.animated(orbits);
})`;

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

const browser = await launch({ wholeFrames: true });
let failed = false;
try {
  const page = await browser.newPage({ scale: 2, motion: true });
  await printView(page, deckUrl(deck, 'print-pdf&still&pdfPageHeightOffset=0'));
  const steps = await page.evaluate(listSteps);
  const shown = still ? [] : await listAnimations(page);
  let slideIndex = -1;
  for (const [n, step] of steps.entries()) {
    if (!step.continues) slideIndex++;
    step.animations = [];
    for (const { index, place, key, x, y, width, height } of shown[n] ?? []) {
      const id = `${slideIndex}.${place} ${key}`;
      const before = step.continues ? shown[n - 1]?.find((b) => b.place === place) : undefined;
      const from = before && before.key !== key && key.startsWith('surface ') ? before : null;
      step.videos.push({ animation: id, x, y, width, height });
      step.animations.push({ id, index, from: from?.index ?? null, record: from ? `${id} from ${from.key}` : id });
    }
  }
  const rec = !still && (await page.evaluate(traced)) ? await recorder(browser) : null;
  const slides = stackSteps(steps, rec && (await rec.live(page)));
  let start = Date.now();
  const scenes = await recordScenes(browser, deck, sceneBoxes(slides));
  if (scenes.size) console.log(`recorded scenes: ${scenes.size} in ${seconds(Date.now() - start)}`);
  await showFirstFrames(page, scenes);
  start = Date.now();
  const animations = new Map();
  for (const slide of slides) {
    for (const { record, index, from } of slide.animations) {
      if (!animations.has(record)) animations.set(record, await recordAnimation(page, index, from));
    }
    slide.videos = slide.videos.flatMap((video) => {
      if (video.animation === undefined) return [video];
      const { clip, loop } = animations.get(slide.animations.find((a) => a.id === video.animation).record);
      const box = { x: video.x, y: video.y, width: video.width, height: video.height };
      return [clip && { ...box, ...clip, muted: true }, loop && { ...box, ...loop, muted: true, after: !!clip }].filter(Boolean);
    });
  }
  if (animations.size) console.log(`recorded surfaces and plots: ${animations.size} in ${seconds(Date.now() - start)}`);
  await page.send('Page.bringToFront');
  let backdrops = 0, recording = 0;
  const scrollTo = async (top) => {
    await page.evaluate(`window.scrollTo(0, ${top})`);
    await page.waitFor(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`);
  };
  for (const slide of slides) {
    if (slide.recorded) {
      start = Date.now();
      const { recording: { data, poster, duration, loop }, still: image, tops } = await rec.record(page, slide.steps);
      Object.assign(slide, { images: [image], recording: { data, poster, duration, loop }, tops });
      backdrops++;
      recording += Date.now() - start;
      await scrollTo(slide.offsets.at(-1));
    } else {
      slide.images = [];
      for (const top of slide.offsets) {
        await scrollTo(top);
        slide.images.push(await page.screenshot());
      }
    }
    for (const video of slide.videos) {
      if (video.scene !== undefined) {
        Object.assign(video, scenes.get(video.scene), { muted: true });
        continue;
      }
      if (video.data) continue;
      video.path = localFile(video);
      const { x, y, width, height } = video;
      video.poster = await page.screenshot({ x, y: slide.offsets.at(-1) + y, width, height, scale: 1 });
    }
  }
  if (backdrops) console.log(`recorded backdrops: ${backdrops} in ${seconds(recording)}`);
  writeFileSync(output, pptx(slides));
  const videos = slides.reduce((total, slide) => total + slide.videos.filter((video) => video.path).length, 0);
  console.log(`${output}: ${slides.length} slides for ${steps.length} steps of ${deck}, placed videos: ${videos}`);
  for (const error of page.errors) console.error(`page error: ${error}`);
  if (page.errors.length) failed = true;
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
