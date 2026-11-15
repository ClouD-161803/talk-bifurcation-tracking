// the list of the bibliography and the Citation pane, built into theme/editor-tex.js with the
// sheets. the list is opened at the caret by \cite{ typed in a text, by Insert > Citation…, or by
// a button of the pane, and it is filtered by author, year, title words, or key, with each entry
// shown as its reference on a slide. Enter puts the chosen paper into a citation, a comma adds a
// second one, and Esc closes the list. a BibTeX entry pasted into the list is added to
// references.bib and cited. each insert or change of a citation is one entry of the history, and
// its reference is drawn on the slide at once

import type { Entry } from '../../bibtex.ts';
import { readBibtex } from '../../bibtex.ts';
import { matches, namesOf, referenceOf, referenceParts } from '../../reference.ts';
import type { Tex } from '../../texfile.ts';
import type { App } from '../app.ts';
import { injectStyle, make } from '../ui/dom.ts';
import type { CiteTarget } from './install.ts';

// what the sheets give the list: the entries of references.bib once it is read, the read, the
// choice of the files of a deck opened from a file, and an addition to references.bib as an entry
// of the history
export type Store = {
  app: App;
  loaded(): boolean;
  entries(): Entry[];
  ensure(): Promise<void>;
  local(): boolean;
  choose(): Promise<void>;
  chooseLabel(): string;
  add(sources: string[]): void;
};

const CSS = `
.beeson-cite { position: fixed; z-index: 90; display: flex; flex-direction: column; width: min(440px, calc(100vw - 16px)); max-height: min(320px, 60vh); box-sizing: border-box; padding: 4px; border: 1px solid var(--ed-menu-line, #555); border-radius: 8px; background: var(--ed-menu, #2c2c2e); color: var(--ed-text, #eee); font: 12px/1.3 var(--ed-font, system-ui, sans-serif); box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28); }
.beeson-cite input { margin: 2px 2px 4px; padding: 4px 8px; border: 1px solid var(--ed-control-line, #555); border-radius: 6px; background: var(--ed-control, #333); color: inherit; font: inherit; }
.beeson-cite ul { margin: 0; padding: 0; overflow: auto; list-style: none; }
.beeson-cite li { padding: 4px 8px; border-radius: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
.beeson-cite li[aria-selected="true"] { background: var(--ed-select, #96f); color: var(--ed-on-select, #fff); }
.beeson-cite code, .beeson-edit-inspector .ed-cite code { margin-left: 2px; opacity: 0.7; font: 11px/1.3 ui-monospace, Menlo, Consolas, monospace; }
.beeson-cite .note { margin: 0; padding: 4px 8px; color: var(--ed-muted, #999); }
.beeson-cite .note:empty, .beeson-cite button[hidden] { display: none; }
.beeson-cite button, .beeson-edit-inspector .ed-cite button, .beeson-edit-inspector .ed-cites > button { padding: 3px 10px; border: 1px solid var(--ed-control-line, #555); border-radius: 6px; background: var(--ed-control, #333); color: var(--ed-text, #eee); font: inherit; cursor: default; }
.beeson-cite button { align-self: flex-start; margin: 2px 8px 6px; }
.beeson-edit-inspector .ed-cites { display: flex; flex-direction: column; gap: 12px; }
.beeson-edit-inspector .ed-cites > button { align-self: flex-start; }
.beeson-edit-inspector .ed-cite p { margin: 0 0 4px; font: 12px/1.4 var(--ed-font); color: var(--ed-text); }
.beeson-edit-inspector .ed-cite .ed-row { flex-wrap: wrap; align-items: center; }
.beeson-edit-inspector .ed-cite a { color: var(--ed-select); font: 12px/1.3 var(--ed-font); }
`;

const LIMIT = 100;
const DOI = /^\s*(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+\s*$/i;
const BIBTEX = /@\s*[A-Za-z]+\s*[{(]/;
// in a session, references.bib is a file of the talk folder, which the edit command reads
const HOST = 'In a session, the host adds a paper to references.bib in the talk folder.';

const keysOf = (cite: HTMLElement): string[] => (cite.dataset.key ?? '').split(',').map((k) => k.trim()).filter(Boolean);
const listed = (names: string[]): string => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`);
// a press on a button of the list or the pane leaves the focus and the range of a text where they are
const keepFocus = (el: HTMLElement): void => el.addEventListener('pointerdown', (ev) => ev.preventDefault());
const button = (cls: string, label: string, run: () => void): HTMLButtonElement => {
  const b = make('button', cls, label);
  b.type = 'button';
  keepFocus(b);
  b.addEventListener('click', run);
  return b;
};
const shown = (entry: Entry): (string | Node)[] => {
  const [before, italic, after] = referenceParts(referenceOf(entry));
  return [before, ...(italic ? [make('em', '', italic)] : []), after];
};

// the full entry of a paper: every author, the title, and the venue with its volume, pages, and year
function fullEntry(entry: Entry): HTMLElement[] {
  const { names, others } = namesOf(entry.fields.author ?? entry.fields.editor ?? '');
  const people = names.map((n) => [n.given, n.family].filter(Boolean).join(' '));
  const authors = others ? `${people.join(', ')} et al.` : listed(people);
  const ref = referenceOf(entry);
  const pages = (entry.fields.pages ?? '').replace(/-+/g, '–');
  const venue = [ref.venue, ref.volume && ref.venue ? ` ${ref.volume}` : '', pages ? `, ${pages}` : '', ref.year ? ` (${ref.year})` : ''].join('');
  return [authors, ref.title ?? '', venue.trim()].filter(Boolean).map((t, k) => make('p', k === 0 ? 'authors' : k === 1 ? 'title' : 'venue', t));
}

export function citations(store: Store): { cite(target: CiteTarget): void; key(ev: KeyboardEvent): boolean; pane(el: HTMLElement, cite: HTMLElement): void } {
  const app = store.app;
  injectStyle('cite', CSS);

  // the references of keys added to tex.js of the page, and the numbers of the deck drawn again
  function draw(keys: string[]): void {
    const page = window as unknown as { beesonTex?: Partial<Tex>; Beeson?: { refreshChrome?(): void } };
    const tex = (page.beesonTex ??= { macros: {}, environments: {}, packages: [], theorems: {}, references: {} });
    tex.references ??= {};
    for (const key of keys) {
      const entry = store.entries().find((e) => e.key === key);
      if (entry) tex.references[key] = referenceOf(entry);
    }
    page.Beeson?.refreshChrome?.();
    app.markDirty();
    app.invalidate('content');
  }

  // the list that is open, with its target
  type Open = { target: CiteTarget; box: HTMLElement; ul: HTMLUListElement; note: HTMLElement; choose: HTMLButtonElement; input: HTMLInputElement | null; items: Entry[]; at: number; query: string };
  let open: Open | null = null;

  // the text typed after \cite{ up to the caret of a typed list, with its text node, the offset of
  // the backslash, and the offset of the caret, or null once the caret has left it. a range of the
  // typed words, e.g. a double click on them, keeps the list open
  function typed(): { node: Text; from: number; at: number; text: string } | null {
    const r = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
    const node = r?.endContainer;
    if (!open?.target.typed || !r || r.startContainer !== node || !(node instanceof Text) || !open.target.host.contains(node)) return null;
    const from = node.data.slice(0, r.startOffset).lastIndexOf('\\cite{');
    return from < 0 ? null : { node, from, at: r.endOffset, text: node.data.slice(from + 6, r.endOffset) };
  }
  const textOf = (): string | null => (open?.input ? open.input.value : (typed()?.text ?? null));

  function close(back = true): void {
    if (!open) return;
    const { box, target, input } = open;
    open = null;
    box.remove();
    if (!back || !input) return;
    // the focus goes back to the text, with the caret or the citation as its range
    const host = target.host as HTMLElement;
    host.focus({ preventScroll: true });
    const r = target.range?.cloneRange() ?? document.createRange();
    if (target.cite?.isConnected) r.selectNode(target.cite);
    if (target.range || target.cite?.isConnected) {
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
    }
  }

  function place(): void {
    if (!open) return;
    const { box, target } = open;
    const s = getSelection();
    const rect = target.anchor?.getBoundingClientRect() ?? (target.typed && s?.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : (target.range ?? null)?.getBoundingClientRect()) ?? target.host.getBoundingClientRect();
    const r = rect.height ? rect : target.host.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(r.left - 8, window.innerWidth - box.offsetWidth - 8))}px`;
    box.style.top = `${r.bottom + 4 + box.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - box.offsetHeight - 4) : r.bottom + 4}px`;
  }

  function choose(i: number): void {
    if (!open) return;
    open.at = i;
    [...open.ul.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    open.ul.children[i]?.scrollIntoView({ block: 'nearest' });
  }

  // the rows of the entries that match the words after the last comma
  function fill(): void {
    if (!open) return;
    const text = textOf() ?? '';
    const query = text.slice(text.lastIndexOf(',') + 1).trim();
    const loaded = store.loaded();
    const all = loaded ? store.entries() : [];
    if (query !== open.query || !loaded || open.items.length !== Math.min(LIMIT, all.filter((e) => !query || matches(e, query)).length)) {
      open.query = query;
      open.items = all.filter((e) => !query || matches(e, query)).slice(0, LIMIT);
      open.ul.replaceChildren(...open.items.map((e, k) => {
        const li = make('li');
        li.setAttribute('role', 'option');
        li.dataset.key = e.key;
        li.append(...shown(e), ' ', make('code', '', e.key));
        li.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          choose(k);
          void accept();
        });
        return li;
      }));
      const exact = open.items.findIndex((e) => e.key === query);
      choose(exact < 0 ? 0 : exact);
    }
    if (loaded) {
      open.choose.hidden = true;
      if (!open.items.length && open.note.dataset.kind !== 'paste') open.note.textContent = query ? `No entry of references.bib matches ${query}. ${app.session ? HOST : 'Paste the BibTeX of the paper to add it.'}` : `references.bib does not have any entries yet. ${app.session ? HOST : 'Paste the BibTeX of a paper to add it.'}`;
      else if (open.note.dataset.kind !== 'paste') open.note.textContent = '';
    }
    place();
  }

  // the bibliography read, or the reason that it is not read yet with the control to choose it
  function read(): void {
    if (!open || store.loaded()) return fill();
    const o = open;
    const done = () => open === o && fill();
    const failed = (e: unknown) => {
      if (open !== o) return;
      o.note.textContent = `references.bib is not read: ${e instanceof Error ? e.message : String(e)}`;
      place();
    };
    if (!store.local()) {
      o.note.textContent = 'Reading references.bib…';
      void store.ensure().then(done, failed);
    } else {
      o.note.textContent = 'references.bib is not read yet, since a browser reads the files next to a deck opened from a file only after you choose them.';
      o.choose.textContent = store.chooseLabel();
      o.choose.hidden = false;
      o.choose.onclick = () => void store.choose().then(done, failed);
    }
    fill();
  }

  // the citation of keys put into the target, as one entry of the history
  function put(target: CiteTarget, keys: string[]): void {
    const host = target.host;
    const unique = [...new Set(keys)];
    if (!unique.length) return;
    if (target.cite) {
      const now = keysOf(target.cite);
      if (target.index === undefined) now.push(...unique);
      else now.splice(target.index, 1, ...unique);
      app.history.break();
      app.history.beforeTyping(host, 'Change Citation');
      target.cite.dataset.key = [...new Set(now)].join(',');
      app.history.afterTyping(host);
      app.history.break();
      draw(unique);
      return;
    }
    const s = getSelection();
    const cite = document.createElement('cite');
    cite.dataset.key = unique.join(',');
    const t = typed();
    if (target.typed && !t) return;
    app.history.break();
    app.history.beforeTyping(host, 'Insert Citation');
    if (t) {
      // the citation takes the place of \cite{ and of the words typed after it, and of the space
      // before it, since the number is put right after the cited words
      let from = t.from;
      while (from > 0 && /[\s ~]/.test(t.node.data[from - 1])) from--;
      const tail = t.node.splitText(t.at);
      t.node.deleteData(from, t.node.length - from);
      tail.before(cite);
      if (!t.node.length) t.node.remove();
    } else {
      // after the words of a selected range, as a citation follows the cited words
      const range = target.range?.cloneRange() ?? document.createRange();
      if (!target.range) {
        range.selectNodeContents(host);
      }
      range.collapse(false);
      range.insertNode(cite);
    }
    // the caret after the citation is put into a text node, so that the next typing is not put
    // into the cite
    const sibling = cite.nextSibling;
    const next = sibling instanceof Text ? sibling : document.createTextNode('');
    if (next !== sibling) cite.after(next);
    (host as HTMLElement).focus({ preventScroll: true });
    s?.collapse(next, 0);
    app.history.afterTyping(host);
    app.history.break();
    after = { cite, next };
    draw(unique);
  }

  // a browser puts the caret after an empty element at the end of the text before it, hence the
  // first character typed after a new citation is put after it here
  let after: { cite: HTMLElement; next: Text } | null = null;
  window.addEventListener('beforeinput', (ev) => {
    const a = after;
    after = null;
    const s = getSelection();
    const host = a && app.hostOf(a.cite);
    if (!a || !host || ev.inputType !== 'insertText' || !ev.data || ev.defaultPrevented || !s?.isCollapsed || !a.next.isConnected || a.next.previousSibling !== a.cite) return;
    const before = a.cite.previousSibling;
    const n = s.anchorNode;
    if (!((n === a.next && s.anchorOffset === 0) || (n === before && n instanceof Text && s.anchorOffset === n.length) || (!!n && n === a.cite.parentNode && s.anchorOffset === [...n.childNodes].indexOf(a.cite)))) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    app.history.beforeTyping(host);
    a.next.insertData(0, ev.data);
    s.collapse(a.next, ev.data.length);
    app.history.afterTyping(host);
    app.markDirty();
    app.invalidate('content');
  }, true);
  document.addEventListener('pointerdown', () => (after = null), true);

  // the keys of the text of the list: each word before a comma as its key, and the chosen entry
  // for the words after the last comma, or null when the words do not match an entry
  function keysOfText(): string[] | null {
    if (!open) return null;
    const text = textOf() ?? '';
    const parts = text.split(',').map((p) => p.trim());
    const last = parts.pop() ?? '';
    const chosen = open.items[open.at]?.key;
    if (!chosen && (last || !parts.some(Boolean))) return null;
    return [...parts.filter(Boolean), ...(chosen ? [chosen] : [])];
  }

  function accept(): boolean {
    if (!open || !store.loaded()) return false;
    const keys = keysOfText();
    if (!keys) return false;
    const { target } = open;
    put(target, keys);
    close(false);
    if (target.cite?.isConnected) {
      // the citation stays the range of its text, whose pane shows its papers
      const r = document.createRange();
      r.selectNode(target.cite);
      (target.host as HTMLElement).focus({ preventScroll: true });
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
      app.invalidate('selection');
    }
    return true;
  }

  // a BibTeX entry pasted into the list is added to references.bib and cited, together with the
  // papers before the last comma. an entry whose key is in references.bib is cited as it is there.
  // an entry pasted in a session is refused with a note
  function pasted(text: string): boolean {
    if (!open) return false;
    const o = open;
    const note = (t: string) => {
      o.note.dataset.kind = 'paste';
      o.note.textContent = t;
      place();
    };
    if (DOI.test(text)) {
      note(`A DOI is not looked up, since the editor does not fetch anything. ${app.session ? HOST : 'Paste the BibTeX of the paper instead, e.g. from Zotero or from the page of the journal.'}`);
      return true;
    }
    if (!BIBTEX.test(text)) return false;
    if (app.session) {
      note(HOST);
      return true;
    }
    if (!store.loaded()) {
      note('references.bib is not read yet, hence the entry is not added.');
      return true;
    }
    const bib = readBibtex(text);
    if (!bib.entries.length) {
      note(`This BibTeX is not added, since ${bib.skipped[0]?.reason ?? 'it does not hold an entry'}.`);
      return true;
    }
    const known = new Set(store.entries().map((e) => e.key));
    const fresh = bib.entries.filter((e, k) => !known.has(e.key) && bib.entries.findIndex((f) => f.key === e.key) === k);
    const typedText = textOf() ?? '';
    const before = typedText.split(',').slice(0, -1).map((p) => p.trim()).filter(Boolean);
    const { target } = o;
    void app.history.transact(target.cite ? 'Change Citation' : 'Insert Citation', () => {
      if (fresh.length) store.add(fresh.map((e) => text.slice(e.start, e.end)));
      put(target, [...before, ...bib.entries.map((e) => e.key)]);
    }).catch((e) => app.fail(e));
    close(false);
    return true;
  }

  // the typing after \cite{: a comma puts the key of the chosen entry in place of the words before
  // it, and a closing brace inserts the citation as Enter does
  function typedInput(): void {
    const t = typed();
    if (!t || !open) return close(false);
    if (t.text.endsWith('}')) {
      t.node.deleteData(t.at - 1, 1);
      getSelection()!.collapse(t.node, t.at - 1);
      fill();
      // a key that matches no paper keeps its brace, as typed TeX
      if (!open.items.length) {
        t.node.insertData(t.at - 1, '}');
        getSelection()!.collapse(t.node, t.at);
        return close(false);
      }
      accept();
      return;
    }
    if (t.text.endsWith(',')) commaIn(t.text, (start, end, key) => {
      const s = getSelection()!;
      const at = t.from + 6;
      t.node.replaceData(at + start, end - start, key);
      s.collapse(t.node, at + start + key.length + 1);
      app.history.afterTyping(open!.target.host);
    });
    open.note.dataset.kind = '';
    fill();
  }
  // the words between the last two commas of text replaced by the key of the chosen entry
  function commaIn(text: string, replace: (start: number, end: number, key: string) => void): void {
    const end = text.length - 1;
    const start = text.lastIndexOf(',', end - 1) + 1;
    const words = text.slice(start, end).trim();
    const key = open?.items[open.at]?.key;
    if (!words || !key || store.entries().some((e) => e.key === words)) return;
    replace(start, end, key);
  }

  document.addEventListener('input', (ev) => {
    if (open?.target.typed && open.target.host.contains(ev.target as Node)) typedInput();
  });
  document.addEventListener('selectionchange', () => {
    if (open?.target.typed && !typed()) close(false);
  });
  document.addEventListener('paste', (ev) => {
    if (!open || !(ev.target instanceof Node) || !(open.input ?? open.target.host).contains(ev.target)) return;
    if (!pasted(ev.clipboardData?.getData('text/plain') ?? '')) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
  app.listen('slide', () => close(false));

  return {
    cite(target) {
      close(false);
      const box = make('div', 'beeson-cite');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Bibliography');
      keepFocus(box);
      const ul = make('ul');
      ul.setAttribute('role', 'listbox');
      ul.setAttribute('aria-label', 'Entries of references.bib');
      const note = make('p', 'note');
      note.setAttribute('aria-live', 'polite');
      const pick = button('choose', 'Choose Files…', () => {});
      pick.hidden = true;
      let input: HTMLInputElement | null = null;
      if (!target.typed) {
        input = make('input');
        input.type = 'search';
        input.placeholder = app.session ? 'Author, year, title, or key' : 'Author, year, title, key, or pasted BibTeX';
        input.setAttribute('aria-label', 'Search');
        input.addEventListener('input', () => {
          if (input!.value.endsWith(',')) commaIn(input!.value, (start, end, key) => (input!.value = `${input!.value.slice(0, start)}${key},`));
          note.dataset.kind = '';
          fill();
        });
        input.addEventListener('blur', () => setTimeout(() => open?.input === input && document.activeElement !== input && close(false), 0));
        box.append(input);
      }
      box.append(note, pick, ul);
      document.body.append(box);
      open = { target, box, ul, note, choose: pick, input, items: [], at: 0, query: '\u0000' };
      read();
      input?.focus();
      if (target.typed) target.host.addEventListener('blur', () => setTimeout(() => open?.target === target && !target.host.contains(document.activeElement) && close(false), 0), { once: true });
    },
    key(ev) {
      if (!open || ev.isComposing || !(ev.target instanceof Node) || !(open.input ?? open.target.host).contains(ev.target)) return false;
      const n = open.items.length;
      const mod = ev.metaKey || ev.ctrlKey || ev.altKey;
      if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && n && !mod) choose((open.at + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n);
      else if ((ev.key === 'Enter' || ev.key === 'Tab') && !mod && !ev.shiftKey) {
        // a key that does not insert is kept from the text, where Enter would start a new line
        accept();
      } else if (ev.key === 'Escape') close();
      else {
        // the other keys of the search field are typed into it, and not run as keys of the editor
        if (open.input) ev.stopImmediatePropagation();
        return false;
      }
      return true;
    },
    pane(el, cite) {
      const keys = keysOf(cite);
      const known = new Map(store.entries().map((e) => [e.key, e]));
      const sig = `${keys.join(',')}\n${store.loaded()}\n${keys.map((k) => known.get(k)?.start ?? -1).join()}\n${store.entries().length}`;
      if (el.dataset.sig === sig) return;
      el.dataset.sig = sig;
      const host = app.hostOf(cite);
      if (!host) return;
      const list = make('div', 'ed-cites');
      if (!store.loaded()) {
        const note = make('p', 'ed-note', 'references.bib is not read yet.');
        const again = () => {
          delete el.dataset.sig;
          if (cite.isConnected) this.pane(el, cite);
        };
        if (!store.local()) void store.ensure().then(again, (e) => (note.textContent = `references.bib is not read: ${e instanceof Error ? e.message : String(e)}`));
        list.append(note, ...(store.local() ? [button('choose', store.chooseLabel(), () => void store.choose().then(again, (e) => app.fail(e)))] : []));
        el.replaceChildren(list);
        return;
      }
      const at = (anchor: Element, index?: number) => this.cite({ host, cite, index, anchor });
      keys.forEach((key, index) => {
        const entry = known.get(key);
        const part = make('div', 'ed-cite');
        part.dataset.key = key;
        part.append(...(entry ? fullEntry(entry) : [make('p', 'missing', `${key} is not in references.bib.`)]));
        const row = make('div', 'ed-row');
        const change = button('change', 'Change Paper…', () => at(change, index));
        row.append(change);
        if (keys.length > 1) {
          row.append(button('remove', 'Remove', () => {
            app.history.break();
            app.history.beforeTyping(host, 'Change Citation');
            cite.dataset.key = keys.filter((_, k) => k !== index).join(',');
            app.history.afterTyping(host);
            app.history.break();
            draw([]);
          }));
        }
        const doi = entry && referenceOf(entry).doi;
        if (doi) {
          const a = make('a', 'doi', 'Open DOI');
          a.href = `https://doi.org/${doi}`;
          a.target = '_blank';
          a.rel = 'noopener';
          a.title = doi;
          row.append(a);
        }
        part.append(row, make('code', '', key));
        list.append(part);
      });
      const add = button('add', 'Add Paper…', () => at(add));
      list.append(add);
      el.replaceChildren(list);
    },
  };
}
