import type { App } from '../app.ts';
import { locked } from '../canvas/drag.ts';
import { objectsOf, withTwins } from '../canvas/hit.ts';
import { hasRange, inText, keepCopies } from './clipboard.ts';
import { keepBeside } from './place.ts';
import { docOf, onSlides } from './slide.ts';
import { clearRange, selectedRange } from './table.ts';
import { removeJoining } from '../text/elements.ts';
import { dissolve } from './order.ts';
import { groupsOf } from '../model/groups.ts';

function selectedElements(app: App): Element[] {
  return objectsOf(app, app.selection.elements()).filter((el) => el.isConnected && !el.matches('.reveal .slides > section') && !!app.pairing?.elements.has(el));
}

export function install(app: App): void {
  app.commands.define({
    id: 'element.delete',
    label: 'Delete',
    keys: { mac: ['Backspace', 'Delete'], other: ['Delete', 'Backspace'] },
    in: ['canvas', 'navigator'],
    menu: { bar: 'Edit', group: 'clipboard', order: 23 },
    toolbar: { group: 'history', order: 12, icon: 'trash', label: 'Delete' },
    context: ['element'],
    enabled: (a) => (onSlides(a) ? a.commands.enabled('slide.delete') : inText(a) ? hasRange() : selectedElements(a).some((el) => !locked(el))),
    runsAs: (a) => (onSlides(a) ? 'slide.delete' : 'element.delete'),
    undoable: true,
    run: async (a) => {
      if (onSlides(a)) return a.commands.run('slide.delete');
      if (inText(a)) return void document.execCommand('delete');
      if (selectedRange(a)) return clearRange(a);
      const doc = docOf(a);
      const els = selectedElements(a);
      const kept = els.filter((el) => locked(el));
      const outer = withTwins(a, els.filter((el) => !locked(el) && !els.some((o) => o !== el && o.contains(el))));
      const keep = keepBeside(a, [...outer]);
      const held = keepCopies(a, [...outer]);
      await a.history.selecting('Delete', async () => {
        if (kept.length) a.selection.set('elements', kept);
        else a.selection.clear();
        const ids = outer.flatMap((el) => [el, ...el.querySelectorAll('[data-group]')].flatMap(groupsOf));
        await removeJoining(a, outer.reverse(), 'delete');
        dissolve(a, ids);
        keep((el, translate) => doc.setTag(el, { translate }, 'move'));
        held((el, translate) => doc.setTag(el, { translate }, 'move'));
      });
    },
  });
}
