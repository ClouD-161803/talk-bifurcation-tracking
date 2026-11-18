# AGENTS.md of the template source

The rules below are for work on the template itself: the theme, the editor, the exports, and the tests. They add to the root `AGENTS.md`.

## Bundles and vendored files

- The theme is compiled from `src/main.ts` into `theme/beeson.js`. The editor is compiled from `src/editor/main.ts` into `theme/editor.js`. The preamble and bibliography sheets are compiled from `src/editor/tex/sheets.ts` into `theme/editor-tex.js`, which is loaded when a sheet or the bibliography list is first opened. The renderer of PDF figures is compiled from `src/editor/pdf/render.ts` into `theme/editor-pdf.js`, which the editor loads with `theme/vendor/pdfjs/pdf.js` at the first PDF, and which `npm run tex` loads into Chrome. The engine of the port of a session, `src/editor/session/session.ts`, `apply.ts`, and `tree.ts`, is compiled from `src/editor/session/entry.ts` into `theme/editor-session.js`, which the editor loads when a page starts or joins a session. Run `npm run build` after every change under `src/`. Commit the bundles with the change.
- Keep the editor out of `theme/beeson.js`. Nothing of the editor is loaded in decks opened without `edit`.
- Keep `theme/editor.js` under the budget in `test/build.test.mjs`. The editor is loaded from this file at each `edit`.
- The session client is compiled from `src/session/client/main.ts` into `theme/session.js`. The edit command is compiled from `src/edit/main.ts` into `theme/edit.mjs`. Keep both under their budgets in `test/build.test.mjs`. `theme/session.js` is loaded at each `edit` with `session`.
- Let `theme/session.js` reach the editor only through `src/session/client/handover.ts`. From `src/editor/`, import only `merge.ts`, `tokens.ts`, and types. Any other module would be a second copy with separate state, and `build.mjs` fails on it.
- Let the engine of the port reach the editor only through `src/editor/session/host.ts`. Import a module of the editor into `session.ts`, `apply.ts`, or `tree.ts` only with `import type`. `theme/editor-session.js` may not share any module with `theme/editor.js`, and `build.mjs` fails on one.
- Add what the session client needs from the editor as a small hook in `src/editor/session/`. Keep the drawing, the texts, and the styles in `src/session/client/`.
- Keep the edit command and the relay free of dependencies. They are run on Node 20 and later, on Windows, macOS, and Linux.
- Do not block the edit command with a long step. Every page of a session waits on its one process.
- The files in `theme/vendor/` are copied from `node_modules` by `scripts/vendor.mjs`. The TyCHO runtime and the Latin Modern Roman faces are the exceptions, and they are copied by hand. Add libraries that decks load to `scripts/vendor.mjs`, together with their licenses.
- The orbit engine in `src/orbits.ts` is a port of the MIT-licensed `orbits.ts` of claudiovestini.com, not of DyLAN code.

## Features

- Do not take design decisions that tie a feature to Chrome or to any one browser.
- Do not make users reach for a terminal. Whatever a talk needs from a command is written by the editor as well, e.g. `tex.js` from `npm run tex`.

## Theme

- Take every color from the custom properties of `theme/beeson.css`. Use orange for motion and progress, and violet for structure.
- Set type in Latin Modern Roman at 22, 28, 36, 48, 64, or 96 px on the design size of 1920 by 1080. Set math in the TeX font of MathJax.
- Keep body text at 48 px, i.e. the 24 points of the AIAA guideline for a slide 7.5 in high. Keep captions and tables at 36 px, and code boxes at 22 px.
- When you rename a class or an attribute for the glossary, make the theme read only the new name. Add the old name to `test/names.test.mjs`, and under "Avoid" in its entry of `GLOSSARY.md`.
- Describe new or changed classes, attributes, and editor commands in `REFERENCE.md`, in the section of their element.
- When an editor command or an export is not available in a browser, tell the user so in a message in this browser.

## Demo deck

- The demo deck in `index.html` is the start of every new talk. It is also the page published on GitHub Pages from `main`.
- The tests of `npm test` are run on `test-deck.html`, a frozen copy of the demo deck. Hence you can change the demo deck without changing the tests.

## Before you hand work over

- Run `npm run build`, `npm run typecheck`, the test files of what you changed, and `npm run check`. Hand work over only when all of them pass.
- Run one test file with `node --test test/<name>.test.mjs`. The whole suite takes over an hour on one machine. In the workflow `check`, it is split over seven runners per system.
- Run `node --test test/perf.test.mjs` yourself after you change how backdrops are drawn. This test is skipped on CI.
- In the workflow `check`, `npm test` is run only in beeson-group/slides. In a talk, only the checks of the deck are run.
- A draft is tested on Ubuntu only. The test shards on Windows are run in the round that is started when the PR is marked as ready. Watch this round as well.

## Writing a test

A round is one run of the workflow `check` on a commit. A flaky test is a test that fails in a round without a fault in the code under test. On GitHub runners, with two to four cores, WebGL and video are drawn in software. Hence pages are many times slower there than on a laptop.

- Fix flaky tests before the merge. Reproduce the failure first by forcing its condition. Do not run the failed job again in place of a fix.
- Do not read results after a fixed wait. Wait for the state of the page with `page.waitFor`. Read the result once this state is reached.
- Record the states of previews and animations with a clock in the page, and assert the record. A state may be over before it is read in the test.
- Wait for the end of animations, transitions, and mode flips by their state. Give them 60 s on slides with a surface, a video, or a TyCHO viewer.
- Open pages with `motion: true` in tests of animations. Reduced motion is set on the Windows and macOS runners.
- Type the keys of one history entry with `typeKeys` or `type` of `test/helpers/editor.mjs`. Two keys more than a second apart are two entries.
- Bound a time by the same time on a smaller case, not by a number of milliseconds. Measure a time over its bound again before the test fails.
- Give each test a limit longer than the sum of the waits inside it. Keep each read of a page under a minute on a runner, or give the browser a longer limit with `launch({ timeout })`.
- When the target may be moved between the read of its place and the click, click again until the state is reached.
- After a click that loads the page again, wait for the new page with `page.waitFor`. Catch the error "Inspected target navigated or closed" of the click. It is the answer of Chrome to a read in flight at the reload.
- Count the requests of a page for the file under test by its name. Another file of the deck may be answered between two reads.
- Find slides of `test-deck.html` by their content, not by their number, and assert that they are found.
- Pass `drafts: true` to a page only in tests of the unsaved edits. These edits are offered on a dialog to the next page of the same test.
- Do not export `GIT_DIR`, `GIT_WORK_TREE`, or `GIT_INDEX_FILE` in a test. Git then works on the repository that they name.
