# Review R3: the attention of the viewer and the script of the speaker

The deck is ready with changes, since the steps and the notes agree on every slide, but the demo slides have two key traps, slide 15 shows five new things at one step, and the script runs about 34 minutes without the demos.

I wrote this review for the orchestrator `43f4a815-2ba7-4fb6-93d4-d702ed7aaee4`. Every slide with fragments has one paragraph "Step n:" per step from 0, in order. A display called dimmed below is shown at 45% under the sentence that reads it, and its fix is `data-keep`.

## Findings by slide

### Slides with a viewer (7, 10 to 13, and 19)

1. Major, at every demo action. After a click in a viewer, the focus stays in it, and the viewer stops space and the arrows before reveal.js sees them, and PageDown and PageUp as well on a slider or a menu. Hence with the next press of the clicker Claudio moves the demo, or nothing, instead of the deck. Add these lines after `Reveal.on('slidechanged', (ev) => reset(ev.currentSlide));` at the end of `index.html`. After a click on a panel, a viewer is still stepped by the arrows, as slide 19 needs.

```js
  // the keys that step the deck reach reveal.js while a control of a viewer has the focus,
  // and PageDown and PageUp do so as well while the viewer itself has it
  window.addEventListener('keydown', (ev) => {
    const host = document.activeElement;
    if (!host || host.tagName !== 'TYCHO-VIEWER' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const control = host.shadowRoot && host.shadowRoot.activeElement;
    const page = ev.key === 'PageDown' || ev.key === 'PageUp';
    if (!page && !(control && ['ArrowRight', 'ArrowLeft', ' '].includes(ev.key))) return;
    ev.preventDefault();
    ev.stopPropagation();
    host.blur();
    if (ev.key === 'PageUp' || ev.key === 'ArrowLeft') Reveal.prev(); else Reveal.next();
  }, true);
```

### Slide 4, Motion in the rotating frame

2. Note, at step 5. The \(\Ut\) of the sentence stays white while its copies in the displays turn violet. Replace the sentence with `A body is pulled down \(\class{hl-2}{\Ut}\) and turned sideways.`

### Slide 5, Libration points and Hill's region

3. Minor, at step 0. The speaker says "where the gradient of Ũ vanishes" one step before its display. Replace the paragraphs of steps 0 and 1 with "Step 0: A body at rest in this frame stays at rest at a few points. The surface is Ũ again." and "Step 1: These points are where the gradient of Ũ vanishes, and they are the libration points. On the surface they are the flat points."

4. Minor, at steps 2 and 5. The display \(\nabla\Ut = \boldsymbol 0\) is dimmed under "Three are saddles, and two are maxima.", and the display of E under "The speed squared is not negative, hence". In this slide, add ` data-keep` after `data-fragment-index="1"` and after `data-fragment-index="4"` in the two `math fragment` tags.

### Slide 6, Two new terms in the elliptic problem

5. Minor, at step 5. The display is dimmed under "At \(e = 0\), \(\theta = t\), and the ER3BP is the CR3BP.". Add ` data-keep="5"` after `data-fragment-index="2"` in the tag of the display.

### Slide 7, Where the new terms come from

6. Major, at step 2. Before a click on the viewer, the space of "I press space to play the demo at e = 0" is taken by reveal.js as a step to step 3. Replace this sentence with "I click the play button at the left of the transport to play the demo at e = 0, where the rotating panel is the pulsating panel again."

7. Minor, at step 2. The display of ρ is dimmed under "The masses are fixed at \((-\mu, 0)\) and \((1 - \mu, 0)\).". In this slide, add ` data-keep` after `data-fragment-index="1"`.

8. Minor, at step 3. The paragraph names ρ̈ and ρθ̇², which are shown at step 4. Replace "The frame is accelerated, by the pulsation, ρ̈, and by its turning, ρθ̇²." with "The frame is accelerated, by its pulsation and by its turning.", and begin the paragraph of step 4 with "These are the two terms at the left, ρ̈ for the pulsation and ρθ̇² for the turning."

9. Note, at step 5. The switch Broucke orbit is a box of about 12 px (`check/dark-07.png`). Append to the paragraph on the controls "The switch Broucke orbit is the small box under the tabs of the mass ratio."

10. Note, in the comment above the slide. Against the scene and the notes, the comment says that the controls are hidden. Replace its text from "the kiosk viewer" to the end with "the viewer between the two marker comments is written by tools/deck/embed_scene.py. its controls are shown, and it starts paused at mu = 0.5 and e = 0, with the orbit off and the clock on theta -->".

### Slide 8, Kept and lost in the pulsating frame

11. Minor, at step 3. The display of E′ is dimmed under "The Jacobi constant and Hill's region are lost.". In this slide, add ` data-keep` after `data-fragment-index="2"`.

### Slide 11, Multiple shooting and seeds

12. Minor, at steps 3 and 4. The tabs of the ER3BP are clicked at step 4, over the new display of Φ − I, rather than at step 3, whose sentence is on the ER3BP. Move the passage from "I click "S = 8" again" to "to two different orbits." from the paragraph of step 4 to the end of the paragraph of step 3.

### Slides 12 and 13, the continuation demo

13. Note, at step 3 of both slides. The speed menu is a box of about 50 px. Append to the paragraph on the loaded state of both slides "The speed menu is the box 1× at the right of the transport."

14. Minor, at step 2 of slide 13. Played from step 2, the blue pen may pass the fold before step 3 says so. Move the sentence "I set the speed menu of the transport to 0.25× and press the play button, on the tab "family 11, in e" as loaded." to the start of the paragraph of step 3.

### Slide 14, The monodromy matrix

15. Minor, at step 2. The display of M is dimmed under "The multipliers, i.e. the eigenvalues λ of M". In this slide, add ` data-keep` after `data-fragment-index="1"`.

### Slide 15, Broucke's diagram

16. Minor, at step 4. Region 1 is named but not in the window, and the tab 7A, on which it is shown, is clicked only at step 5. Replace `data-plot-show="r1 r2 r3 r4 r5 r6 r7 stable region"` with `data-plot-show="r1 r2 r3 r4 r5 r6 r7 stable region 7P 7A 8P 8A"`, and replace the last sentence of the paragraph of step 4 with "Region 1 is not in the window of family 11, hence I click the tab 7A, on which the family is in region 1 for every e above 0. At the next step the demo is returned to 11P."

17. Major, at step 5. Page 82 shows at one step the sentence on e = 0, the animation, four new tabs, an orange ring labeled fold, a violet ring labeled period doubling, and two ticks on the scrubber, and the speaker explains the fold and the flip a slide before they are revealed on slide 16. Replace `data-plot-show="plus minus 7P 7A 8P 8A"` with `data-plot-tab="11P"`. In the paragraph of step 5, replace the passage from "comes back to the line k = 2 at the fold" to "marked in violet." with "reaches the lines k = 2 and k = −2 near e = 0.45, the subject of the next slide.", and delete the last two sentences, from "I click through the family tabs" to the end.

### Slide 16, How a family changes

18. Minor, at step 3. The display of det(M − I) is dimmed under "At k₁ = −2, M − I is regular, but". In this slide, add ` data-keep="3"` after `data-fragment-index="1"`.

### Slide 17, Fold and flip on family 11

19. Minor, at step 3. The notes say "I select the tab of family 11 from apoapsis", but the fragment switches the tab. The flip is then passed during step 3, before its violet ring at step 4, and seen again after the loop of 14 s. Replace the paragraph with "Step 3: At this step the demo is switched to family 11 from apoapsis, which is played from e = 0."

20. Minor, at step 5. "Broucke saw divergence at \(e = 0.454\)." is on the fold, whose display is dimmed, while the demo shows the branch from apoapsis. Replace `<p class="fragment" data-fragment-index="5">` with `<p class="fragment" data-fragment-index="5" data-highlight="kplus" data-plot-tab="11P">`, which holds the display of the fold and replays the branch from periapsis. Append to the paragraph of step 5 "In the demo the branch from periapsis is played again, and the orange ring is the fold."

### Slide 19, Three families, two branches, five frames

21. Minor, at step 0. "The keys still work: space plays and pauses, and the arrows step." is true only after a click on the viewer, and then the arrows and space do not advance to the quote. Replace the sentence with "After a click on the viewer, space plays and pauses and the arrows step, hence I advance to the quote with PageDown."

## Closing lines of the final step

22. Minor, at the final step of 14 slides. A paragraph does not cover the step added by the theme. Append each line below after the last paragraph of its slide. On slide 20 the added step does not show anything new (pages 107 and 108 are identical).

- Slide 4: "Step 6: Hence the whole motion in this frame is read from one surface, Ũ. Next I read from it where a body can rest and where it can go."
- Slide 5: "Step 7: In short, the libration points are the flat points of Ũ, and Hill's region is set by C. Next I check which of the two is kept in the elliptic problem."
- Slide 6: "Step 6: So the elliptic problem is the circular one, with θ as the clock and the whole gradient divided by 1 + e cos θ. Next I show where this factor comes from."
- Slide 7: "Step 6: Hence both new terms are due to the pulsation of the frame, and in the demo you see the orbit close after one turn of θ. Next I show what this closure requires."
- Slide 8: "Step 7: So I keep the libration points, I lose the Jacobi constant and Hill's region, and an orbit has to close in phase with the masses. Next I find one."
- Slide 10: "Step 6: So I find a periodic orbit as a zero of F by Newton's method, with the error squared at each iterate near the end. Next I correct a long, unstable arc."
- Slide 11: "Step 7: Thus with a seed, enough segments, and the period pinned at 2πK, I find one periodic orbit of the elliptic problem. Next I follow it into a family."
- Slide 12: "Step 6: So by stepping the parameter I trace the Lyapunov family, but on family 11 I stop at the fold, where the Jacobian is singular. Next I pass the fold."
- Slide 13: "Step 5: Hence by following the curve in arclength I pass the fold of family 11. A fold is one kind of bifurcation, and to find the others I need the stability of each member."
- Slide 14: "Step 6: So I read the stability of an orbit from M, as one index k per pair, stable between −2 and 2. Next I show how Broucke drew both indices in one plane."
- Slide 15: "Step 6: Hence each orbit is a point of Broucke's diagram, and a family is a curve through its regions. Next I show what is changed where the curve meets k = 2 or k = −2."
- Slide 16: "Step 6: So a family is changed only at k = 2, at a fold or a branch point, or at k = −2, at a period-doubling. On the next slide I show both on family 11."
- Slide 17: "Step 6: So on family 11 the fold is on the branch from periapsis, where Broucke stopped, and the flip is on the branch from apoapsis. Next I show the three families as I recomputed them."
- Slide 20: "Step 7: So I found every branch consistent with Broucke's figures, in each frame in which he drew one. Last, I show the PyDyLAN calls for one of them."

## Pacing

23. Major, for the whole talk. At 150 words per minute, the paragraphs "Step n:" of slides 1 to 22 run 4663 words, i.e. 31.1 min, and the closing lines add 2.9 min. I estimate that the demos run 1 to 2 min past their words, hence the talk runs about 35 min.

| Slide | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Minutes | 0.4 | 0.8 | 0.3 | 1.7 | 1.3 | 1.4 | 1.8 | 1.5 | 0.3 | 1.7 | 2.4 |

| Slide | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Minutes | 1.8 | 1.6 | 1.8 | 3.0 | 1.9 | 2.2 | 0.2 | 0.8 | 2.3 | 1.2 | 0.8 |

Together with finding 17, deleting these passages from the notes saves about 3.1 min.

- Slide 2, step 0: from "Family 7 is shaded" to "the same hues are darker."
- Slide 10, step 5: from "The demo targets half a period" to "at T/2."
- Slide 11, step 2: from "Then I click "S = 1"" to "a longer arc can be corrected."
- Slide 14, step 5: from "In the notation registry" to "drawn in it."
- Slide 15, step 4: the clause " and as DyLAN's StabilityRegion enumeration does", and the sentence from "Region 2 has four complex multipliers" to "real pairs."
- Slide 17, step 1: from "It starts with a₁ = −4919" to "at e = 0.453." Step 4: from "In DyLAN this branch is in region 3" to the end.
- Slide 20, step 0: from "It is labeled up to −60000" to "−8000 to 8000." Step 1: from "From the left, these are" to "about the secondary."
- Slide 21, step 0: all but the first sentence, the sentence "In DyLAN the true anomaly is called f, not θ.", and the last sentence.

With these cuts the talk runs about 32 min, and Claudio decides the rest. Moving slide 21 to the backups saves about 0.7 min, dropping the step-size runs of slide 13 about 0.5 min, and playing slides 12 and 13 at 0.5× about 0.5 min.

## Placeholders for Claudio

- Slide 6, notes: "TODO(claudio): the chapter of Szebehely's Theory of Orbits, 1967, with the elliptic problem."
- Slide 20, notes: "TODO(claudio): the frames of a few of Broucke's panels were identified by their shape, in Figs. 13, 14, 16, and 17, as listed under "Where I was unsure" in figures/broucke/INDEX.md."
- The deck does not have a placeholder box, and every file named in the deck or in its comments is present.

## What I could not check

- The viewers in the PDF, which are missing from most pages of their slides. I checked their state from the notes, the decoded scenes, and two screenshots in `check/`.
- The live deck. I did not open it in a browser, hence I did not run the code of finding 1 or time the demos.
- Which keys Claudio's clicker sends, beyond the PageDown, PageUp, arrows, and space of finding 1.
- Whether the tab 7A, while paused, shows its family inside region 1 in the window of the diagram (finding 16).
