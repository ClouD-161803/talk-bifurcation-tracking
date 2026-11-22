import type { App } from '../app.ts';
import { selectedRange } from '../commands/table.ts';
import { gridOf, spotsIn } from '../table.ts';
import { spanTargets } from './flow.ts';
import { textTarget } from './elements.ts';

export function formatTargets(app: App): Element[] {
  const pairing = app.pairing;
  if (!pairing) return [];
  const range = selectedRange(app);
  if (range?.box) return spotsIn(gridOf(range.table), range.box).map((s) => s.cell);
  const spanned = spanTargets(app).map((t) => t.host);
  if (spanned.length) return spanned;
  if (app.selection.kind === 'elements') return app.selection.elements().filter((el) => pairing.elements.get(el)?.open && !el.matches('.backdrop'));
  const t = textTarget(app);
  if (t) return [t.host];
  return app.selection.items.slice(0, 1).filter((el) => pairing.byLive.has(el));
}
