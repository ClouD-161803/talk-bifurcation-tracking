# Steer for X1's final pass on slides 10 to 13

I am the night orchestrator, and I own the deck after your hand-over. Claudio asked for a final review of the corrector and continuation slides with clarity first and the minimal set of controls, since the equations on the slide do half of the job. Apply these points in your one final pass, together with the round-5 asks of your judges. Where a judge's ask contradicts a point here, this steer holds. Slide numbers are those of `index.html` as it is now (10 Differential correction, 11 Multiple shooting and first guesses, 12 From one orbit to a family, 13 Pseudo-arclength continuation).

## Controls

Re-embed the four viewers with the new option `--show` of `tools/deck/embed_scene.py`, by the four commands in its docstring: `--show targeting` on slide 10, `--show others` on slide 11, `--show family` on slide 12, and a bare `--show` on slide 13, which keeps the transport alone. The standalone pages `demos/corrector/correction.html` and `demos/corrector/continuation.html` keep every control. In the notes of each slide, replace each "For questions" route through a hidden control with one sentence that names the standalone page to open in a tab, and drop the descriptions of tabs and switches that are no longer on the slide.

## Text

1. Slide 10, step 2: drop "of least norm" from the slide, and keep its reason (one more column than rows) in the notes. In the small print of step 3, drop "the step \(\delta\boldsymbol X = \boldsymbol X^{(n+1)} - \boldsymbol X^{(n)}\) from the iterate \(n\)", and keep the free variables, the Jacobian, and the vector field.
2. Slide 10, notes of step 5: say once what the demo's orbit is, i.e. a Lyapunov orbit, a planar periodic orbit about \(\mathcal L_1\) of the CR3BP. The name is otherwise first used on slide 12 without a definition.
3. Slide 11: cut steps 5 and 6 (the first guesses and "a normal form in disguise"), since a halo orbit does not appear in this planar talk and next week's talk is announced on the closing slide. Keep one sentence on first guesses in the notes for questions. Retitle the slide "Multiple shooting". In the notes of step 4, cut "and I come back to it in the stability section", or point it at slide 16 "How a family changes", where \(\boldsymbol M - \boldsymbol I\) is used.
4. Slide 12, step 3: write "Along the planar orbits about \(\mathcal L_1\), the Lyapunov family, \(p = C\)."
5. Slide 12, steps 4 and 5: keep the fold, but do not give its value of \(e\) on the slide, since the value is the payoff of slide 19 "Where Broucke stopped", which answers the question "Why there?" of slide 2. Replace the display of step 5 with words, e.g. "where \(\boldsymbol\Phi - \boldsymbol I\) is singular, and \(\boldsymbol X\) cannot be corrected." The determinant is shown on slide 16. Keep the value in the notes.
6. Slide 13: drop \(\boldsymbol W\) from the display, i.e. \(\boldsymbol\tau_j^T(\boldsymbol Y - \boldsymbol Y_j) = \Delta s\), and move the weighting sentence ("On family 11, I weight only \(\dot y_0\) and \(e\)...") to the notes. In step 4 write "\(\tau_e = 0\) at the fold" without the value of \(e\). Cut step 5, whose sentence repeats step 4 in words, and move its violet highlight of \(\boldsymbol\tau_j\) onto step 4.

## Proof and hand-over

Run `npm run check` and `npm run pdf` as before, and confirm that the PDF has one page per step. Do not touch any slide outside 10 to 13, since I have edited the others in a copy and merge yours in after your hand-over. Then hand over in your thread, as your brief asks.
