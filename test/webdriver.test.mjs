// checks of the driver lookup and the local server in scripts/webdriver.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { driverOf, serve } from '../scripts/webdriver.mjs';

const firefoxOptions = (env) => driverOf('firefox', env).capabilities['moz:firefoxOptions'];

test('geckodriver is taken from GECKOWEBDRIVER, as on a runner, and else from the PATH', () => {
  assert.equal(driverOf('firefox', { GECKOWEBDRIVER: 'drivers' }).command, join('drivers', 'geckodriver'));
  assert.equal(driverOf('firefox', {}).command, 'geckodriver');
});

test('FIREFOX_PATH is passed to geckodriver', () => {
  assert.equal(firefoxOptions({ FIREFOX_PATH: 'firefox-bin' }).binary, 'firefox-bin');
  assert.equal(firefoxOptions({}).binary, undefined);
});

test('Firefox is headless without a display, and in a window with one', () => {
  assert.deepEqual(firefoxOptions({}).args, ['-headless']);
  assert.deepEqual(firefoxOptions({ DISPLAY: ':99' }).args, []);
});

test('Firefox sends every host but this machine to a proxy on a closed port', () => {
  for (const env of [{}, { DISPLAY: ':99', FIREFOX_PATH: 'firefox-bin' }]) {
    assert.deepEqual(firefoxOptions(env).prefs, {
      'network.proxy.type': 1,
      'network.proxy.http': '127.0.0.1',
      'network.proxy.http_port': 9,
      'network.proxy.ssl': '127.0.0.1',
      'network.proxy.ssl_port': 9,
    });
  }
});

test('Safari is driven by the safaridriver of the system', () => {
  assert.equal(driverOf('safari', {}).command, '/usr/bin/safaridriver');
});

test('an unknown browser is an error', () => {
  assert.throws(() => driverOf('edge', {}), /unknown browser edge/);
});

test('a folder is served on a local port, without the files outside it', async () => {
  const { origin, close } = await serve('theme');
  try {
    const page = await fetch(`${origin}/beeson.css?still`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-type'), 'text/css');
    assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
    assert.equal((await fetch(`${origin}/..%2fpackage.json`)).status, 404);
  } finally {
    close();
  }
});
