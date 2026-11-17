// the QR code of the Share dialog, from src/session/qr.ts, read back without a dependency after
// ISO/IEC 18004: the finder, timing, and alignment patterns, the dark module, the format and the
// version information with their BCH codes, the mask chosen by the penalty rules, the codewords in
// the order of placement, the blocks with zero Reed-Solomon syndromes, and the bytes of the text

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qr } from '../src/session/qr.ts';

// the codewords of each version 1 to 10, and the error correction codewords per block and the
// blocks at level M, after tables 1 and 9 of the standard
const TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
// the remainder bits after the codewords, after table 1
const REMAINDER = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
// the row and the column of the centers of the alignment patterns, after annex E
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const capacity = (version) => Math.floor(((TOTAL[version - 1] - ECC[version - 1] * BLOCKS[version - 1]) * 8 - 4 - (version < 10 ? 8 : 16)) / 8);

// the remainder of data shifted by the degree of poly, modulo poly, over GF(2)
function bchRemainder(data, poly) {
  const degree = 31 - Math.clz32(poly);
  let r = data << degree;
  for (let bit = 31; bit >= degree; bit--) if ((r >>> bit) & 1) r ^= poly << (bit - degree);
  return r;
}

// GF(256) with the primitive polynomial 0x11d
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++, x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1) {
  EXP[i] = x;
  LOG[x] = i;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// the syndromes of a block, the values of its polynomial at alpha^0 to alpha^(n - 1)
function syndromes(block, n) {
  return Array.from({ length: n }, (_, i) => block.reduce((s, c) => mul(s, EXP[i]) ^ c, 0));
}

// the modules that are not data: finders with their separators, timing, alignment, format, and
// version information
function functionMap(version) {
  const n = 4 * version + 17;
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && (fixed[r][c] = true);
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) mark(r0 + r, c0 + c);
  for (let i = 0; i < n; i++) mark(6, i), mark(i, 6);
  const inFinder = (r, c) => (r < 9 && c < 9) || (r < 9 && c > n - 10) || (r > n - 10 && c < 9);
  for (const r of ALIGN[version - 1]) for (const c of ALIGN[version - 1]) if (!inFinder(r, c)) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
  for (let i = 0; i < 9; i++) mark(8, i), mark(i, 8);
  for (let i = 0; i < 8; i++) mark(8, n - 1 - i), mark(n - 1 - i, 8);
  if (version >= 7) for (let i = 0; i < 18; i++) mark(n - 11 + (i % 3), Math.floor(i / 3)), mark(Math.floor(i / 3), n - 11 + (i % 3));
  return fixed;
}

// the data modules in the order of placement: two columns at a time from the right, up and down
// in turn, skipping the vertical timing pattern
function placement(fixed) {
  const n = fixed.length;
  const out = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let k = 0; k < n; k++) {
      const r = upward ? n - 1 - k : k;
      for (const c of [right, right - 1]) if (!fixed[r][c]) out.push([r, c]);
    }
  }
  return out;
}

// the four penalty rules of section 7.8.3
function penalty(dark) {
  const n = dark.length;
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    const at = (a, b) => (pass === 0 ? dark[a][b] : dark[b][a]);
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && at(a, b) === at(a, b - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      // 1:1:3:1:1 with four light modules on one side, the quiet zone counting as light
      const get = (b) => b >= 0 && b < n && at(a, b);
      for (let b = 0; b + 7 <= n; b++) {
        if (![1, 0, 1, 1, 1, 0, 1].every((v, k) => get(b + k) === !!v)) continue;
        if ([1, 2, 3, 4].every((k) => !get(b - k)) || [7, 8, 9, 10].every((k) => !get(b + k))) score += 40;
      }
    }
  }
  let count = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      count += dark[r][c] ? 1 : 0;
      if (r + 1 < n && c + 1 < n && dark[r][c] === dark[r][c + 1] && dark[r][c] === dark[r + 1][c] && dark[r][c] === dark[r + 1][c + 1]) score += 3;
    }
  }
  return score + 10 * Math.floor(Math.abs((count * 100) / (n * n) - 50) / 5);
}

// the format information of a code with the level M and a mask, placed into a copy of dark
function withFormat(dark, mask) {
  const n = dark.length;
  const out = dark.map((row) => row.slice());
  const data = (0b00 << 3) | mask;
  const bits = ((data << 10) | bchRemainder(data, 0x537)) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i < 6; i++) out[i][8] = bit(i);
  out[7][8] = bit(6);
  out[8][8] = bit(7);
  out[8][7] = bit(8);
  for (let i = 9; i < 15; i++) out[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) out[8][n - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) out[n - 15 + i][8] = bit(i);
  return out;
}

// reads a code back and returns its text, asserting every structure on the way
function read(dark) {
  const n = dark.length;
  assert.ok(dark.every((row) => row.length === n), 'the code is square');
  const version = (n - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 10, `size ${n}`);

  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const R = r0 + r, C = c0 + c;
        if (R < 0 || C < 0 || R >= n || C >= n) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        assert.equal(dark[R][C], ring !== 2 && ring !== 4, `finder at ${r0},${c0}: module ${R},${C}`);
      }
    }
  }
  for (let i = 8; i < n - 8; i++) {
    assert.equal(dark[6][i], i % 2 === 0, `timing in row 6, column ${i}`);
    assert.equal(dark[i][6], i % 2 === 0, `timing in column 6, row ${i}`);
  }
  const centers = ALIGN[version - 1];
  for (const r of centers) {
    for (const c of centers) {
      if ((r < 9 && c < 9) || (r < 9 && c > n - 10) || (r > n - 10 && c < 9)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) assert.equal(dark[r + dr][c + dc], Math.max(Math.abs(dr), Math.abs(dc)) !== 1, `alignment at ${r},${c}`);
    }
  }
  assert.equal(dark[n - 8][8], true, 'the dark module');

  if (version >= 7) {
    let a = 0, b = 0;
    for (let i = 17; i >= 0; i--) {
      a = (a << 1) | (dark[Math.floor(i / 3)][n - 11 + (i % 3)] ? 1 : 0);
      b = (b << 1) | (dark[n - 11 + (i % 3)][Math.floor(i / 3)] ? 1 : 0);
    }
    assert.equal(a, b, 'the two copies of the version information');
    assert.equal(a >>> 12, version, 'the version information names the version');
    assert.equal(a & 0xfff, bchRemainder(version, 0x1f25), 'the BCH code of the version information');
  }

  const bitAt = (r, c) => (dark[r][c] ? 1 : 0);
  let first = 0, second = 0;
  const one = [...[0, 1, 2, 3, 4, 5].map((i) => [i, 8]), [7, 8], [8, 8], [8, 7], ...[9, 10, 11, 12, 13, 14].map((i) => [8, 14 - i])];
  const two = [...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [8, n - 1 - i]), ...[8, 9, 10, 11, 12, 13, 14].map((i) => [n - 15 + i, 8])];
  one.forEach(([r, c], i) => (first |= bitAt(r, c) << i));
  two.forEach(([r, c], i) => (second |= bitAt(r, c) << i));
  assert.equal(first, second, 'the two copies of the format information');
  const format = first ^ 0x5412;
  assert.equal(format & 0x3ff, bchRemainder(format >>> 10, 0x537), 'the BCH code of the format information');
  assert.equal(format >>> 13, 0b00, 'the format information names level M');
  const mask = (format >>> 10) & 7;

  const fixed = functionMap(version);
  const order = placement(fixed);
  assert.equal(order.length, TOTAL[version - 1] * 8 + REMAINDER[version - 1], 'the number of data modules');
  const raw = dark.map((row, r) => row.map((d, c) => (fixed[r][c] ? d : d !== MASKS[mask](r, c))));
  for (const [r, c] of order.slice(TOTAL[version - 1] * 8)) assert.equal(raw[r][c], false, 'a remainder bit is light');

  // the mask has the lowest penalty of the eight
  const scores = MASKS.map((m, k) => penalty(withFormat(raw.map((row, r) => row.map((d, c) => (fixed[r][c] ? d : d !== m(r, c)))), k)));
  assert.equal(scores[mask], Math.min(...scores), `mask ${mask} scores ${scores[mask]} of ${scores}`);

  const words = new Array(TOTAL[version - 1]).fill(0);
  order.slice(0, words.length * 8).forEach(([r, c], i) => (words[i >>> 3] |= (raw[r][c] ? 1 : 0) << (7 - (i & 7))));
  const blocks = BLOCKS[version - 1], ecc = ECC[version - 1];
  const short = Math.floor(words.length / blocks) - ecc;
  const shortBlocks = blocks - (words.length % blocks);
  const data = Array.from({ length: blocks }, () => []);
  const checks = Array.from({ length: blocks }, () => []);
  let at = 0;
  for (let i = 0; i <= short; i++) for (let b = 0; b < blocks; b++) if (i < short || b >= shortBlocks) data[b].push(words[at++]);
  for (let i = 0; i < ecc; i++) for (let b = 0; b < blocks; b++) checks[b].push(words[at++]);
  for (let b = 0; b < blocks; b++) assert.deepEqual(syndromes([...data[b], ...checks[b]], ecc), new Array(ecc).fill(0), `the syndromes of block ${b}`);

  const stream = data.flat();
  let bit = 0;
  const take = (k) => {
    let v = 0;
    for (let i = 0; i < k; i++, bit++) v = (v << 1) | ((stream[bit >>> 3] >>> (7 - (bit & 7))) & 1);
    return v;
  };
  assert.equal(take(4), 0b0100, 'byte mode');
  const count = take(version < 10 ? 8 : 16);
  const bytes = Uint8Array.from({ length: count }, () => take(8));
  assert.equal(take(Math.min(4, stream.length * 8 - bit)), 0, 'the terminator');
  take((8 - (bit % 8)) % 8);
  for (let pad = 0xec; bit < stream.length * 8; pad ^= 0xec ^ 0x11) assert.equal(take(8), pad, 'a pad codeword');
  assert.ok(version === 1 || count > capacity(version - 1), `version ${version} is not the smallest for ${count} bytes`);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const filler = (n) => Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789-./?='[(i * 7) % 41]).join('');

test('a code is read back to its text, for texts of 1 to 200 bytes', () => {
  const texts = [filler(1), filler(17), filler(60), filler(100), filler(150), filler(200), 'Ana Núñez: Δv ✓ 🚀', 'https://relay.example.org:8443/AbCdEfGhIjKlMnOpQrStUv/index.html?edit&session'];
  const versions = [];
  for (const text of texts) {
    const dark = qr(text);
    versions.push((dark.length - 17) / 4);
    assert.equal(read(dark), text);
  }
  assert.ok(versions.includes(10) && versions.includes(1) && versions.some((v) => v >= 7 && v < 10), `versions ${versions}`);
});

test('a text longer than version 10 holds is refused', () => {
  assert.equal(read(qr(filler(capacity(10)))), filler(capacity(10)));
  assert.throws(() => qr(filler(capacity(10) + 1)), /holds at most 213/);
});
