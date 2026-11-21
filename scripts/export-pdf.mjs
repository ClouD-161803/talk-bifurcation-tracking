import { readFileSync, writeFileSync } from 'node:fs';
import { deckUrl, launch, printView } from './chrome.mjs';

const [deck = 'index.html', output = 'slides.pdf'] = process.argv.slice(2);

function countPdfPages(pdf) {
  const text = pdf.toString('latin1');
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)]
    .map((m) => Number(m[1] ?? m[2]));
  if (counts.length) return Math.max(...counts);
  return text.match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0;
}

const browser = await launch();
let failed = false;
try {
  const page = await browser.newPage();
  await printView(page, deckUrl(deck, 'print-pdf&still'));
  const steps = await page.evaluate(`document.querySelectorAll('.pdf-page').length`);
  const pdf = await page.pdf();
  writeFileSync(output, pdf);
  const pages = countPdfPages(readFileSync(output));
  console.log(`${output}: ${pages} pages for ${steps} steps of ${deck}`);
  if (pages !== steps) {
    console.error(`page count ${pages} is not equal to step count ${steps}, look for a page break inside a slide`);
    failed = true;
  }
  for (const error of page.errors) console.error(`page error: ${error}`);
  if (page.errors.length) failed = true;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
