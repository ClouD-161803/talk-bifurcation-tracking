// the routes of the TikZ figures of the edit command: a preview of a source that is not saved, the
// write of a source against the text it was edited from, the write of a data file, the state of
// the figures in hello and in the events, and the refusal of a guest where the TeX of the host is
// MiKTeX. a test that runs TeX is skipped where latex or dvisvgm is not installed

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { startRelay } from '../scripts/relay.mjs';
import { findTools } from '../scripts/figures.mjs';
import { post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex or dvisvgm is not installed' : false;
const DECK = '<!doctype html>\n<html>\n<body>\n<section>\n  <h2>Orbit</h2>\n  <div class="tikz" data-figure="orbit" style="width: 600px; height: 400px"></div>\n</section>\n</body>\n</html>\n';
const DRAWING = '\\begin{tikzpicture}\n\\draw (0,0) -- (2,1);\n\\end{tikzpicture}\n';

// an edit command on a talk folder with DECK, with TeX looked up in texbin, and a page of it
async function session(t, { texbin, files = {} } = {}) {
  const { root, talk, config } = talkFolder(t, DECK);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(talk, 'figures'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(talk, name), text);
  const bin = texbin ?? join(root, 'no-tex');
  if (!texbin) mkdirSync(bin);
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config, ...(texbin === null ? {} : { BEESON_TEXBIN: bin }) } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = (await post(edit.port, api('hello'), { name: 'Ann' })).json();
  const send = (route, body) => post(edit.port, api(route), { token: hello.token, ...body });
  return { root, talk, config, edit, api, hello, send, read: (name) => readFileSync(join(talk, name), 'utf8') };
}

const temporary = (talk) => readdirSync(join(talk, 'figures')).filter((name) => name.startsWith('.'));

test('a source is written only over the text that it was edited from, and a new figure takes a free name', async (t) => {
  const s = await session(t);
  assert.deepEqual(s.hello.figures, { outputs: { orbit: null }, compiling: null, errors: {}, compiled: {}, uncompiled: 1, compiler: 'missing' });
  const first = await s.send('figures/source', { name: 'orbit', source: DRAWING, base: null });
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.json(), { name: 'orbit' });
  assert.equal(s.read('figures/orbit.tex'), DRAWING);
  const edited = DRAWING.replace('2,1', '3,1');
  const stale = await s.send('figures/source', { name: 'orbit', source: edited, base: null });
  assert.equal(stale.status, 409);
  assert.equal(stale.json().text, DRAWING);
  writeFileSync(join(s.talk, 'figures', 'orbit.tex'), `${DRAWING}% by hand\n`);
  const changed = await s.send('figures/source', { name: 'orbit', source: edited, base: DRAWING });
  assert.equal(changed.status, 409);
  assert.equal(changed.json().text, `${DRAWING}% by hand\n`);
  assert.equal((await s.send('figures/source', { name: 'orbit', source: edited, base: `${DRAWING}% by hand\n` })).status, 200);
  assert.equal(s.read('figures/orbit.tex'), edited);
  // a new figure is named from its stem, without the name of a source or an output
  writeFileSync(join(s.talk, 'figures', 'plot.js'), '');
  for (const [stem, name] of [
    ['Orbit', 'orbit-2'],
    ['Orbit', 'orbit-3'],
    ['Transfer Plot!', 'transfer-plot'],
    ['plot', 'plot-2'],
    ['', 'figure'],
  ]) {
    const made = await s.send('figures/source', { stem, source: DRAWING, base: null });
    assert.equal(made.status, 200, made.text);
    assert.deepEqual(made.json(), { name });
    assert.equal(s.read(`figures/${name}.tex`), DRAWING);
  }
  for (const body of [{ name: '../orbit', source: DRAWING, base: null }, { name: 'a b', source: DRAWING, base: null }, { name: 'orbit', source: 1, base: null }, { name: 'orbit', source: DRAWING }]) {
    assert.equal((await s.send('figures/source', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await post(s.edit.port, s.api('figures/source'), { token: 'n'.repeat(22), name: 'orbit', source: DRAWING, base: null })).status, 404);
  assert.equal((await raw(s.edit.port, 'GET', s.api('figures/source'))).status, 405);
  assert.deepEqual(temporary(s.talk), []);
  // a source is read fresh from the edit command
  const served = await raw(s.edit.port, 'GET', `${s.edit.base}figures/orbit.tex`);
  assert.equal(served.text, edited);
  assert.match(served.headers['cache-control'], /no-cache|no-store/);
  // the figure that has a source now is not compiled without TeX
  assert.equal((await post(s.edit.port, s.api('hello'), { name: 'Bo' })).json().figures.uncompiled, 1);
  assert.equal((await s.send('figures/preview', { name: 'orbit', source: DRAWING, box: { width: 600, height: 400 } })).status, 503);
});

test('a data file is written under a free name, and a file of the same bytes is found again', async (t) => {
  const s = await session(t);
  const data = async (stem, text) => {
    const answer = await s.send('figures/data', { stem, text });
    assert.equal(answer.status, 200, answer.text);
    return answer.json().path;
  };
  assert.equal(await data('Thrust Arc.csv', 'x,y\n0,1\n'), 'figures/thrust-arc.csv');
  assert.equal(s.read('figures/thrust-arc.csv'), 'x,y\n0,1\n');
  assert.equal(await data('Thrust Arc.csv', 'x,y\n0,1\n'), 'figures/thrust-arc.csv');
  assert.equal(await data('thrust-arc', 'x,y\n0,2\n'), 'figures/thrust-arc-2.csv');
  assert.equal(await data('thrust-arc', 'x,y\n0,1\n'), 'figures/thrust-arc.csv');
  assert.equal(await data('thrust-arc', 'x,y\n0,2\n'), 'figures/thrust-arc-2.csv');
  assert.equal(await data('../../etc/passwd', '1\n'), 'figures/passwd.csv');
  assert.equal((await s.send('figures/data', { stem: 'x', text: 3 })).status, 400);
  assert.deepEqual(temporary(s.talk), []);
});

test('a preview is compiled without a write, and a saved source is compiled into its output, whose hash every page is told', { skip: WITHOUT_TEX, timeout: 120_000 }, async (t) => {
  const s = await session(t, { texbin: null });
  const box = { width: 600, height: 400 };
  const preview = await s.send('figures/preview', { name: 'orbit', source: DRAWING, box });
  assert.equal(preview.status, 200, preview.text);
  const { figure } = preview.json();
  assert.match(figure.light, /<svg/);
  assert.match(figure.dark, /<svg/);
  assert.deepEqual(readdirSync(join(s.talk, 'figures')), []);
  const failed = (await s.send('figures/preview', { name: 'orbit', source: DRAWING.replace('\\draw', '\\drawn'), box })).json();
  assert.equal(failed.errors[0].file, 'figures/orbit.tex');
  assert.equal(failed.errors[0].line, 2);
  const outside = (await s.send('figures/preview', { name: 'orbit', source: '\\input{/etc/hosts}\n', box })).json();
  assert.match(outside.errors[0].message, /may not read/);
  for (const body of [{ name: 'orbit', source: DRAWING, box: { width: 'x' } }, { name: '.x', source: DRAWING, box }, { name: 'orbit', box }]) {
    assert.equal((await s.send('figures/preview', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await s.send('figures/source', { name: 'orbit', source: DRAWING, base: null })).status, 200);
  let since = s.hello.v;
  const state = await until(async () => {
    const events = (await raw(s.edit.port, 'GET', `${s.api('events')}?token=${s.hello.token}&since=${since}`)).json();
    since = events.v;
    return events.figures?.outputs.orbit && events.figures.compiling === null ? events.figures : null;
  }, 'the output of the saved source');
  assert.match(s.read('figures/orbit.js'), new RegExp(state.outputs.orbit));
  assert.equal(state.uncompiled, 0);
  assert.equal(state.compiler, 'fenced');
  assert.ok(state.compiled.orbit > 0);
  const again = (await post(s.edit.port, s.api('hello'), { name: 'Bo' })).json();
  assert.equal(again.figures.outputs.orbit, state.outputs.orbit);
});

test('a guest may not change a figure where the TeX of the host is MiKTeX, and the host may', { skip: process.platform === 'win32' ? 'the fake latex is a shell script' : false, timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t, DECK);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'miktex');
  mkdirSync(bin);
  writeFileSync(join(bin, 'latex'), '#!/bin/sh\necho "MiKTeX-pdfTeX 4.20 (MiKTeX 25.4)"\nexit 1\n');
  writeFileSync(join(bin, 'dvisvgm'), '#!/bin/sh\nexit 1\n');
  for (const name of ['latex', 'dvisvgm']) chmodSync(join(bin, name), 0o755);
  const secret = 'a secret of the group, long enough';
  const relay = await startRelay({ host: '127.0.0.1', secret });
  t.after(() => relay.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config, BEESON_TEXBIN: bin } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const host = (await post(edit.port, api('hello'), { name: 'Ann' })).json();
  assert.equal((await post(edit.port, api('share'), { relay: relay.url, secret })).status, 200);
  const guest = (route, body) => fetch(`${relay.url}${api(route)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ben = await (await guest('hello', { name: 'Ben' })).json();
  assert.equal(ben.host, false);
  for (const [route, body] of [
    ['figures/preview', { name: 'orbit', source: DRAWING, box: { width: 600, height: 400 } }],
    ['figures/source', { name: 'orbit', source: DRAWING, base: null }],
    ['figures/data', { stem: 'data', text: '1\n' }],
  ]) {
    const refused = await guest(route, { token: ben.token, ...body });
    assert.equal(refused.status, 403, route);
    assert.match((await refused.json()).error, /MiKTeX/);
  }
  assert.equal((await post(edit.port, api('figures/source'), { token: host.token, name: 'orbit', source: DRAWING, base: null })).status, 200);
  assert.equal(readFileSync(join(talk, 'figures', 'orbit.tex'), 'utf8'), DRAWING);
  assert.equal((await post(edit.port, api('hello'), { name: 'Cy' })).json().figures.compiler, 'unfenced');
});

test('a source saved with a byte-order mark is written over the text that a page read from it, and keeps its mark', async (t) => {
  const s = await session(t, { files: { 'figures/orbit.tex': `﻿${DRAWING}` } });
  // fetch().text() of a page drops the mark
  const read = await (await fetch(`http://127.0.0.1:${s.edit.port}${s.edit.base}figures/orbit.tex`)).text();
  assert.equal(read, DRAWING);
  const edited = DRAWING.replace('2,1', '3,1');
  const written = await s.send('figures/source', { name: 'orbit', source: edited, base: read });
  assert.equal(written.status, 200, written.text);
  assert.equal(s.read('figures/orbit.tex'), `﻿${edited}`);
  const stale = await s.send('figures/source', { name: 'orbit', source: DRAWING, base: read });
  assert.equal(stale.status, 409);
  assert.equal(stale.json().text, edited);
});
