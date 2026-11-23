---
name: write-slides
description: Use when someone wants new slides, a new talk, or an older deck converted into a talk, e.g. a PowerPoint, Beamer, or HTML deck.
---

# Write new slides

Agree with the speaker on the talk before you write a slide. Follow the rules under "Writing a talk" in `AGENTS.md` on every slide.

## Ask, then plan

1. Ask the speaker in one message for the length of the talk in minutes, the audience, the one point that the audience must take home, and the papers, figures, or older deck to start from. Count one slide per minute.
2. List the figures you were given, with what each one shows. Plan the talk around them, with one finding per figure.
3. Show the speaker the outline, one line per slide with its heading, its figure, and its steps. Write `index.html` only after the speaker agrees with the outline.
4. For a slide whose design is not obvious, e.g. a diagram or a derivation, describe two or three ways to draw it, each with its list of steps. Write the slide only after the speaker picks one.

## Write each slide

- Give each slide several steps, each with one new visual idea, e.g. a term, a color, or an arrow.
- Show a worked example before the general formula, with the symbols of the formula. Define on a slide the terms that are used on the next slide.
- Write a claim on a slide only when a paper of `references.bib` states it, and cite the paper there. Give the page of each claim in your hand-over. Ask the speaker when you cannot find a page.
- Write each callout as one plain sentence that a first-year graduate student can read.
- Split a slide with more than one idea or about 50 words into two slides, or cut text by the rule on speaker notes in `AGENTS.md`. Do not make the type smaller, and do not set widths to make the text fit.
- Write nothing on a slide that is not part of the talk, e.g. a placeholder, "TODO", a file name, or a note to the speaker. List what is missing in your hand-over instead.
- Scale a raster figure down to at most 3840 px across before you add it, and save a photograph as JPEG.

## Convert an older deck

To convert a PowerPoint deck, extract its text, images, and speaker notes with `python-pptx` into a scratch folder outside the talk folder. Put the notes into `aside.notes`, cut to the rules of `AGENTS.md`. Write each slide again with the layouts of the theme, without the positions, colors, or fonts of the old deck, and do not commit the extraction. For a Beamer deck, put its figures on the slides as PDF figures, and take its formulas from its TeX source.

## Hand over

Follow "Before you hand work over" in `AGENTS.md`. Compare each page of `slides.pdf` with the steps of the outline, then review the deck with `.agents/skills/refine-slides/SKILL.md`. Give the speaker the pages of the claims and the list of what is missing.
