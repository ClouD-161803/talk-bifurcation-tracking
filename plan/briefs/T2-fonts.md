# T2: a LaTeX-native font for the maths of the template, a text family to match, and the libration points in \mathcal

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first. You are a sibling thread of the orchestrator, and you talk to Claudio directly. The choice of the fonts is his, and he makes it by looking, hence you render the candidates and show them to him in this thread before you apply one. Report to the orchestrator with `t3_thread_send` when your work is committed.

## Claudio's words

> I am second guessing the font decision. I think the maths at least needs to get the latex native font. and then the text family should not clash too hard with this. [...] also on slide 3 the lagrange points have regular L and not mathcal, probably a slip. this stays true in future slides too.

## What is in place

- The maths is set by MathJax 4 with the font `mathjax-stix2`, configured in `theme/mathjax-config.js` and vendored under `theme/vendor/mathjax/mathjax-stix2-font/` by `scripts/vendor.mjs`, which `test/vendor.test.mjs` checks. The text family is `"STIX Two Text", Georgia, "Times New Roman", serif`, at line 67 of `theme/beeson.css`.
- MathJax 4 ships its fonts as npm packages named `@mathjax/mathjax-<name>-font`. The LaTeX-native candidates are `mathjax-modern` (Latin Modern Math, the font of a LaTeX document) and `mathjax-tex` (the Computer Modern look of the MathJax 2 era).
- On slide 3 the libration points are written as `L<sub>1</sub>` in the labels of the backdrop, and on slide 10 in the heading, whereas slide 16 writes `\(\mathcal L_1\)`. The deck of the talk defines a macro `\LL` in `/Users/claudiovestini/git/talks/bifurcation-tracking/theme/macros.js` for this.
- Your checkout is a worktree of the template on the branch `talk/fonts`, based on the local `main`.

## Tasks

1. Render the candidates. For the maths, take `mathjax-modern` and `mathjax-tex`. For the text, take Latin Modern Roman, the current STIX Two Text, and two more serif families that are set beside Latin Modern Math in print, e.g. Source Serif 4 and Libertinus Serif. Vendor each as font files under `theme/vendor/fonts/` with `@font-face` rules, and never load a font from a CDN. Render slides 4, 13, 16, and 18 of the demo deck, the math-heavy ones, in dark and in light, for each pair of maths and text font, with `scripts/chrome.mjs`, into a folder of PNGs named in your message. Show the set to Claudio in this thread with a table: the pair, the x-height and the stroke weight of the text next to the maths, the size of the vendored files, and your recommendation with its reason.
2. Apply the pair he chooses. Vendor the maths font through `scripts/vendor.mjs` and its test, set it in `theme/mathjax-config.js`, and set the text family in `theme/beeson.css`. Check the inline maths, the displays, the labels of the backdrops, the stepped math, and the editor.
3. Write the libration points with `\mathcal` everywhere in the demo deck. Add the macro `\LL` of the talk deck to `theme/macros.js` of the template. Use `\(\LL{1}\)` in the heading of slide 10 and in the labels of slide 3, since a label can hold MathJax, as the labels of slide 16 show. Say in the README, in the section on labels, how a libration point is written.
4. Run `npm test`, `npm run check`, and `npm run pdf`, commit on `talk/fonts`, and report.
