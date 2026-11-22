import type { App } from '../app.ts';
import { EVERYWHERE, OUTSIDE_DIALOGS, type Command } from '../commands.ts';
import { canPick, canWrite, fileActions } from '../file/files.ts';
import { clearRecents, MAX_RECENT, recentLabel, recents } from '../file/recent.ts';
import { playTimings, usingTimings } from '../present.ts';
import { showIndices } from '../show.ts';

export async function presentAt(app: App, fromStart: boolean, tab = false): Promise<{ win: Window | null } | null> {
  const { h, v } = fromStart ? { h: 0, v: 0 } : showIndices(app, app.current());
  const shown = await app.files.present(v ? `#/${h}/${v}` : h ? `#/${h}` : '', tab);
  if (shown?.win && usingTimings()) void playTimings(shown.win);
  return shown;
}

const away = (a: App): string | null => (a.session ? 'Not available in a session' : null);

export function install(app: App): void {
  const c = app.commands;
  const both = (...keys: string[]) => ({ mac: keys, other: keys });
  c.define({
    id: 'file.open',
    label: 'Open…',
    keys: both('Mod+O'),
    in: OUTSIDE_DIALOGS,
    menu: { bar: 'File', group: 'open', order: 10 },
    enabled: (a) => !a.session,
    note: away,
    run: (a) => a.files.openFile(),
  });
  c.define({
    id: 'file.save',
    label: 'Save',
    keys: both('Mod+S'),
    in: EVERYWHERE,
    menu: { bar: 'File', group: 'save', order: 20 },
    toolbar: { group: 'save', order: 50, icon: 'save' },
    run: (a) => a.files.save(),
  });
  c.define({
    id: 'file.saveAs',
    label: 'Save As…',
    keys: both('Mod+Shift+S'),
    in: EVERYWHERE,
    menu: { bar: 'File', group: 'save', order: 21 },
    run: (a) => a.files.saveAs(),
  });
  c.define({
    id: 'file.autosave',
    label: 'Autosave',
    menu: { bar: 'File', group: 'save', order: 22 },
    enabled: (a) => canWrite() && !a.session,
    note: away,
    checked: (a) => a.autosave,
    run: (a) => a.files.toggleAutosave(),
  });
  c.define({
    id: 'file.revert',
    label: 'Revert to Saved',
    menu: { bar: 'File', group: 'save', order: 23 },
    enabled: (a) => a.dirty && a.state === 'loaded' && !a.session,
    note: away,
    run: () => fileActions().revert(),
  });

  const listed = () => (canPick() && !app.session ? recents() : []);
  const recent = (order: number, group = 'open'): Command['menu'] => ({ bar: 'File', group, order, submenu: 'Open Recent' });
  c.define({
    id: 'file.recent.none',
    label: 'Open Recent',
    get menu() {
      return listed().length ? undefined : { bar: 'File', group: 'open', order: 11 };
    },
    enabled: () => false,
    note: away,
    run: () => {},
  });
  for (let i = 0; i < MAX_RECENT; i++) {
    c.define({
      id: `file.recent.${i + 1}`,
      label: () => {
        const r = listed()[i];
        return r ? recentLabel(r) : '';
      },
      get menu() {
        return listed()[i] ? recent(11 + i / 100) : undefined;
      },
      enabled: (a) => !!listed()[i] && a.state !== 'starting',
      run: async () => {
        const r = listed()[i];
        if (r) await fileActions().openRecent(r);
      },
    });
  }
  c.define({
    id: 'file.recent.clear',
    label: 'Clear Menu',
    get menu() {
      return listed().length ? recent(11.5, 'clear') : undefined;
    },
    run: () => clearRecents(),
  });

  const exportTo = (order: number): Command['menu'] => ({ bar: 'File', group: 'export', order, submenu: 'Export To' });
  c.define({
    id: 'file.export.pdf',
    label: 'PDF…',
    menu: exportTo(40),
    enabled: (a) => a.state === 'loaded',
    run: () => fileActions().exportPdf(),
  });
  c.define({
    id: 'file.export.html',
    label: 'Editable HTML…',
    menu: exportTo(41),
    enabled: (a) => a.state === 'loaded' && !!a.pairing,
    run: () => fileActions().exportHtml(),
  });
  c.define({
    id: 'file.export.pptx',
    label: 'PowerPoint…',
    menu: exportTo(42),
    enabled: (a) => a.state === 'loaded',
    run: () => fileActions().exportPptx(),
  });
  c.define({
    id: 'file.print',
    label: 'Print…',
    keys: both('Mod+P'),
    in: EVERYWHERE,
    menu: { bar: 'File', group: 'print', order: 60 },
    enabled: (a) => a.state === 'loaded',
    run: () => fileActions().exportPdf('print'),
  });
  c.define({
    id: 'file.present',
    label: 'Present',
    keys: both('Mod+Enter'),
    in: OUTSIDE_DIALOGS,
    menu: { bar: 'File', group: 'present', order: 30 },
    toolbar: { group: 'present', order: 40, icon: 'present' },
    run: async (a) => void (await presentAt(a, false)),
  });
  c.define({
    id: 'file.presentStart',
    label: 'Present from Start',
    keys: both('Mod+Shift+Enter'),
    in: OUTSIDE_DIALOGS,
    menu: { bar: 'File', group: 'present', order: 31 },
    run: async (a) => void (await presentAt(a, true)),
  });
}
