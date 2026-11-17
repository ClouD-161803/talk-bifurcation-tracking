// a table cell that holds a plot in the editor of src/editor/render.ts: the cell is not a text
// element, hence the elements in it are paired one by one, and the drawn labels of the plot are not
// read or typed as the text of the cell

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { isTextElement } from '../src/editor/render.ts';
import { click, editorPage } from './helpers/editor.mjs';

const srcEl = (tag, ...children) => ({ kind: 'element', tag, children });
const srcText = (decoded) => ({ kind: 'text', decoded });

test('a cell is a text element unless it holds a box that is not one, e.g. a plot, and none of its own text', () => {
  assert.equal(isTextElement(srcEl('td', srcText('doubly elliptic'))), true);
  assert.equal(isTextElement(srcEl('td', srcEl('span', srcText('1')))), true);
  assert.equal(isTextElement(srcEl('td', srcEl('div', srcText('\\[x\\]')))), true);
  assert.equal(isTextElement(srcEl('aside', srcEl('p', srcText('a note')), srcEl('p', srcText('another')))), true);
  assert.equal(isTextElement(srcEl('td', srcText('\n  '), srcEl('div', srcEl('div')), srcEl('span'))), false);
  assert.equal(isTextElement(srcEl('td', srcText('a plot '), srcEl('div'))), true);
});

test('a deck with a plot in a table cell is opened in the editor with every text element paired, and a click on the plot does not open its cell for typing', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser, { deck: 'test/pages/editor-plot-cell.html' });
  await click(page, 'td');
  await page.waitFor(`document.activeElement.matches('td[contenteditable]')`);
  await click(page, '.plot svg');
  await page.waitFor(`!document.activeElement.closest('table') && !document.querySelector('.plot').closest('td').isContentEditable`);
  assert.deepEqual(page.errors, []);
});
