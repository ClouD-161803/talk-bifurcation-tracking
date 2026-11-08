# R1, the language of the deck

The deck is ready with changes, since I found no blocker, and its 9 major findings are terms used before they are defined, a symbol and two words that each carry two meanings, and sentences that contradict a picture or a neighboring step.

Orchestrating session: 43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

I read every slide and note of `index.html` without its embedded data, and I checked the surface of slide 4 on page 8 of `slides.pdf`. Each change gives the replacement text in full. "The record" is `plan/grill-record.md` with its `## Terms` sections. To stay under the word cap, I left out about twenty-five minor findings, mostly fragments and things as actors in the notes, of the kind of finding 6.

## Slide 2

1. Minor, step 0. The caption is a noun phrase. Change it to "Families 7, 8, and 11 of periodic orbits in the elliptic restricted three-body problem (ER3BP) are continued in the eccentricity \(e\) of the orbits of the primary and the secondary."

## Slide 4

2. Major, step 0. "The CR3BP in the rotating frame is" is the first use of CR3BP on the slides, and it is not spelled out. Change it to "The circular restricted three-body problem (CR3BP) in the rotating frame is".
3. Minor, step 3, and slide 7, step 2. "The masses" is a second name for the primary and the secondary. On slide 4, change the line to "with the mass ratio \(\mu\) and the distances \(\rho_1\) and \(\rho_2\) to the primary and the secondary." On slide 7, change the sentence to "The primary and the secondary are fixed at \((-\mu, 0)\) and \((1 - \mu, 0)\)."
4. Major, step 4. "The centrifugal term is a bowl." contradicts the picture, since the red surface of this step is a dome, which notes step 4 calls "a bowl turned over". Change it to "The centrifugal term is a dome." In notes step 4, change the second sentence to "On the surface it is a dome, drawn in red above the wells." In notes step 5, change the second sentence to "On the surface the dome is lowered onto the wells, and the two are merged into one surface."
## Slide 6

5. Major, step 1. In "Timed by the true anomaly \(\theta\), the CR3BP becomes", the modifier dangles. The \((x, y)\) on the right are also rotating-pulsating coordinates, written with the letters of the rotating frame of slide 4, and only the notes say so. Change it to "With the true anomaly \(\theta\) as the clock, and in the rotating-pulsating coordinates \((x, y)\) of the next slide, the equations become".
6. Minor, notes step 4. "That form moves" and "DyLAN divides" make things the actors. Change the last two sentences to "In this form the libration points move with θ, and it is not the form integrated in DyLAN. In DyLAN the whole gradient is divided, as in Szebehely's book."

## Slide 7

7. Major, steps 0 and 1. The slide never names the new frame, yet the title of slide 8 says "the pulsating frame", and the notes alternate between "pulsating" and "rotating-pulsating". "Scaled by \(\rho\)" can mean multiplied or divided, and the record calls \(\rho\) the separation. Change step 0 to "The rotating-pulsating coordinates \((x, y)\), or pulsating for short, are the rotating ones divided by \(\rho\)," and the line of step 1 to "where \(\rho\) is the separation between the primary and the secondary."
8. Minor, notes step 5. "The drag terms" can be heard as atmospheric drag. Change the first two sentences to "Thus the whole gradient, the centrifugal term included, is divided by one factor. The first-derivative terms from the change of clock cancel, because ρ²θ̇ is constant by Kepler's second law, and the Coriolis coefficient stays 2."

## Slide 8

9. Minor, step 0. "As" can be read as "while", and "in \(x, y\)" lacks the frame. Change it to "Since \(\Ut\) is unchanged, \(\LL1\) to \(\LL5\) are fixed in the pulsating frame."
10. Major, notes step 3. "The surface of the last section does not exist in the elliptic problem." contradicts step 0, in which Ũ is unchanged. Change step 3 to "Hence the Jacobi constant is lost, and with it Hill's region. The surface of Ũ is unchanged, but a cut at a fixed C does not bound the motion anymore."

## Slide 9

11. Minor, notes step 0 and five later places. A family is continued rather than followed, by the vocabulary list of the writing skill. Make these changes.
    - Slide 9, notes step 0: "Next I show how I find one periodic orbit, how I continue it into a family, and how I tell whether it is stable."
    - Slide 12, notes step 2: "The simplest way to continue it is to step p, keep X from the last member as the guess, and correct X at the new p."
    - Slide 13, step 0: "The curve \(\boldsymbol Y = (\boldsymbol X, p)\) is continued in its arclength \(s\)," which also defines the \(s\) of \(\Delta s\).
    - Slide 13, notes step 0: "I continue the curve of X and p together, in its arclength."
    - Slide 19, notes step 1: "With pseudo-arclength continuation, I continue the family around it in DyLAN."
    - Slide 22, notes step 0: "to continue the new family" for "to follow the new family".

## Slide 10

12. Minor, step 3. The symbol \(\DXF\) of the display is not named. Change the line to "with the free variables \(\boldsymbol X = (\boldsymbol x_0, T)\), the Jacobian \(\DXF\), and the vector field \(\boldsymbol f\)."

## Slide 11

13. Minor, step 0. "Cut at \(S\) nodes" makes \(S\) a node count, whereas the record and the demo tabs under "segments" make it the segment count. Change it to "A long arc is cut into \(S\) segments, which start at the nodes \(\boldsymbol x_i\),".
14. Minor, step 3, and slide 16, notes step 0. "Pinned" is on the list of words to replace. Change step 3 to "In the ER3BP, the period is fixed at \(2\pi K\)," and, on slide 16, "the period is pinned" to "the period is fixed".
15. Minor, title and step 5. "Seeds" on the slide and "first guess" in the notes and the demo tabs name one thing twice. Change the title to "Multiple shooting and first guesses" and step 5 to "First guesses are taken from the flow linearized at \(\LL1\) for a Lyapunov orbit, or from Richardson's expansion for a halo orbit."
16. Major, notes step 2. "Fail at k = 2" uses k for the iterate, whereas k is the stability index from slide 14 on, and k = 2 is the condition of the fold. Change the sentence to "In the race of the convergence panel you see S = 1 and S = 2 fail at iterate 2, with red crosses, and S = 4, 8, and 16 converge in five, four, and three iterates."

## Slide 12

17. Major, step 4 and notes step 4. "The fold is not passed" is the first use of "fold" in the deck, and the notes define it only at step 5. Change step 4 to "On family 11, with \(p = e\), the steps stop at the fold, where the family turns back in \(e\)," and the notes to "On family 11 in e, I cannot pass the fold with this method, since the family turns back there toward smaller e."

## Slide 13

18. Minor, notes step 3. "The second branch" gives "branch" a third meaning, beside the periapsis and apoapsis branches and the branch point. Change it to "On family 11 you see the blue pen go around the fold, where the orange pen stopped, and continue toward smaller e, down to e = 0.36."

## Slide 14

19. Minor, notes step 5. "The notation registry" is a private tooling term, and the sentence gives "stability index" to ζ right after the slide gave it to k. Change it to "In the notation of the group the index is halved, ζ = k/2, but I keep Broucke's k, because his diagram is drawn in it."

## Slide 15

20. Minor, step 1. The record calls \(a_1\) and \(a_2\) the stability coefficients, but the deck never names them. Change the line to "with the stability coefficients \(a_1 = -(k_1 + k_2)\) and \(a_2 = 2 + k_1 k_2\) of the two indices."
21. Minor, notes steps 4 and 5. The audience sees the labels EH⁺, H⁺⁺, H⁺⁻, and N and the tabs 11P to 8A, which the notes do not explain. In step 4, change the sentence on the regions to "In the demo the regions are also named as Frauenfelder and Moreno name them, with E for a pair on the unit circle, H⁺ or H⁻ for a positive or a negative real pair, and N for four complex multipliers. The readout at the top right gives region 6, EH⁺, for this orbit." In step 5, change the last two sentences to "I click through the family tabs, family 11 first, where 11P is family 11 from periapsis and 11A from apoapsis. Family 7 from apoapsis is in region 1 for every e above 0."

## Slide 16

22. Minor, steps 0 and 5. "The Jacobian" does not say of what, and step 5 lacks a verb. Change them to "At fixed \(T\), the Jacobian of the corrector is \(\boldsymbol M - \boldsymbol I\), and" and "hence a family of period \(4\pi K\) branches off, at a period-doubling (flip)."
23. Major, step 2. "A branch point" is not defined on the slides, and only the period-doubling gets its textbook name, against the record. Change it to "At \(\class{kplus}{k_1 = 2}\), the Jacobian is singular, at a fold (saddle-node, tangent), where the family turns back, or at a branch point (pitchfork, transcritical), where two families cross."
24. Major, notes step 1. "A family can change only where the corrector fails" is contradicted by steps 3 to 5, where a family branches off although the corrector does not fail. Change it to "A family can turn back or meet another family of the same period only where this corrector fails, i.e. where this determinant is zero."
## Slide 17

25. Minor, title and step 3. The record names the period-doubling, with flip in brackets, but here "flip" stands alone. Change the title to "Fold and period-doubling on family 11" and step 3 to "From apoapsis, a period-doubling is at".
26. Minor, steps 4 and 5. "Where Broucke put it" reads as "in region 3", and "Broucke saw divergence" does not say of what. Change them to "from region 6 into region 3, a crossing that Broucke put at \(e = 0.30\)." and "At \(e = 0.454\), Broucke's corrector diverged."
27. Minor, notes step 4. The second sentence runs to 44 words. Change it to "In DyLAN this branch is in region 3 up to e = 0.8425, and it is continued to e = 0.88. Above it, the branch is in region 7 from e = 0.8432, at the orange ring, in region 5 from 0.8670, and in region 7 again from 0.8791, at the two later violet rings."

## Slide 20

28. Minor, the captions, written by `tools/deck/build_sections.py`, which a rerun would restore. Each caption is a noun phrase. Change them as follows.
    - Step 0: "Family 11 is drawn in Broucke's two figures and in DyLAN. The \(a_1\) labels of the left figure are ten times too large."
    - Step 1: "Family 7 from periapsis is continued at \(\mu = 0.012155\), and one index reaches \(k = -2\) at \(e = 0.468\)."
    - Step 2: "Family 7 from apoapsis is in region 1, i.e. stable, from \(e = 0.005\) to 0.975."
    - Step 3: "Family 8 from periapsis is continued at \(\mu = 0.5\), and one index reaches \(k = -2\) at \(e = 0.677\)."
    - Step 4: "Family 8 from apoapsis is in region 2 from \(e = 0.289\), and in region 1 from \(e = 0.847\)."
    - Step 5: "Family 11 from periapsis is in region 4 up to the fold at \(e = 0.45387\)."
    - Step 6: "On family 11 from apoapsis, one index reaches \(k = -2\) at \(e = 0.295\), and the branch is in regions 7 and 5 past \(e = 0.84\)."

    The script gives 0.45386 in step 5, where the deck gives 0.45387.

## Slide 21

29. Minor, title and notes step 0. "The same" has no referent after a slide of figures, and PyDyLAN is not spelled out. Change the title to "Family 11 in PyDyLAN" and the first sentence of the notes to "These are the calls of PyDyLAN, the Python bindings of DyLAN, that continue family 11 from periapsis and compute the stability of a member."
30. Minor, the code comments and the notes. One comment says "the primaries", and another comment and the last sentence of the notes say "land", both on the list of words to replace. In `data/pydylan_calls_dylan.py`, which the script copies, change "of the primaries" to "of the primary and the secondary" and "land on" to "fall on". In the notes, change the sentence to "For the reproduction itself I used natural-parameter continuation, so that the members fall on the eccentricities that Broucke tabulated."

## Slide 22

31. Minor, step 0, the subtitle. "A projection" does not say what is lost, and "its version in higher dimension and fidelity" does not say what is gained. Change it to "Broucke's \((a_1, a_2)\) plane is a projection, in which the kind of collision of the multipliers is lost. In the sequence of Frauenfelder and Moreno, from geometric invariant theory (GIT), this information is kept, for spatial orbits and higher-fidelity models too."
32. Minor, step 0, the last line. It opens with a bold label and goes on with a fragment. Change it to "<strong>Next week, I talk about the normal forms.</strong><br>Next in DyLAN are branch switching (DYLAN-490) and the Krein signs (DYLAN-491)." with the nowrap spans kept.

## Slide 24

33. Minor, slide 24, step 0. The labels 7P to 11A of the tables of slides 24 and 25 are not explained. End the small line with "A branch is labeled by its family and by P for periapsis or A for apoapsis."

## What I could not check

- I did not render any replacement, hence I could not check line breaks, overflow in the narrow column of slides 14 to 17, or the 66-character measure, e.g. for finding 23.
- I could not see the text inside the corrector and continuation demos, which are being rebuilt. If their convergence panel labels the iterate k, the label collides with the index, as in finding 16.
- I took the meaning of EH⁺, H⁺⁺, and N from the naming of Frauenfelder and Moreno, without checking it against DyLAN's StabilityRegion.
- I read `build_sections.py` only for the text of slide 20, hence other generated text may need the same edits in the script.
- I judged the maths and the numbers only where a sentence was unclear because of them.
