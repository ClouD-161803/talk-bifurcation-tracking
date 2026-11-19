import type { App, Region } from '../app.ts';
import { createFinder, type FindOptions, type Scope } from '../find.ts';
import { closeMenus, openMenu } from '../ui/menu.ts';

const IN: Region[] = ['canvas', 'text', 'field', 'navigator', 'notes', 'inspector'];
const NEXT = { mac: ['Mod+G'], other: ['F3'] };
const PREVIOUS = { mac: ['Mod+Shift+G'], other: ['Mod+Shift+F3'] };

const queryOf = (arg: unknown): string | undefined => (typeof arg === 'string' ? arg : undefined);

export function install(app: App): void {
  const finder = createFinder(app, { next: NEXT[app.platform], previous: PREVIOUS[app.platform] }, { open: openMenu, close: closeMenus });
  const c = app.commands;
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'F3' && !ev.altKey) ev.preventDefault();
  }, true);
  c.define({
    id: 'find.open',
    label: 'Find…',
    keys: { mac: ['Mod+F'], other: ['Mod+F'] },
    in: IN,
    menu: { bar: 'Edit', group: 'find', order: 40 },
    run: (_, arg) => finder.show('find', queryOf(arg)),
  });
  c.define({
    id: 'find.next',
    label: 'Find Next',
    keys: NEXT,
    in: IN,
    menu: { bar: 'Edit', group: 'find', order: 41 },
    enabled: () => !!finder.query,
    run: () => finder.step(1, !finder.open),
  });
  c.define({
    id: 'find.previous',
    label: 'Find Previous',
    keys: PREVIOUS,
    in: IN,
    menu: { bar: 'Edit', group: 'find', order: 42 },
    enabled: () => !!finder.query,
    run: () => finder.step(-1, !finder.open),
  });
  const selected = () => getSelection()?.toString().trim() ?? '';
  c.define({
    id: 'find.useSelection',
    label: 'Use Selection for Find',
    keys: { mac: ['Mod+E'], other: ['Mod+E'] },
    in: IN,
    menu: { bar: 'Edit', group: 'find', order: 42.5 },
    enabled: () => !!selected() && !selected().includes('\n'),
    run: () => finder.show('find', selected()),
  });
  c.define({
    id: 'find.replace',
    label: 'Replace…',
    keys: { mac: ['Ctrl+H'], other: ['Ctrl+H'] },
    in: IN,
    menu: { bar: 'Edit', group: 'find', order: 43 },
    run: (_, arg) => finder.show('replace', queryOf(arg)),
  });
  c.define({
    id: 'find.replaceOne',
    label: 'Replace',
    enabled: () => finder.open && finder.current >= 0,
    undoable: true,
    run: () => finder.replaceCurrent(false),
  });
  c.define({
    id: 'find.replaceAndFind',
    label: 'Replace & Find',
    enabled: () => finder.open && finder.current >= 0,
    undoable: true,
    run: () => finder.replaceCurrent(true),
  });
  c.define({
    id: 'find.replaceAll',
    label: 'Replace All',
    enabled: () => finder.open && finder.matches.length > 0,
    undoable: true,
    run: async () => {
      await finder.replaceAll();
    },
  });
  c.define({
    id: 'find.close',
    label: 'Close Find',
    enabled: () => finder.open,
    run: () => finder.hide(),
  });
  const option = (id: string, label: string, key: keyof FindOptions) =>
    c.define({ id, label, checked: () => finder.options[key], run: () => finder.toggle(key) });
  option('find.matchCase', 'Match Case', 'matchCase');
  option('find.wholeWords', 'Whole Words', 'wholeWords');
  c.define({ id: 'find.tex', label: 'Search TeX of Formulas', enabled: () => finder.scope !== 'alt', checked: () => finder.options.tex, run: () => finder.toggle('tex') });
  const scope = (id: string, label: string, value: Scope) =>
    c.define({ id, label, checked: () => finder.scope === value, run: () => finder.setScope(value) });
  scope('find.scopeAll', 'Slides and Notes', 'all');
  scope('find.scopeNotes', 'Notes Only', 'notes');
  scope('find.scopeAlt', 'Alt Texts', 'alt');
}
