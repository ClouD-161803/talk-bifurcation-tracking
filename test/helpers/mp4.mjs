import assert from 'node:assert/strict';

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'dinf', 'stbl']);
export function boxes(file, at = 0, end = file.length) {
  const out = [];
  while (at < end) {
    let size = file.readUInt32BE(at), head = 8;
    if (size === 1) [size, head] = [Number(file.readBigUInt64BE(at + 8)), 16];
    const type = file.toString('latin1', at + 4, at + 8);
    assert.ok(size >= head && at + size <= end, `box ${type} of size ${size} at ${at} runs past its parent`);
    const body = file.subarray(at + head, at + size);
    out.push({ type, start: at, size, body, children: CONTAINERS.has(type) ? boxes(file, at + head, at + size) : [] });
    at += size;
  }
  return out;
}

export function find(tree, path, { optional = false } = {}) {
  let found;
  for (const type of path.split('/')) {
    found = tree.find((b) => b.type === type);
    if (!found && optional) return undefined;
    assert.ok(found, `missing box ${path}`);
    tree = found.children;
  }
  return found;
}

export function stream(file) {
  const tree = boxes(file);
  const table = (type, options) => find(tree, `moov/trak/mdia/minf/stbl/${type}`, options)?.body;
  const stsd = table('stsd');
  assert.equal(stsd.toString('latin1', 12, 16), 'avc1');
  const mdhd = find(tree, 'moov/trak/mdia/mdhd').body;
  const timescale = mdhd.readUInt32BE(mdhd[0] === 1 ? 20 : 12);
  const stts = table('stts');
  const runs = Array.from({ length: stts.readUInt32BE(4) }, (_, n) => [stts.readUInt32BE(8 + 8 * n), stts.readUInt32BE(12 + 8 * n)]);
  assert.equal(new Set(runs.map(([, delta]) => delta)).size, 1, 'every frame lasts as long');
  const frames = runs.reduce((total, [count]) => total + count, 0);
  const stss = table('stss', { optional: true });
  return {
    width: stsd.readUInt16BE(40),
    height: stsd.readUInt16BE(42),
    fps: timescale / runs[0][1],
    frames,
    duration: (frames * runs[0][1]) / timescale,
    keys: stss ? Array.from({ length: stss.readUInt32BE(4) }, (_, n) => stss.readUInt32BE(8 + 4 * n)) : 'every frame',
  };
}

export function color(file) {
  const entry = find(boxes(file), 'moov/trak/mdia/minf/stbl/stsd').body.subarray(8);
  const colr = boxes(entry, 8 + 78, entry.length).find((b) => b.type === 'colr')?.body;
  if (!colr) return null;
  assert.equal(colr.toString('latin1', 0, 4), 'nclx');
  return { primaries: colr.readUInt16BE(4), transfer: colr.readUInt16BE(6), matrix: colr.readUInt16BE(8), fullRange: colr[10] >> 7 === 1 };
}
