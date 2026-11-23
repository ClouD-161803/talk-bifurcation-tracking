import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const EDIT = resolve('theme/edit.mjs');

export const DECK = ['<!doctype html>', '<html>', '<body>', '<section>', '  <h2>One</h2>', '  <p style="left: 10px">First slide</p>', '</section>', '<section>', '  <h2>Two</h2>', '  <p>Second slide</p>', '</section>', '</body>', '</html>', ''].join('\n');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const running = new Set();

export function talkFolder(t, bytes = DECK) {
  const root = mkdtempSync(join(tmpdir(), 'slides edit-'));
  t.after(() => Promise.all([...running].filter((state) => state.folder.startsWith(root)).map(stopBounded)));
  const talk = join(root, 'talk');
  mkdirSync(talk);
  writeFileSync(join(talk, 'index.html'), bytes);
  mkdirSync(join(root, 'config'));
  return { root, talk, config: join(root, 'config') };
}

export function startEdit(folder, { args = [], env = {}, port = 0 } = {}) {
  const child = spawn(process.execPath, [EDIT, folder, ...(port === null ? [] : ['--port', String(port)]), '--no-open', ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, folder: resolve(folder), stderr: '', exited: new Promise((done) => child.once('exit', (code) => done(code))) };
  running.add(state);
  child.once('exit', () => running.delete(state));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (state.stderr += chunk));
  return new Promise((done, fail) => {
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const line = out.split('\n')[0];
      if (out.includes('\n') && !state.url) {
        Object.assign(state, JSON.parse(line));
        state.base = `/${state.key}/`;
        done(state);
      }
    });
    child.once('exit', (code) => fail(new Error(`the edit command exited with ${code}: ${state.stderr}`)));
  });
}

export async function stopEdit(state) {
  if (state.child.exitCode === null) state.child.kill();
  await state.exited;
}

export function within(promise, ms, what) {
  let timer;
  const late = new Promise((_, fail) => (timer = setTimeout(() => fail(new Error(`timed out waiting for ${what}`)), ms)));
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function stopBounded(state) {
  try {
    await within(stopEdit(state), 30_000, 'the edit command to stop');
  } catch (e) {
    state.child.kill('SIGKILL');
    await state.exited;
    throw e;
  }
}

export function raw(port, method, path, { headers = {}, body, host = `127.0.0.1:${port}`, timeout = 60_000 } = {}) {
  return new Promise((done, fail) => {
    const bytes = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = httpRequest({ host: '127.0.0.1', port, method, path, agent: false, headers: { host, ...(bytes ? { 'content-length': bytes.length } : {}), ...headers }, timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        done({ status: res.statusCode, headers: res.headers, body: data, text: data.toString('utf8'), json: () => JSON.parse(data.toString('utf8')) });
      });
    });
    req.on('error', fail);
    req.on('timeout', () => req.destroy(new Error(`${method} ${path} timed out`)));
    req.end(bytes);
  });
}

export const post = (port, path, value, options = {}) => raw(port, 'POST', path, { ...options, body: value, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });

export async function until(fn, what, timeout = 20_000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}
