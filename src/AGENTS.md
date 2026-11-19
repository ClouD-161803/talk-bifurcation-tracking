# AGENTS.md of the template source

The rules below are for work on the template itself: the theme, the editor, the exports, and the tests. They add to the root `AGENTS.md`.

## Bundles and vendored files

- Each bundle of `theme/` is compiled by `build.mjs` from an entry point under `src/`. `theme/editor-tex.js` is loaded when a sheet or the bibliography list is first opened, `theme/editor-pdf.js` with `theme/vendor/pdfjs/pdf.js` at the first PDF and by `npm run tex`, and `theme/editor-session.js` when a page starts or joins a session. Run `npm run build` after every change under `src/`. Commit the bundles with the change.
- Keep the editor out of `theme/beeson.js`. Nothing of the editor is loaded in decks opened without `edit`.
- Keep `theme/editor.js` under the budget in `test/build.test.mjs`. The editor is loaded from this file at each `edit`.
- Keep `theme/session.js` and `theme/edit.mjs` under their budgets in `test/build.test.mjs`. `theme/session.js` is loaded at each `edit` with `session`.
- Let `theme/session.js` reach the editor only through `src/session/client/handover.ts`. From `src/editor/`, import only `merge.ts`, `tokens.ts`, and types. Any other module would be a second copy with separate state, and `build.mjs` fails on it.
- Let the engine of the port reach the editor only through `src/editor/session/host.ts`. Import a module of the editor into `session.ts`, `apply.ts`, or `tree.ts` only with `import type`. `theme/editor-session.js` may not share any module with `theme/editor.js`, and `build.mjs` fails on one.
- Add what the session client needs from the editor as a small hook in `src/editor/session/`. Keep the drawing, the texts, and the styles in `src/session/client/`.
- Keep the edit command and the relay free of dependencies. They are run on Node 20 and later, on Windows, macOS, and Linux.
- Do not block the edit command with a long step. Every page of a session waits on its one process.
- The files in `theme/vendor/` are copied from `node_modules` by `scripts/vendor.mjs`. The TyCHO runtime and the Latin Modern Roman faces are the exceptions, and they are copied by hand. Add libraries that decks load to `scripts/vendor.mjs`, together with their licenses.
- In a Dependabot PR of the npm packages, only `package.json` and `package-lock.json` are changed. Before its merge, run `npm run vendor` and `npm run build` on its branch, and commit `theme/vendor/` and the bundles.
- The orbit engine in `src/orbits.ts` is a port of the MIT-licensed `orbits.ts` of claudiovestini.com, not of DyLAN code.

## Features

- Do not take design decisions that tie a feature to Chrome or to any one browser.
- Do not make users reach for a terminal. Whatever a talk needs from a command is written by the editor as well, e.g. `tex.js` from `npm run tex`.

## Theme

- Take every color from the custom properties of `theme/beeson.css`. Use orange for motion and progress, and violet for structure.
- Keep the plot palette, `--data-1` to `--data-8` of `theme/beeson.css`, as the Okabe–Ito palette, whose colors can be told apart with color vision deficiency. In the dark mode, its black is replaced by the color of the text. Keep the same colors in the same order in the styles of `styles/`.
- Keep `axes.formatter.use_mathtext` in the Matplotlib styles. The tick labels are then set as math, since cmr10, the fallback typeface of Matplotlib, does not have a minus sign.
- Set type in Latin Modern Roman at 22, 28, 36, 48, 64, or 96 px on the design size of 1920 by 1080. Set math in the TeX font of MathJax.
- Keep body text at 48 px, i.e. the 24 points of the AIAA guideline for a slide 7.5 in high. Keep captions and tables at 36 px, and code boxes at 22 px.
- When you rename a class or an attribute for the glossary, make the theme read only the new name. Add the old name to `test/names.test.mjs`, and under "Avoid" in its entry of `GLOSSARY.md`.
- Describe new or changed classes, attributes, and editor commands in `REFERENCE.md`, in the section of their element.
- When an editor command or an export is not available in a browser, tell the user so in a message in this browser.

## Demo deck

- The demo deck in `index.html` is the start of every new talk. It is also the page published on GitHub Pages from `main`.
- The tests of `npm test` are run on `test-deck.html`, a frozen copy of the demo deck. Hence you can change the demo deck without changing the tests.
- The two figures, `demo/broucke-sample.js`, and the TyCHO viewer of the demo deck are written by the scripts of `demo/`. Run them from the root of the repository, with a checkout of TyCHO next to it at the build from which `theme/vendor/tycho/` was copied.

  ```sh
  uv run --with matplotlib,numpy,scipy python demo/figures.py .
  uv run --project ../tycho/code python demo/broucke.py
  uv run --project ../tycho/code --with scipy python demo/tycho-scene.py index.html
  ```
- The clips of the demo deck are exported with tycho, as described in its CONTRIBUTING.md.

## Verifying

On a laptop, the whole suite of `npm test` takes over an hour, with every core busy. In each round of the workflow `check`, the suite is split over several runners. On a laptop, run only the test files of your change.

- Run test files with `npm test -- test/<name>.test.mjs`, which takes several files at once. Outside CI, they are run at the lowest priority of the system.
- Find the test files of a change by searching `test/` for the commands, classes, and functions that you changed.
- Do not run the whole suite, with `npm test -- --all` or a glob of test files, unless the person you work for asks. Push, and watch the round instead.
- Before you call a failure unrelated to your change, run its test file alone on `main`.
- Before you hand work over, run `npm run build`, `npm run typecheck`, the test files of your change, and `npm run check`. Hand work over only when all of them pass.
- Run `node --test test/perf.test.mjs` yourself after you change how backdrops are drawn. This test is skipped on CI.
- In the workflow `check`, `npm test` is run only in beeson-group/slides. In a talk, only the checks of the deck are run.
- A PR is checked on Ubuntu only: the tests, the deck in Chrome and in Firefox, and the figures. Windows, macOS, and Safari are checked on `main` after each merge.
- `npm test` is not run on macOS, since WebGL is drawn there by SwiftShader, too slowly for the timings of the tests.
- Before the merge of a change that is specific to Windows, macOS, or Safari, start a round on every system with `gh workflow run check --ref <branch>`. Watch this round as well.
- Fix a failed round on `main` before other changes are merged.

## Workflows

- In the workflow `pr-agent`, a comment is first read by the job `authorize`, whose token can only read and which does not have a concurrency group. Hence a comment that is not a command of a person with write access does not cancel a running review. Keep this job apart from the review.
- Keep the commands accepted by `authorize` equal to those of the pinned release of PR-Agent. Read the changelog of a new release before you bump its image.
- A PR from a fork is reviewed only on a command of a person with write access, since the events of a fork come with a read-only token and without the secrets. Comments on issues are ignored, since the number of an issue is read by PR-Agent as the number of a PR.

## Writing a test

A round is one run of the workflow `check` on a commit. A flaky test is a test that fails in a round without a fault in the code under test. On GitHub runners, with two to four cores, WebGL and video are drawn in software. Hence pages are many times slower there than on a laptop.

- Write a new test into the test file of its feature. Add a test file only for a feature that does not have one, and name the file after the feature, not after an issue or a review round.
- A test file with a failed test is run once more in the same job. A test that then passes is flaky. It is named in a warning of the round, and the round does not fail.
- Read the warnings of a round before the merge. Fix a flaky test of the code that you changed. For any other flaky test, open a `Bug` issue, or extend its open issue.
- Reproduce the failure of a flaky test first by forcing its condition. Do not run a failed job again in place of a fix.
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

## Browsers and reveal.js

- Animation frames are not given to hidden or background tabs. Bring a page to the front with `Page.bringToFront` before you wait for its frames.
- The system clipboard is shared between tests. Stub `navigator.clipboard`, or send copy and paste events with a `DataTransfer` of the page.
- Over the DevTools protocol, a trusted key runs an editing command, or clicks a button at Enter, only when it is sent with the command or with its text, e.g. `commands: ['selectAll']` or `text: '\r'`. In headless Chrome, a paste event is not fired at Mod+V.
- In headless Chrome, a file chooser is canceled unless `Page.setInterceptFileChooserDialog` is turned on before the trusted click that opens it. The cancel would race the files set by the test.
- Under load, an anti-aliased edge may be rastered a few levels apart. Compare the computed styles and boxes of two drawings, not their pixels.
- Text is laid out differently on each system. The sans-serif face of Linux is wider, and a caption there may be placed 1 px lower. On Windows, the space after a word is part of the selection of a double-click.
- A touch sent with `Input.dispatchTouchEvent` on a grip may be given by Chrome to the text element beside it. Make the pointer events of a touch on a grip in the page.
- IndexedDB does not answer a read while the virtual time of Chrome is paused.
- reveal.js blurs the focus when a page is shown again. In a test of a session, do not bring another page to the front, and send the edits of the other person over HTTP instead.
- reveal.js answers `isReady()` one timer before `.reveal` is given the class `ready`, and an Esc in between opens its overview. Wait for `.reveal.ready` before you send a key.
- A crash of a page may cancel the keepalive requests of the other pages of its renderer. In a test of a crash, send these requests by hand.
- A page opened with `open()` of `test/helpers/client.mjs` reads as visible behind another page, as the page of a person on another machine does. Set `window.__visibility` to `'hidden'` or `'real'` to change this.
- ⌘L and ⌥⌘L are taken by Safari before the page, and Shift+F3 and Ctrl+F3 by Chrome and Edge. A command bound to such a key has a second key as well, which is listed first in the menus of the browser that takes the first key.
- Outside a Mac, ] and [ need AltGr on German and Italian keyboards. Hence a menu lists first the key typed without AltGr. On a Mac, Option with an arrow and the Control keys of macOS, e.g. Control-D, are left to the text.
- The clipboard is read and written only through its events, which are allowed in every browser. Text read from it may come from any page. The folders in the path of a session page are its key, hence they are hashed before they are written.
- A page opened from `file:` cannot download a file, and `crypto.subtle` is missing outside a secure context.
- In Chrome, a space typed at the end of a text becomes a no-break space, and a character typed at the end of an inline element is put into this element. A space after the caret at the start of a text is dropped, and `selectionchange` is held back while keys come quickly.
- reveal.js marks only the fragments of the slide that it starts on. Its highlight plugin replaces the elements of a code box, hence code is colored in the editor with the CSS Custom Highlight API.
