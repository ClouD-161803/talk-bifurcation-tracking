// the TikZ figures of a session in theme/editor-tex.js: a new figure from a CSV file, a .tex file,
// or a blank drawing. the edit command writes each source into figures/ under a free name and
// compiles the figure once the deck holds it

import type { FigureLink } from '../session/port.ts';
import { fromHeader, headerOf, writeFigure } from './from-data.ts';
import type { Starter, TexHost, TexSheets } from './install.ts';

// a small drawing in the colors of styles/beeson-tikz.sty, with sizes left to the style
const BLANK = `\\begin{tikzpicture}
\\draw[line] (0,0) rectangle (4,3);
\\draw[accent, ->] (0.5,0.5) .. controls (1.5,2.8) and (2.5,0.2) .. (3.5,2.5);
\\fill[blue] (3.5,2.5) circle (2pt);
\\node[ink, above] at (2,3) {A TikZ figure};
\\end{tikzpicture}
`;

type Answer = { status: number; value: Record<string, unknown> | null };

/** The answer of the route figures/route of the edit command to body with the token of the page. */
export async function post(link: FigureLink, route: string, body: object): Promise<Answer> {
  const r = await fetch(new URL(`.session/figures/${route}`, location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: link.token(), ...body }) });
  return { status: r.status, value: await r.json().catch(() => null) };
}

// the error of an answer that is not OK, as a sentence of a note
export const failure = (a: Answer): Error => {
  const text = typeof a.value?.error === 'string' ? a.value.error : `the edit command answered ${a.status}`;
  return new Error(text[0].toUpperCase() + text.slice(1));
};

export function figures(host: TexHost): Pick<TexSheets, 'newFigure'> {
  const app = host.app;
  const note = (e: unknown): void => {
    app.note = { text: e instanceof Error ? e.message : String(e), warn: true };
    app.report();
  };
  return {
    async newFigure(from: Starter, file: File | null) {
      const link = host.link();
      if (!link) return;
      try {
        let stem = 'figure';
        let source = BLANK;
        if (file && from === 'file') {
          stem = file.name.replace(/\.tex$/i, '');
          source = await file.text();
        } else if (file && from === 'data') {
          const text = await file.text();
          const data = await post(link, 'data', { stem: file.name, text });
          const path = data.value?.path;
          if (data.status !== 200 || typeof path !== 'string') throw failure(data);
          // the figure is named after the CSV file as the edit command wrote it
          stem = path.slice('figures/'.length, -'.csv'.length);
          source = writeFigure(fromHeader(path, headerOf(text)));
        }
        const made = await post(link, 'source', { stem, source, base: null });
        const name = made.value?.name;
        if (made.status !== 200 || typeof name !== 'string') throw failure(made);
        await host.place(name);
      } catch (e) {
        note(e);
      }
    },
  };
}
