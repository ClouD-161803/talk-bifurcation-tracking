// the keys of every command in a page of a session, on both platforms: two commands that take one
// key in one region are a fault, since the key runs only the first of them that is enabled. the
// pairs of the editor that share a key in disjoint states are listed in KNOWN

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { open, sessionUrl, talk } from './helpers/client.mjs';

// the commands of the editor that share a key in one region, each with why the key reaches each of
// them. a range of cells is a range selected in a table, whose keys RANGE_KEYS of commands/table.ts
// takes in a listener before the keys of the editor. in a text, the commands of text/flow.ts are
// defined first, those of commands/text.ts next, and those of commands/table.ts last
const NUDGE = 'a nudge needs a selected element, an arrow changes the slide without one, and a range of cells takes it first';
const KNOWN = {
  'arrange.nudge.down navigate.nextArrow table.selectDown': NUDGE,
  'arrange.nudge.left navigate.previousArrow table.selectLeft': NUDGE,
  'arrange.nudge.right navigate.nextArrow table.selectRight': NUDGE,
  'arrange.nudge.up navigate.previousArrow table.selectUp': NUDGE,
  'arrange.nudge.down.far table.extendDown': NUDGE,
  'arrange.nudge.left.far table.extendLeft': NUDGE,
  'arrange.nudge.right.far table.extendRight': NUDGE,
  'arrange.nudge.up.far table.extendUp': NUDGE,
  'element.delete table.clearCells': 'a range of cells takes the key first, and the selected elements are deleted otherwise',
  'selection.clear table.selectTable': 'a range of cells takes Esc first and leaves its table selected, as Keynote does',
  'selection.editText selection.selectMedia shape.editWords table.editCell': 'Return acts on the one selected object: a text, a figure without text, an empty shape, or a range of cells first',
  'table.cell.down text.flow.down': 'the caret goes on into the next text element where there is one, and into the next cell otherwise',
  'table.cell.left text.flow.left': 'the caret goes on into the next text element where there is one, and into the next cell otherwise',
  'table.cell.right text.flow.right': 'the caret goes on into the next text element where there is one, and into the next cell otherwise',
  'table.cell.up text.flow.up': 'the caret goes on into the next text element where there is one, and into the next cell otherwise',
  'table.nextCell text.indent text.tab': 'Tab indents an item of a list, moves to the next cell in a table, and types a tab elsewhere, which is off in a cell',
  'table.previousCell text.outdent text.tabBack': 'Shift+Tab outdents an item of a list, moves to the cell before in a table, and is a tab elsewhere, which is off in a cell',
  'text.flow.delete text.joinBackward': 'a selection over several text elements is deleted first, and Backspace joins two paragraphs otherwise',
  'text.flow.delete text.joinForward': 'a selection over several text elements is deleted first, and Delete joins two paragraphs otherwise',
  'text.flow.newParagraph text.newParagraph': 'a selection over several text elements is replaced by a new paragraph first, and Return splits the text element otherwise',
};

// each command with its keys on the platform of the page and the regions that take them, as
// Commands.forKey of src/editor/commands.ts reads them
const COMMANDS = `(() => {
  const app = window.BeesonSession.client().app;
  return app.commands.list().map((c) => ({
    id: c.id,
    keys: c.keys?.[app.platform] ?? [],
    in: c.in ?? ['canvas', 'navigator'],
    inText: c.inText === true || (Array.isArray(c.inText) && c.inText.includes(app.platform)),
  }));
})()`;

// a key string as one chord on the platform: Mod as Meta or Ctrl, the modifiers in one order, and
// the Shift of a symbol left out, since keymap.ts does not compare it
function chord(key, platform) {
  const parts = key.endsWith('++') ? [...key.slice(0, -2).split('+'), '+'] : key.split('+');
  const name = parts.pop();
  const mods = new Set(parts.map((m) => (m === 'Mod' ? (platform === 'mac' ? 'Meta' : 'Ctrl') : m)));
  const one = name.length === 1 ? name.toLowerCase() : name;
  if (one.length === 1 && !/[a-z0-9]/.test(one)) mods.delete('Shift');
  return [...[...mods].sort(), one].join('+');
}

// a key without Mod, Ctrl, Alt, or Meta, other than a function key, as isPlain of commands.ts
const plain = (key) => !/(^|\+)(Mod|Ctrl|Alt|Meta)\+/.test(key) && !/^(Shift\+)?F\d+$/.test(key);

// the regions in which each key of command c is taken. a text takes a key of inText only with a
// modifier, and a text and the notes leave a plain character to the typing
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
    const shared = new Map();
    for (const [at, ids] of owners) if (ids.length > 1) shared.set(ids.sort().join(' '), at);
    assert.deepEqual([...shared].filter(([p]) => !(p in KNOWN)).sort(), [], 'the commands that share a key in one region');
  });
}
