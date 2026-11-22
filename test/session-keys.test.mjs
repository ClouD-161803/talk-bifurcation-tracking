import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { open, sessionUrl, talk } from './helpers/client.mjs';

const NUDGE = 'a nudge needs a selected element, an arrow changes the slide without one, and a range of cells takes it first';
const DELETE = 'a range of cells takes the key first, and the selected elements are deleted otherwise';
const FLOW = 'the caret goes on into the next text element where there is one, and into the next cell otherwise';
const KNOWN = {
  'arrange.nudge.down navigate.nextArrow table.selectDown | canvas ArrowDown': NUDGE,
  'arrange.nudge.left navigate.previousArrow table.selectLeft | canvas ArrowLeft': NUDGE,
  'arrange.nudge.right navigate.nextArrow table.selectRight | canvas ArrowRight': NUDGE,
  'arrange.nudge.up navigate.previousArrow table.selectUp | canvas ArrowUp': NUDGE,
  'arrange.nudge.down.far table.extendDown | canvas Shift+ArrowDown': NUDGE,
  'arrange.nudge.left.far table.extendLeft | canvas Shift+ArrowLeft': NUDGE,
  'arrange.nudge.right.far table.extendRight | canvas Shift+ArrowRight': NUDGE,
  'arrange.nudge.up.far table.extendUp | canvas Shift+ArrowUp': NUDGE,
  'element.delete table.clearCells | canvas Backspace': DELETE,
  'element.delete table.clearCells | canvas Delete': DELETE,
  'selection.clear table.selectTable | canvas Escape': 'a range of cells takes Esc first and leaves its table selected, as Keynote does',
  'math.openFocused selection.editText selection.selectMedia shape.editWords table.editCell | canvas Enter': 'Return opens the TeX of a formula with the focus first, and acts otherwise on the one selected object: a text, a figure without text, an empty shape, or a range of cells first',
  'table.cell.down text.flow.down | text ArrowDown': FLOW,
  'table.cell.left text.flow.left | text ArrowLeft': FLOW,
  'table.cell.right text.flow.right | text ArrowRight': FLOW,
  'table.cell.up text.flow.up | text ArrowUp': FLOW,
  'table.nextCell text.indent text.tab | text Tab': 'Tab indents an item of a list, moves to the next cell in a table, and types a tab elsewhere, which is off in a cell',
  'table.previousCell text.outdent text.tabBack | text Shift+Tab': 'Shift+Tab outdents an item of a list, moves to the cell before in a table, and is a tab elsewhere, which is off in a cell',
  'text.flow.delete text.joinBackward | text Backspace': 'a selection over several text elements is deleted first, and Backspace joins two paragraphs otherwise',
  'text.flow.delete text.joinForward | text Delete': 'a selection over several text elements is deleted first, and Delete joins two paragraphs otherwise',
  'math.openFocused table.enterBelow text.flow.newParagraph text.newParagraph | text Enter': 'Return opens the TeX of a formula with the focus first, selects the cell below with the caret in a cell, replaces a selection over several text elements by a new paragraph next, and splits the text element otherwise',
  'selection.next table.selectNext | canvas Tab': 'a range of cells takes Tab first and selects the next cell, as Excel does, and Tab selects the next element otherwise',
  'selection.previous table.selectPrevious | canvas Shift+Tab': 'a range of cells takes Shift+Tab first and selects the cell before, as Excel does, and Shift+Tab selects the element before otherwise',
};

const COMMANDS = `(() => {
  const app = window.BeesonSession.client().app;
  return app.commands.list().map((c) => ({
    id: c.id,
    keys: c.keys?.[app.platform] ?? [],
    in: c.in ?? ['canvas', 'navigator'],
    inText: c.inText === true || (Array.isArray(c.inText) && c.inText.includes(app.platform)),
  }));
})()`;

function chord(key, platform) {
  const parts = key.endsWith('++') ? [...key.slice(0, -2).split('+'), '+'] : key.split('+');
  const name = parts.pop();
  const mods = new Set(parts.map((m) => (m === 'Mod' ? (platform === 'mac' ? 'Meta' : 'Ctrl') : m)));
  const one = name.length === 1 ? name.toLowerCase() : name;
  if (one.length === 1 && !/[a-z0-9]/.test(one)) mods.delete('Shift');
  return [...[...mods].sort(), one].join('+');
}

const plain = (key) => !/(^|\+)(Mod|Ctrl|Alt|Meta)\+/.test(key) && !/^(Shift\+)?F\d+$/.test(key);

function taken(c) {
  const out = [];
  for (const key of c.keys) {
    const regions = new Set(c.in);
    if (c.inText && !plain(key)) regions.add('text');
    for (const r of regions) {
      if ((r === 'text' || r === 'notes') && plain(key) && key.split('+').at(-1).length === 1) continue;
      out.push([r, key]);
    }
  }
  return out;
}

for (const platform of ['mac', 'other']) {
  test(`two commands do not take one key in one region on ${platform}`, { timeout: 120_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const page = await open(browser, `${sessionUrl(server.edit)}&edit-platform=${platform}`);
    const commands = await page.evaluate(COMMANDS);
    assert.ok(commands.some((c) => c.id === 'insert.comment'), 'the commands of the session are defined');
    const owners = new Map();
    for (const c of commands) {
      for (const [region, key] of taken(c)) {
        const at = `${region} ${chord(key, platform)}`;
        owners.set(at, [...new Set([...(owners.get(at) ?? []), c.id])]);
      }
    }
    const shared = new Set();
    for (const [at, ids] of owners) if (ids.length > 1) shared.add(`${ids.sort().join(' ')} | ${at}`);
    assert.deepEqual([...shared].filter((k) => !(k in KNOWN)).sort(), [], 'the commands that share a key in one region');
    assert.deepEqual(Object.keys(KNOWN).filter((k) => !shared.has(k)).sort(), [], 'the entries of KNOWN that do not share their key any more');
  });
}
