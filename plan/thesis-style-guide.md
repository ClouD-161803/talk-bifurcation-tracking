# Style guide extracted from the senior thesis deck (workflow thesis-style-review)

# Style guide for the bifurcation-tracking deck

The evidence is Claudio's senior thesis deck (Beamer, 18 frames, 56 pages, one page per build step), cited by PDF page.

## Maths reveal

Make one fragment per step, and let a step be a sentence, a whole display, a figure, or a color change. A display enters whole, even across two lines (pages 20, 28, and 42), hence wrap the full MathJax block in one `class="fragment"` element. Show the lead-in sentence, ending in a colon, as its own fragment, then the display, then the sentence that interprets it (pages 19 to 22, and 52 to 56).

Give a highlight its own fragment, in which only a shown symbol changes color. On page 21, z° and H_i turn orange. Reuse one color for a word and its symbol, as with "samples" and x^(i) on pages 39 and 42. Wrap such a symbol in MathJax `\class{...}{}` and switch its color with a fragment at a set `data-fragment-index`. Give two elements one shared index when they enter in one step.

## Figures and videos

Give each figure its own fragment, after its text. The readers disagree on placement. The layout reader found figures centered below the text on most frames, with a text-left, figure-right split only on the theorem frame (pages 35 to 37), whereas the pacing reader saw figures enter in the right half. In the template every figure goes in the right zone. Loop each video, with a poster. Two readers report autoplay on entry and one reports click-started plays, hence start a results scene on slide entry.

## Density and pacing

At 18 slides in 30 minutes, plan about 100 s per slide and 35 to 55 fragments in all. Follow the thesis arc of motivation, a preview of contributions, theory, algorithm, application, and results. Give each method slide 3 to 5 fragments in the order sentence, display, figure, and each results slide one scene with 0 or 1 fragments. Keep the first step to 13 to 31 words and the full slide to 40 to 107 words, in bullets of one sentence. End a maths slide on one display of one or two lines.

## Do and do not

Do these.

1. Show a lead-in sentence one step before its display (pages 19 and 20).
2. Spend a step on a color link between a word and its symbol (page 21).
3. Carry a results slide on one looping video (pages 46 and 47).

Do not do these.

1. Do not build a display term by term, since the two-line recursion of page 28 enters whole.
2. Do not reveal a statement and three displays in one step, as on page 35 (158 words by page 37).
3. Do not remove text from the column. Replace only a figure, in place, as on page 33.

## What does not transfer

In the thesis, past steps stay at full opacity, whereas the template dims them to 45%. Accept the dimming for past bullets, but keep the display that the current sentence explains at full strength, and undim a symbol that a highlight colors. The readers did not report the template's class names, hence look them up in the template.

Write HTML and MathJax rather than full-slide pictures, and use a tycho scene in place of heavy rasters such as the 6.7 MB plot of page 33.

The thesis spent four outline pages (2, 17, 38, and 51) on an agenda with the other sections grayed. With about 18 slides, keep at most one short agenda slide.

# Critique (completeness check)

**(a) Claims the findings do not support**
1. "In the template every figure goes in the right zone." None of the readers described the template. The layout reader recommends a single column almost everywhere.
2. "Give two elements one shared index" has no cited instance in the findings.
3. "At most one short agenda slide" goes against the pacing reader, who recommends an agenda slide between sections. The guide does not mark this as its own choice.

**(b) Findings left out that a deck writer would want**
1. Color carries meaning across the deck. Bold blue marks benefits and the objective, and dark red marks problems and constraints. Orange marks the column headers. The words "objective" and "projection" on pages 44 to 45 match the loop colors of the flowchart.
2. A display can be color-coded on its first appearance, without a highlight step. The page 28 recursion shows e in blue and z in red.
3. Citations appear in small gray type, and on pages 35 to 36 a citation gets a step of its own. Image credits sit in tiny gray type at the foot of the slide.
4. Text can be appended to the same line, as on page 26. Contributions brings in one column per step.
5. The deck opens on one long build of 9 steps.
6. Titles are bold black sans, flush left, with a frame number at the bottom right and no logos.
7. Each video is 15 s long at a 3:1 ratio, and a click pauses it. Slide 16 chains three videos one after another without a click.

**(c) Contradictions the guide hid**
1. The highlight on page 21 differs by reader. The maths reader says z° and H_i turn orange, the pacing reader says only H_i, and the layout reader puts it on slide 22.
2. On the Dykstra frame, the layout reader shows the plot and the equations entering together on slide 28. The other two readers show separate steps on pages 27 and 28.
3. The readers count steps differently. The maths reader counts pages (Euclidean 5), and the pacing reader counts pages minus one (Euclidean 4).
4. The maths reader says page 28 has no lead-in sentence. This is an exception to the guide's rule of lead-in, then display.

# Raw findings of the three readers

## Lens maths-reveal
The pptx contains no PowerPoint build animations. The builds are Beamer overlays, one PDF page per step, and each step was imported into PowerPoint as its own slide, so the steps can be counted as consecutive pages.

**Evidence for this.** Each of the 56 pptx slides holds one full-slide SVG (9144000 x 5143500 EMU). Every slide has no `p:timing` except slides 16, 46, 47, and 49, where the only entry is an after-previous `mediacall` that autoplays a video. Slides 40 to 42 also hold unanimated PowerPoint arrows and text boxes. `pdfinfo` gives "LaTeX with Beamer class" as the creator. The Acrobat PDF has 56 pages, which map one to one onto the pptx slides. The handout has 14 pages, i.e. the final state of each frame without the four outline pages (2, 17, 38, and 51). The deck's title is "Dykstra's Algorithm: Stalling Resolution and Applications", and optimal transport appears only as the application on pages 39 to 45. `pdftoppm` is present. I read the text diffs between consecutive pages with `pdftotext` and checked the visual steps on rendered pages.

**Steps per maths frame**
- Euclidean projections, pages 18 to 22: 5 steps.
- Dykstra's algorithm, pages 23 to 28: 6 steps.
- Stalling phenomenon, pages 29 to 33: 5 steps, and page 29 holds only the title.
- Stalling theorem, pages 34 to 37: 4 steps, and page 34 holds only the title.
- Optimal transport problem, pages 39 to 42: 4 steps.
- Projected gradient descent, pages 43 to 45: 3 steps.
- Parameterisation, pages 52 to 56: 5 steps.
- Non-maths frames: Motivation (pages 3 to 12) has 10 steps, and Contributions (pages 13 to 16) has 4, one column per step.

**Granularity.** The unit of a step is a bullet, a whole display, a figure, or a color highlight. A display always appears whole, even when it spans several lines. The two-line constrained quadratic program (page 20), the two-line Dykstra recursion (page 28), and the two-line transport program (page 42) each appear in one step. The theorem on page 35 is the extreme case: the statement and three displays (the sets A and S and N_stall) appear in one step. The deck never builds a display term by term or line by line.

**Highlight steps.** One step changes only color: on page 21, z° and H_i in the existing program turn orange, and nothing else changes. Orange then links words to symbols across steps.
- The word "samples" is orange on page 39, and so is x^(i) in the program on page 42.
- On page 22, P_{H_i} is orange in the bullet that follows the program.
- "constraints" is orange on page 55, and the boxed constraint follows on page 56.
- On pages 44 and 45, "objective" is navy and "projection" dark red. These colors match the blue outer loop and the red inner loop of the flowchart that follows.
- The Dykstra recursion on page 28 is color-coded from its first appearance, with e in blue and z in red.

The deck has no arrows or callout labels as build steps.

**Persistence.** Earlier content stays at full opacity, without dimming. A step replaces content in two cases:
- On page 33, a second stalling plot takes the place of the plot from page 32.
- On page 26, "Solution: Dykstra's algorithm" is appended to the existing line rather than given a new bullet.

On page 37, the figure enters at the right and the theorem moves to a left column. This matches the text-left, figure-right layout of the new template.

**Text and maths alternate.** A lead-in sentence ending in a colon appears one step before its display, and the next sentence follows the display.
- Pages 19 to 22: sentence, then program, then highlight, then sentence.
- Pages 41 and 42: sentence, then program.
- Pages 52 to 56: sentence, then formula, then figure, then sentence, then boxed formula.

The exceptions are page 28, where the recursion appears without a lead-in sentence, and page 35, where the whole theorem appears at once. Figures also take steps of their own (pages 24, 27, 32, 33, 37, and 54).

**Final state.** Most maths frames end with one display of one or two lines, plus inline maths in the bullets (pages 22, 28, 42). The stalling frame ends with one inline formula (page 33). Parameterisation ends with two displays, the second boxed (page 56). The theorem frame ends with three displays next to a figure of three panels (page 37).

**Three examples of the build order**
1. Euclidean projections, pages 18 to 22.
   1. The definition bullet and the point-to-set sketch (z°, z*, H).
   2. The sentence "When the set H is the intersection of n subsets... the following constrained quadratic program:".
   3. The two-line program (minimise ½‖z − z°‖², subject to z ∈ ∩H_i).
   4. z° and H_i in the program turn orange.
   5. The bullet "P_H(z°) is often intractable, but individual projections P_{H_i} can be easy", with P_{H_i} in orange.
2. Dykstra's algorithm, pages 23 to 28.
   1. The bullet on the method of alternating projections, with its citation in gray.
   2. The plot of alternating projections at the left.
   3. "Problem: convergence not guaranteed."
   4. "Solution: **Dykstra's algorithm**" appended to the same line.
   5. The Dykstra plot at the right.
   6. The two-line recursion z^{k+1} = P_{H[k]}(z^k + e^{k−n}), e^k = e^{k−n} + z^k − z^{k+1}, color-coded.
3. Parameterisation, pages 52 to 56.
   1. The bullet "parametrise H_k via **Hermite polynomials**:".
   2. The display of the expansion S^k(x) = Σ w_j Ψ_j(x) and the recurrence for Ψ_{j+1}, on one line.
   3. The plot of Ψ_0 to Ψ_5.
   4. The bullet on the tolerance ε > 0 for monotonicity, with "constraints" in orange.
   5. The boxed constraint Σ w_j ∂_k Ψ_j(x^(i)) ≥ ε for all i.

I kept the extracted text and the rendered pages in `/private/tmp/claude-501/-Users-claudiovestini-git-tycho-code/ad8c7094-b359-4fc9-858f-736eba703550/scratchpad/deck/`, and I used `/private/tmp/claude-501/-Users-claudiovestini-git-tycho-code/ad8c7094-b359-4fc9-858f-736eba703550/scratchpad/anim.py` to read the pptx.

## Lens layout-and-figures
Findings: Dykstra's-algorithm senior thesis deck (layout, figures, videos)

The topic differs from the brief. The deck is "Dykstra's Algorithm: Stalling Resolution and Applications" (Vestini, Stellato, Beeson, MAE Awards Presentation, 04 May 2026). Optimal transport appears only as the application section. The PDF metadata gives "LaTeX with Beamer class" at 16:9 (453.54 x 255.12 pt). `pdftoppm` is present at /opt/homebrew/bin/pdftoppm. I viewed 31 page images and read the text of all 56 pages.

**How the pptx is built**
- Each of the 56 slides holds a single full-bleed picture at offset (0,0), filling the 16:9 slide. Each picture is one of the 56 SVGs, which are Beamer pages converted by Inkscape, with glyphs as paths and no `<text>` elements.
- There are no native text boxes, titles, or entrance animations. The only timing nodes are the media calls.
- The SVGs are therefore whole slides, not separate equations, diagrams, or plots.
- Builds are done as separate slides, one per overlay step. The Acrobat PDF has 56 pages, one per step, and the handout has 14 pages, one per frame.
- Slides 40 to 42 also carry two tiny blip-filled boxes at (490,192) and (490,300).

**Videos**
All six MP4s are 2250x750 (3:1) and 15 s long. All are set to repeat indefinitely, and a click toggles pause. Each has a PNG poster (image17, 18, 19, 52, 54, 57).
- **Slide 16 (Overview of Contributions, last build):** three videos are cropped to the right third (`srcRect l≈66.7%`), so each shows only the "Mapped with fast-forward Dykstra" panel. They sit as 270x270 squares at y≈268/562, one under each column (Theory, Algorithm, Application). They play one after another without a click: video "kr2d-507" (center) at 0 s, "12345-chopped" (left) at 15 s, and "1234" (right) at 30 s.
- **Slides 46, 47, and 49 (Results 1/3, 2/3, 3/3):** one video, 925x308 of a 1000x562 frame, spans the three-panel row (reference normal, synthetic or prior distribution, mapped result). Each autoplays on slide entry (`afterEffect`, delay 0).
- **Slide 49:** this video is "kr3d-69" (Lorenz 1963). Slide 48 is the static build before it.

**Title style**
- Titles are large, bold, black sans (Beamer Helvetica-like), flush left at the top, with no bar or background.
- A frame number sits at the bottom right. White background, no logos.

**Text load**
- The first build carries 13 to 31 words. The full frame carries 40 to 107 words, and 158 on the theorem frame (slide 37).
- Text is bullets of one sentence each, with dash sub-bullets (Pros and Cons on slide 12).
- Section divider slides (2, 17, 38, 51) carry 7 words. The results slides carry about 5 words (title only).

**Figure placement**
- Most frames use a single column, with text on top and figures centered below it or inline between bullets:
  - the four-photo row on slides 5 to 12
  - the set sketch on slides 18 to 22
  - the two side-by-side plots, MAP and Dykstra, on slide 28
  - the large stalling raster on slide 33 (its SVG is 6.7 MB)
  - the two OT images on slides 40 to 42
  - the flowchart on slide 45
- The theorem frame is the only text-left, figure-right layout. It has text at about 45% on the left and three stacked plots on the right (slides 35 to 37, handout page 7).
- The results frames are figure-only rows of three plots.

**Builds (the style he wants kept)**
- Steps are strictly additive, and past steps are not dimmed: every earlier element stays at full strength.
- Examples of the build order:
  - Motivation runs over 10 steps (slides 3 to 12). Bullet 1 comes first, then bullet 2, then the photos one at a time, then the Dykstra bullet, then Pros, then Cons, then "Impractical".
  - The Contributions columns appear 1, 2, 3, and then the videos (slides 13 to 16).
  - On the Dykstra's Algorithm frame, the title comes first, then the MAP plot alone (slide 25), then the Dykstra plot with the solution equations (slide 28).
  - The stalling frames show the title first, then each bullet, then the figure (slides 29 to 33).
  - The theorem frame shows the plots last (slides 35 to 37).
  - The OT frame shows the objective, then the images, then the KR program (slides 39 to 42).
  - The PGD frame shows the sentence, then the flowchart (slides 43 to 45).

**Color for attention**
- Key terms are bold black ("Euclidean projections", "real-time", "safety-critical").
- Blue bold marks benefits and the objective ("Efficient", "inexpensive", "linearly", "objective").
- Dark red bold marks problems and the constraint side ("stalling phenomenon", "Impractical", "projection").
- Orange is used for section headers in the Contributions columns.
- Orange is also a link color in equations. It marks $z^\circ$ and $\mathcal{H}_i$ (slide 22), the "samples" $x^{(i)}$ in text and equation (slides 39 to 42), and "constraints" (slide 56).
- In the Dykstra update (slide 28), the terms $e^{k-n}$, $z^k$, and $z^{k+1}$ are colored per term.
- The flowchart on slide 45 is colored by role: blue for the outer PGD loop and red for the inner Dykstra loop.
- Citations are in small gray brackets after a bullet, and image credits in tiny gray at the foot.

**Arc, by slide title (slide ranges)**
1. Title (1)
2. Outline/Overview (2)
3. Motivation (3–12)
4. Overview of Contributions (13–16)
5. Outline (17)
6. Euclidean Projections (18–22)
7. Dykstra's Algorithm (23–28)
8. Stalling Phenomenon (29–33)
9. Stalling Resolution for Polyhedral Sets, which holds the theorem on the length of the stalling period (34–37)
10. Outline (38)
11. Optimal Transport Problem (39–42)
12. Projected Gradient Descent (43–45)
13. Results (1/3): Synthetic Distribution (46)
14. Results (2/3): Gauss Von Mises (47)
15. Results (3/3): Lorenz 1963 (48–49)
16. The End / Any questions? (50)
17. Outline/Appendix (51)
18. Parameterisation, with Hermite polynomials (52–56)

The overall arc runs motivation, then contributions preview, then theory, then algorithm, then application, then results. Outline dividers separate the sections, and Results opens on a title with each video autoplaying.

**Notes for the reveal.js template**
- The Beamer deck uses a single column almost everywhere. A split into a text column and a figure zone appears only on the theorem frame.
- Media autoplay and loop on entry, with posters. Only slide 16 chains three videos in time.

The working files are in /private/tmp/claude-501/-Users-claudiovestini-git-tycho-code/ad8c7094-b359-4fc9-858f-736eba703550/scratchpad. They include summary.txt, pages.txt, and the contact sheets handout.png, build1.png, build2.png, and build3.png.

## Lens build-count-and-pacing
Pacing findings for Claudio's senior thesis deck, "Dykstra's Algorithm: Stalling Resolution and Applications" (MAE Awards Presentation, 04 May 2026). Optimal transport is only its application section, slides 7 to 11.

**Page counts and structure (checked with pdfinfo and the pptx XML)**
- The Acrobat PDF has 56 pages and the handout PDF has 14. The handout leaves out the four Outline pages and keeps one page per content slide.
- The pptx has 56 slides, matching the 56 SVG files. Each build step is a separate full-slide SVG, like an exported Beamer overlay. Only slides 16, 46, 47 and 49 have animation nodes, and those are click-triggered video plays.
- Grouping the Acrobat pages by footer number gives 18 logical frames: a title, 4 Outlines, 11 numbered content slides, "The End", and an appendix slide (Parameterisation).
- Build steps are pages minus frames: 56 − 18 = 38. The 6 click-started videos come on top of that. Three sit on Contributions (pptx slide 16), and one each on Results 1, 2 and 3 (pptx 46, 47, 49).

**Steps per frame (pages minus 1)**

| Frame (footer no.) | Pages | Steps |
|---|---|---|
| Title | 1 | 0 |
| Outline ×4 (p2, 17, 38, 51) | 1 each | 0 |
| 1 Motivation | 3–12 | 9 |
| 2 Overview of Contributions | 13–16 | 3 (+3 videos) |
| 3 Euclidean Projections | 18–22 | 4 |
| 4 Dykstra's Algorithm | 23–28 | 5 |
| 5 Stalling Phenomenon | 29–33 | 4 |
| 6 Stalling Resolution | 34–37 | 3 |
| 7 Optimal Transport Problem | 39–42 | 3 |
| 8 Projected Gradient Descent | 43–45 | 2 |
| 9, 10 Results 1/3, 2/3 | 46, 47 | 0 (+1 video each) |
| 11 Results 3/3 | 48–49 | 1 (+1 video) |
| The End | 50 | 0 |
| Parameterisation (appendix) | 52–56 | 4 |

- **0 steps:** 8 frames (title, 4 Outlines, End, Results 1 and 2).
- **1 step:** 1 frame (Results 3).
- **2 to 4 steps:** 7 frames (Contributions, Euclidean, Stalling, Resolution, OT, PGD, Parameterisation).
- **More than 4 steps:** 2 frames (Motivation with 9, Dykstra with 5).

The rhythm is uneven on purpose. The theory frames are dense with builds, the results frames are single pages carried by a video, and the Outline frames act as pauses.

**What one step adds (word diffs between consecutive pages, plus page renders where the text did not change)**
I sampled ten frames: 1–8, 11 and the appendix.
- **A line of text** is the most common step, about 15 of 38. Examples: Motivation 3→4 and 8→12 add one bullet or sub-bullet per click, Euclidean 18→19 and 21→22, Dykstra 24→25 ("Problem: convergence not guaranteed") then 25→26 ("Solution: Dykstra's algorithm") as two separate clicks, Stalling 29→30 and 30→31, OT 40→41, appendix 54→55.
- **An equation** is usually its own click after the sentence that introduces it. Examples: 19→20 (the constrained quadratic program), 27→28 (the Dykstra update with e^k), 34→35 (the whole theorem block), 41→42 (the KR program), 52→53 and 55→56.
- **A figure** comes in the right half, beside the text. Examples: 4→8 (four application photos, one per click, each with its caption), 23→24 (the alternating projections plot), 26→27 (a Dykstra plot placed beside it), 31→32, 36→37 (three diagnostic plots to the right of the theorem), 39→40 (an image), 43→44 and 44→45 (two process-flow diagrams, one per click), 53→54 (a Hermite basis plot), 15→16 (three video panels under the columns).
- **A highlight** changes nothing in the text. At page 20→21, H_i in the constraint turns orange.
- **A column:** at 13→14 and 14→15 a whole titled column (Algorithm, then Application) appears in one click.
- **A citation:** at 35→36 the proof reference appears as its own step.
- **Outline frames** repeat the agenda with the current section in black and the others greyed (render of p17). This is the same idea as the 45% dimming in the reveal.js template.

**Elements replaced rather than added**
1. At Stalling Phenomenon, page 32→33, the box/line projection plot is replaced by a half-space shading plot of the same scene, at the same position. The text is identical on both pages.
2. At Results 3/3, page 48→49, the Lorenz prediction-flow video panel is replaced by three panels (posterior, prior, mapped prior).
3. Elsewhere, Dykstra 26→27 places a second plot beside the first instead of replacing it, so you can compare them side by side.

Everything else builds additively, and nothing is ever removed from the text column.

**Pacing guide for a 30-minute talk of about 18 slides**
- The old deck has 18 frames and 56 pages, which is 38 steps plus 6 video clicks.
- That gives 2.1 steps per frame overall, and 34/11 ≈ 3.1 per numbered content slide.
- The duration of the old talk is not recorded in the files.
- At about 18 slides in 30 minutes (about 100 s per slide), the same style implies about 35 to 55 fragments. That is about 30 to 40 s per fragment on a content slide.
- The old pattern to copy:
  - Open with one long build (9 steps).
  - Give each method slide 3 to 5 steps, in the order sentence, then equation, then figure.
  - Let results slides run on one media element with 0 or 1 steps.
  - Put an agenda slide with the other sections dimmed between sections.

I deleted the page renders in the scratchpad.