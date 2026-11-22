import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { codeTexts, deckTexts, docTexts, walk } from './helpers/texts.mjs';

const root = join(import.meta.dirname, '..');
const glossary = readFileSync(join(root, 'GLOSSARY.md'), 'utf8');

const entries = glossary
  .split(/^## /m)
  .slice(1)
  .map((block) => {
    const [name, ...rest] = block.split('\n');
    return { name, paragraphs: rest.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) };
  });

const LIST = /^(?:,? (?:and |or )?"[^"]+")*/;

function avoided() {
  const out = [];
  for (const { name, paragraphs } of entries) {
    for (const sentence of paragraphs.join(' ').split(/(?<=\.)\s+(?=[A-Z"`])/)) {
      if (!/\bavoid\b/i.test(sentence)) continue;
      for (const m of sentence.matchAll(/"([^"]+)"/g)) {
        const rest = sentence.slice(m.index + m[0].length).replace(LIST, '').trim();
        if (rest === '' || rest === '.' || /^,? and avoid\b/.test(rest)) out.push({ word: m[1], use: name });
      }
    }
  }
  return out;
}

const AVOIDED = avoided();

const TEXTS = [
  ...codeTexts(root, [...walk(root, 'src', ['.ts']), ...walk(root, 'scripts', ['.mjs', '.js'])]),
  ...docTexts(root, ['REFERENCE.md', 'AGENTS.md', 'src/AGENTS.md', ...readdirSync(join(root, '.agents/skills'), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => `.agents/skills/${f.replaceAll('\\', '/')}`)]),
  ...deckTexts(root, 'index.html'),
];

const EXCEPTIONS = [
  { word: 'drawing', pattern: /drawing buffer/, why: 'the drawing buffer of WebGL' },
  { word: 'drawing', pattern: /Beeson\.drawing/, why: 'the function that a file of a built-in backdrop calls' },
  { word: 'picture', pattern: /^Save as Picture…$/, why: 'the command of PowerPoint' },
  { word: 'picture', pattern: /every picture\//, why: 'the key of TikZ' },
  { word: 'block', pattern: /\b(?:double )?block arrow|error-correction block|\bblock:\s*['"]|:\s*block\b/i, why: 'a shape, a QR code, scrollIntoView, and CSS' },
  { word: 'object', pattern: /Object List|(?:Next|Previous) Object|JSON object|\ban object\b(?: of (?:mark|panel) ids)? is expected|object-(?:fit|position)|objects of the pages|\bObject\.\w/i, why: 'the names of Keynote, JSON, CSS, and PDF' },
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (word) => new RegExp(`(?<![\\w-])${escape(word)}s?(?![\\w-])`, /[A-Z]/.test(word) ? '' : 'i');

function scan() {
  const hits = [];
  const used = new Set();
  for (const { word, use } of AVOIDED) {
    const re = matcher(word);
    for (const { file, line, text } of TEXTS) {
      const plain = text.replace(/`[^`]*`/g, '');
      if (!re.test(plain)) continue;
      const excused = EXCEPTIONS.filter((x) => x.word === word && x.pattern.test(plain));
      const left = excused.reduce((s, x) => s.replace(new RegExp(x.pattern.source, x.pattern.flags.includes('g') ? x.pattern.flags : `${x.pattern.flags}g`), ''), plain);
      if (excused.length && !re.test(left)) {
        for (const x of excused) used.add(x);
        continue;
      }
      hits.push(`${file}:${line}: "${word}", write ${use}: ${text.trim().slice(0, 100)}`);
    }
  }
  return { hits, used };
}

const { hits, used } = scan();

test('the glossary names at least the avoided words of its main entries', () => {
  const words = new Set(AVOIDED.map((a) => a.word));
  assert.deepEqual(['drawing', 'picture', 'block', 'card', 'glue', 'slide list'].filter((w) => !words.has(w)), []);
});

test('each entry of the glossary opens with its definition, not with what to avoid', () => {
  const bad = entries.filter((e) => !e.paragraphs.length || /^Avoid\b/.test(e.paragraphs[0])).map((e) => e.name);
  assert.deepEqual(bad, []);
});

test('the texts that a person reads use no word that the glossary says to avoid', () => {
  assert.deepEqual(hits, []);
});

test('every exception to the glossary still excuses a text', () => {
  assert.deepEqual(EXCEPTIONS.filter((x) => !used.has(x)).map((x) => `${x.word}: ${x.why}`), []);
});
