import type { App } from '../app.ts';
import { previewTex } from '../math.ts';
import { typesetTyped } from './typing.ts';
import { store, stored } from '../ui/dom.ts';

export type Smart = 'quotes' | 'dashes' | 'links' | 'markdown' | 'tex';

const KEYS: Record<Smart, string> = { quotes: 'beeson-edit-smart-quotes', dashes: 'beeson-edit-smart-dashes', links: 'beeson-edit-smart-links', markdown: 'beeson-edit-smart-markdown', tex: 'beeson-edit-smart-tex' };

export const isSmart = (kind: Smart): boolean => stored(KEYS[kind]) !== 'off';

export function setSmart(kind: Smart, on: boolean): void {
  store(KEYS[kind], on ? 'on' : 'off');
}

const OPENS = /(^|[\s([{“‘—–-])$/u;

const DOLLAR = /(?:^|[^\\$])\$(?=[^\s\d$])/g;

const opened = (text: string): boolean => text.lastIndexOf('\\(') > text.lastIndexOf('\\)') || text.lastIndexOf('\\[') > text.lastIndexOf('\\]');

function inTex(before: string): boolean {
  if (opened(before)) return true;
  if (!isSmart('tex')) return false;
  const dollar = [...before.matchAll(DOLLAR)].at(-1);
  const open = dollar ? dollar.index + dollar[0].length : -1;
  return open > 0 && !before.slice(open).includes('$');
}

export function texSpan(text: string): { start: number; tex: string } | null {
  if (text.endsWith('\\)')) {
    const start = text.lastIndexOf('\\(');
    const tex = start < 0 ? '' : text.slice(start + 2, -2);
    return tex.trim() ? { start, tex } : null;
  }
  if (!text.endsWith('$')) return null;
  const dollar = [...text.slice(0, -1).matchAll(DOLLAR)].at(-1);
  if (!dollar) return null;
  const start = dollar.index + dollar[0].length - 1;
  const tex = text.slice(start + 1, -1);
  return tex.includes('$') || /\s$/.test(tex) || opened(text.slice(0, start)) ? null : { start, tex };
}

export function texDisplay(text: string): string | null {
  const m = /^\s*(?:\$\$([^$]+)\$\$|\\\[(.+)\\\])\s*$/s.exec(text);
  const tex = m ? (m[1] ?? m[2]) : '';
  return tex.trim() ? tex : null;
}

export function substitution(before: string, typed: string, on: Record<'quotes' | 'dashes', boolean>): { remove: number; insert: string } | null {
  if (inTex(before)) return null;
  if (on.quotes && (typed === '"' || typed === "'")) {
    const open = OPENS.test(before);
    if (typed === '"') return { remove: 1, insert: open ? '“' : '”' };
    return { remove: 1, insert: open ? '‘' : '’' };
  }
  if (on.dashes && typed === '-' && before.endsWith('-') && !before.endsWith('--')) return { remove: 2, insert: '—' };
  if (on.dashes && (typed === ' ' || typed === '\u00a0') && /\S[ \u00a0]-$/u.test(before)) return { remove: 2, insert: `–${typed}` };
  return null;
}

const MARKS: [string, string][] = [['**', 'strong'], ['__', 'strong'], ['~~', 's'], ['*', 'em'], ['_', 'em'], ['`', 'code']];
const escaped = (mark: string) => mark.replace(/\*/g, '\\$&');

export function markdownSpan(text: string): { start: number; words: string; tag: string } | null {
  if (inTex(text)) return null;
  for (const [mark, tag] of MARKS) {
    if (!text.endsWith(mark)) continue;
    const m = escaped(mark);
    const c = escaped(mark[0]);
    const lead = mark === '_' || mark === '__' ? `(?:^|[\\s([{"'“‘—–-])` : mark.length === 1 ? `(?:^|[^${c}])` : '';
    const words = mark === '`' ? '[^`]+' : `[^\\s${c}](?:[^${c}]*[^\\s${c}])?`;
    const found = new RegExp(`${lead}(${m})(${words})${m}$`, 'u').exec(text);
    if (!found) continue;
    const start = found.index + found[0].length - found[1].length - found[2].length - mark.length;
    if (mark.length === 1 && text.charAt(text.length - 2) === mark) continue;
    return { start, words: found[2], tag };
  }
  return null;
}

const URL = /^(?:https?:\/\/|www\.)[\p{L}\p{N}][^\s<>"]*$/iu;
const EMAIL = /^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u;

const count = (text: string, char: string) => text.split(char).length - 1;

function trimmed(word: string): string {
  while (word) {
    const last = word.slice(-1);
    const open = last === ')' ? '(' : last === ']' ? '[' : '';
    if (open ? count(word, open) >= count(word, last) : !/[.,;:!?'"’”]/u.test(last)) return word;
    word = word.slice(0, -1);
  }
  return word;
}

export function smartLink(before: string): { start: number; end: number; href: string } | null {
  if (inTex(before)) return null;
  let start = before.search(/\S+$/u);
  if (start < 0) return null;
  start += /^[(["'“‘]*/u.exec(before.slice(start))![0].length;
  const word = trimmed(before.slice(start));
  const end = start + word.length;
  if (EMAIL.test(word)) return { start, end, href: `mailto:${word}` };
  if (URL.test(word)) return { start, end, href: /^www\./i.test(word) ? `https://${word}` : word };
  return null;
}

function textBefore(host: Element, node: Text, offset: number): string {
  let out = '';
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n === node) return out + n.data.slice(0, offset);
    if (!n.parentElement?.closest('mjx-container')) out += n.data;
  }
  return out;
}

export function install(app: App): void {
  let typed: string | null = null;
  let exit: { host: Element; el: Element } | null = null;
  const atEnd = (el: Element, sel: Selection): boolean => {
    const { anchorNode: n, anchorOffset: o } = sel;
    if (!sel.isCollapsed || !n) return false;
    if (n === el.parentNode) return el.parentNode!.childNodes[o - 1] === el;
    if (n instanceof Text && el.contains(n)) return o === n.length && !n.nextSibling && n.parentNode === el;
    return n instanceof Text && n.previousSibling === el && o === 0 && !n.data;
  };
  document.addEventListener('mousedown', () => (exit = null), true);
  document.addEventListener('keydown', (ev) => {
    if (ev.key.length !== 1) exit = null;
  }, true);
  document.addEventListener('beforeinput', (ev) => {
    const sel = window.getSelection();
    const out = exit;
    exit = null;
    if (out && ev.inputType === 'insertText' && ev.data && !ev.defaultPrevented && sel && out.el.isConnected && atEnd(out.el, sel)) {
      ev.preventDefault();
      app.history.beforeTyping(out.host);
      const text = document.createTextNode(out.el.nextSibling ? ev.data : ev.data.replace(/ $/, '\u00a0'));
      out.el.after(text);
      sel.collapse(text, text.length);
      out.host.normalize();
      app.history.afterTyping(out.host);
      app.markDirty();
      app.invalidate('content');
    }
  }, true);
  document.addEventListener('beforeinput', (ev) => {
    typed = ev.inputType === 'insertText' && !ev.defaultPrevented ? ev.data : null;
  });
  document.addEventListener('input', (ev) => {
    const data = typed;
    typed = null;
    if (!(ev instanceof InputEvent) || ev.inputType !== 'insertText' || ev.data !== data || data?.length !== 1) return;
    const host = app.hostOf(ev.target);
    const sel = window.getSelection();
    if (!host || !sel?.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    if (!(node instanceof Text) || !host.contains(node) || node.parentElement?.closest('pre, code, mjx-container')) return;
    const record = () => {
      app.history.afterTyping(host);
      app.history.break();
      app.markDirty();
      app.invalidate('content');
    };
    const tex = isSmart('tex') && /^[$)\]]$/.test(data) && !host.closest('aside.notes') ? texSpan(node.data.slice(0, offset)) : null;
    const display = tex || !/^[$\]]$/.test(data) || !isSmart('tex') || !host.matches('p:not([class], [data-generated])') || host.closest('.shape') || host.querySelector('mjx-container') || node.data.length > offset ? null : texDisplay(host.textContent ?? '');
    if (tex || display) {
      const typed = node.data.slice(0, offset);
      void previewTex(tex?.tex ?? display!, !tex).then(async ({ error }) => {
        if (error || !node.isConnected || !node.data.startsWith(typed)) return;
        if (display) {
          const body = `\\[${display.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\\]`;
          await app.history.transact('TeX Formula', async () => {
            app.selection.set('elements', [await app.doc.rewrite(host, (text) => text.replace(/^<p([^>]*)>[\s\S]*$/, (_, attributes: string) => `<div class="math"${attributes}>${body}</div>`), 'TeX Formula')]);
          });
          return;
        }
        const formula = `\\(${tex!.tex}\\)`;
        const moved = formula.length - (offset - tex!.start);
        const s = window.getSelection();
        const caret = s?.focusNode === node && s.focusOffset >= offset ? s.focusOffset + moved : null;
        if (formula !== node.data.slice(tex!.start, offset)) {
          app.history.beforeTyping(host, 'TeX Formula');
          node.replaceData(tex!.start, offset - tex!.start, formula);
          if (caret !== null) s!.collapse(node, caret);
          record();
        }
        await typesetTyped(app, host);
      }).catch((e) => app.fail(e));
      return;
    }
    const md = isSmart('markdown') && /^[*_~`]$/.test(data) && !node.parentElement?.closest('a') ? markdownSpan(node.data.slice(0, offset)) : null;
    if (md) {
      app.history.beforeTyping(host, 'Markdown');
      const el = document.createElement(md.tag);
      el.textContent = md.words;
      const rest = node.splitText(offset);
      node.deleteData(md.start, offset - md.start);
      node.after(el);
      if (rest.data) sel.collapse(rest, 0);
      else {
        rest.remove();
        sel.collapse(el.parentNode!, [...el.parentNode!.childNodes].indexOf(el) + 1);
      }
      if (!node.data) node.remove();
      record();
      exit = { host, el };
      return;
    }
    const char = data === ' ' ? node.data.charAt(offset - 1) : data;
    const before = textBefore(host, node, offset - 1);
    const link = data === ' ' && isSmart('links') && !node.parentElement?.closest('a') ? smartLink(before) : null;
    const from = link ? offset - 1 - (before.length - link.start) : -1;
    if (link && from >= 0) {
      app.history.beforeTyping(host, 'smart link');
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + link.end - link.start);
      const a = document.createElement('a');
      a.setAttribute('href', link.href);
      range.surroundContents(a);
      host.normalize();
      if (a.nextSibling instanceof Text) sel.collapse(a.nextSibling, offset - from - (link.end - link.start));
      record();
      return;
    }
    const sub = substitution(before, char, { quotes: isSmart('quotes'), dashes: isSmart('dashes') });
    if (!sub || offset < sub.remove) return;
    app.history.beforeTyping(host, data === '"' || data === "'" ? 'smart quote' : 'smart dash');
    node.replaceData(offset - sub.remove, sub.remove, sub.insert);
    sel.collapse(node, offset - sub.remove + sub.insert.length);
    record();
  });
}
