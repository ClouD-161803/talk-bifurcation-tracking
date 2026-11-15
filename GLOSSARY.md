# Glossary

The words used in slides in a narrower sense than in everyday English, and the words coined for slides, are defined here, each with one meaning across the theme, the editor, `REFERENCE.md`, and the demo deck. An entry is added the moment a term is settled, and the classes, the attributes, and the labels of the editor are named after it. The old name of a renamed class or attribute is listed under "Avoid", so that you can convert an old talk by hand.

## Animated plot

A 2D figure on a slide that is played as an animation, drawn from the JSON data written next to it, with one or more plot panels.

Avoid "chart" and "graph". The class of an animated plot is `plot`.

## Attach

To join an end of a line to an element in the editor, so that the end is moved together with the element.

Avoid "glue".

## Backdrop

The drawing of orbits behind the words of a slide, or in its figure box, chosen by name from the built-in drawings or drawn from a file of trajectories.

Avoid "background", and avoid "scene", which means only a TyCHO scene. The attribute `data-scene` of an old talk is `data-backdrop`.

## Bibliography

The file `references.bib` next to the deck, from which the references of its citations are written into `tex.js`.

Avoid "library" and "references file".

## Citation

The empty `cite` after the cited words of a slide, with the key of a paper of the bibliography in `data-key`, drawn as the number of the paper on its slide.

Avoid "footnote", which is the `foot` line of a slide, and "reference", which is the short entry of the cited paper.

## Convention

A rule of slides that is followed by default and may be argued with, as opposed to a hard invariant.

## Dialog

A window of the editor that is shown over the deck to ask a question or to give a message, until it is answered or closed.

Avoid "card". The heading over the scrubber of the progress line is not a card either, and its class is `scrub-heading`.

## Figure box

The box at the right of a content slide or of a split slide in which a figure is placed.

Avoid "zone", the class of a figure box in an old talk, which is `figure-box`.

## Hard invariant

A rule of slides that is never traded away for another goal, and that an agent does not break without asking first. The hard invariants are listed at the top of `AGENTS.md`.

## Heading

The title line at the top of a slide, i.e. its `h2`, or the `h1` of a title slide.

Avoid "head" for the heading of a figure slide, since a head is the moving dot at the tip of a trajectory while it is traced, or the title of a theorem as in amsthm.

## Kind

The sort of a theorem, e.g. lemma, definition, or proof, written in `data-kind`, which gives its title, its style, and its counter.

Avoid "type" and "environment".

## Label

A short text placed at a point of a backdrop or of a surface, such as the name of L1 or of the Moon.

Avoid "lab", the class of a label in an old talk, which is `label`.

## Layer

The place of an element in the stacking order of its slide, i.e. which elements it is drawn in front of and which behind.

Avoid "layer" for the steps of a slide that the editor shows at once, which do not have a noun.

## Mark

A drawn element of an animated plot, such as a curve or a trace.

Avoid "mark" outside a plot. Write "bullet" for the sign of a list item, "logo" or "trademark" for a file in `brand/`, "surface point" for a point of a surface, and "Markdown syntax" for the signs that format a text.

## Part

A named scope or curve of a TikZ figure that a slide shows as a step.

Avoid "part" for an element of a slide or for a mark of an animated plot. A part is written with the key `part` in the source and with `data-part` on its span in the deck.

## Plate

The figure box over the whole of a figure slide, behind its heading and its caption.

Avoid "plate" for a layout of a slide, such as the title, closing, or figure layout.

## Plot panel

One set of axes of an animated plot, as a panel is in TyCHO.

Avoid "panel" for the text column of a split slide.

## Preamble

The LaTeX definitions of a talk in `preamble.tex` next to the deck, i.e. its macros, environments, packages, and kinds of theorem.

Avoid "macros file", "header", and "style file". The `theme/macros.js` of an old talk is moved into `preamble.tex` by `npm run tex`.

## Reference

The short entry of a cited paper in the footnote line of its slide, e.g. Koon et al., Chaos 10 (2000).

Avoid "footnote" and "citation".

## Sheet

A panel of the editor in which a source is edited with a live preview, i.e. the Preamble sheet and the Bibliography sheet, and the sheet of a formula.

Avoid "window", "dialog", and "pane".

## Slide Sorter

The view of the editor in which every slide is shown as a thumbnail in a grid, grouped by section, to select and reorder the slides and the sections, as in PowerPoint and Keynote.

Avoid "Chapters Table".

## Step

The click of the talk at which an element appears, is dimmed, or is hidden, written as a reveal.js fragment.

Avoid "fragment" outside the markup, and avoid "click" and "build". Avoid "card" for a step in the Steps pane of the editor.

## Surface point

A named point on a surface, which is shown, dimmed, or filled in a tone at a step.

Avoid "surface mark". The attribute `data-surface-marks` of an old talk is `data-surface-points`.

## Surface state

What a surface shows at a step, set on a fragment of its slide.

Avoid "stage". The attribute `data-surface-stage` of an old talk is `data-surface-state`. The states `flat`, `wells`, `bowl`, and `sum` of the function `effective-potential` in an old talk are `zero`, `gravitational`, `centrifugal`, and `effective`.

## Tab

One named data set of an animated plot, chosen with its button under the plot.

## Text box

A paragraph that is added to a slide with Insert > Text Box and placed freely, as in PowerPoint and Keynote. A text box is one kind of text element.

## Text column

The column of words at the left of a content slide or of a split slide. On a split slide it is a dark box of its own.

Avoid "panel", the class of the text column of a split slide in an old talk, which is `text-column`. The custom properties `--panel` and `--panel-text` of an old talk are `--text-column` and `--text-column-text`.

## Text element

An element whose text is edited in place in the editor, such as a heading, a paragraph, a list item, a cell of a table, a caption, the footnote, a display of math, a label, or the speaker notes.

Avoid "block". The class `block` of the words of a title or closing slide in an old talk is `title-text`.

## Theorem

A paragraph of the class `theorem`, headed by the title of its kind, its number, and its name, as a theorem, a lemma, or a proof in amsthm. The head of a theorem is this title, number, and name, which is not the head of a trajectory.

Avoid "statement", "block", "card", "box", and "environment".

## TikZ figure

A figure written in TikZ or pgfplots as a source `figures/name.tex`, compiled by `npm run tex` into the output `figures/name.js` with an SVG for each mode, and drawn into a `div.tikz` with the same name in `data-figure`.

Avoid "TikZ" alone for the element, and avoid "plot", which means an animated plot.

## Tone

A color of the theme chosen by name, such as accent, violet, blue, or red, with a value for each mode.

## Trajectory

One polyline of a file of trajectories, traced over its times or its true anomalies.

Avoid "strand" and "record". The attribute `data-strands` of an old talk is `data-trajectories`.
