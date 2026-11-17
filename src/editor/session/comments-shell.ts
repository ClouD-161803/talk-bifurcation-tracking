// the parts of the shell that the comments of theme/session.js use, handed over in one field, see
// CommentsShell in src/session/client/handover.ts

import type { App } from '../app.ts';
import type { CommentsShell } from '../../session/client/handover.ts';
import { mathLookup } from '../math.ts';
import type { Navigator } from '../navigator/navigator.ts';
import { commentsTab } from '../shell/shell.ts';
import { describe } from '../steps.ts';

export function commentsShell(app: App): CommentsShell {
  const slideOf = (el: Element | null) => el?.closest('.reveal .slides section') ?? null;
  return {
    tab: commentsTab!,
    define(command) {
      app.commands.define(command);
      app.invalidate();
    },
    describe: (el) => describe(el, (m) => mathLookup()(m)?.tex ?? null),
    target() {
      const s = app.selection;
      const el = s.kind === 'slides' ? null : s.elements()[0] ?? (s.kind === 'text' ? s.items[0] : null) ?? app.caretHost();
      return { el: el ?? null, slide: slideOf(el ?? null) ?? (s.kind === 'slides' ? s.items[0] : null) ?? app.current() };
    },
    frame(el, slide) {
      const at = el ?? slide;
      if (!at) return;
      // the element is shown on the canvas, which the Slide Sorter covers
      if (app.commands.state('view.lightTable').checked) app.commands.run('view.lightTable');
      app.showSlide(at);
      if (el) app.selection.set('elements', [el]);
    },
    row: (slide) => (app.nav as Navigator).rowOf(slide),
  };
}
