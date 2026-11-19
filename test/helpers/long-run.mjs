import { performance } from 'node:perf_hooks';
import { parentPort, workerData } from 'node:worker_threads';
import { Authority, History } from '../../theme/edit.mjs';

const PEOPLE = ['AnnAnnAnnAnnAnnAnnAnn1', 'BoBoBoBoBoBoBoBoBoBoBo', 'CyCyCyCyCyCyCyCyCyCyCy'];

export function longRun(dir) {
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  const words = 'alpha beta gamma delta orbit halo moon earth transfer manifold'.split(' ');
  let deck = '<!doctype html><html><body><div class="reveal"><div class="slides">\n';
  for (let i = 0; deck.length < 200_000; i++) deck += `<section>\n  <h2>Slide ${i}</h2>\n  <p>${Array.from({ length: 30 }, () => words[Math.floor(rnd() * words.length)]).join(' ')}</p>\n</section>\n`;
  deck += '</div></div></body></html>\n';
  let now = 0;
  const authority = new Authority(deck);
  const history = new History(dir, authority, { quiet: 60_000, longest: 300_000, log: () => {}, clock: () => now, now: () => 1e12 + now });
  const run = (n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      now += 1000;
      const at = Math.floor(rnd() * (authority.text.length - 10)) + 1;
      const patch = rnd() < 0.6 ? { start: at, end: at, text: 'e' } : { start: at, end: at + 1, text: '' };
      const author = PEOPLE[Math.floor(rnd() * PEOPLE.length)];
      const start = performance.now();
      authority.enter([patch], author);
      sum += performance.now() - start;
    }
    return sum / n;
  };
  return { run, stop: () => history.stopSync() };
}

if (workerData?.longRun) {
  const { run, stop } = longRun(workerData.longRun);
  run(1000);
  parentPort.on('message', (n) => {
    if (n) return parentPort.postMessage(run(n));
    stop();
    parentPort.close();
  });
  parentPort.postMessage(0);
}
