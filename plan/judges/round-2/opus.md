# Judge report, round 2: the correction and continuation scenes (Opus)

Orchestrating session: 43f4a815-2ba7-4fb6-93d4-d702ed7aaee4.

The two scenes are ready with changes, since the numbers are right but four pictures mislead or overwhelm the viewer.

I shot both pages and slides 10 to 13, in dark and light mode. With my own integration of the CR3BP, I found the Lyapunov reference 7942 km from the center of the Moon, with a largest multiplier of 109.3, against 4917 for the circular member of family 11. I recounted every iterate, failure, and halving of the storyboard, and found all of them right. The payoff of scene 1 is there, with $\log_{10}\|\boldsymbol{F}\|$ at −3.18, −5.72, and −10.67 for $n = 4$, 5, and 6. The cap is twelve findings, and I give twelve, from the most severe.

## Findings

### 1. The red defect stays a full-length stick until the run converges (major, scene 1, shots 1, 3, 4, and 6)

The outline of a defect is drawn along both velocity sticks, and for a small gap its two sides are drawn on one line. At $n = 5$ and 6 of shot 1, where $\log_{10}\|\boldsymbol{F}\|$ is −5.72 and −10.67, I saw a red stick at the Moon crossing as long as at $n = 1$. The speaker says that the defect is reduced to nothing, while the audience sees it unchanged. Drop the two sides along the sticks, and draw only the gap in position and the segment between the two tips.

### 2. The turn at the fold is drawn at a cusp in a corner (major, scene 2, shot 3)

In the close-up, $x_0$ is at its minimum, −0.173463, where $e$ is at its maximum, hence the two branches are joined at a cusp, along one line. The blue pen is thus reversed, and the white tangent is drawn with zero length at the tip. The tip is drawn in the lower right corner, among about fifteen red dots and orange steps. Plot the close-up as $e$ against $y_0'$, which is monotone through the fold (1.14135, 1.14104, and 1.14011 at the members around it), so that the fold is a smooth turn, and center the box on the tip.

### 3. White marks vanish in light mode (major, slides 10 to 13)

The nodes, the velocity sticks, the head of the convergence curve, the comet, the tangent, and the newest orbit are drawn in white. On the light background I could not see the nodes and sticks of slides 10 and 11, and the yellow head is faint. Draw these marks in the text color of the theme, or keep the viewer of slides 10 to 13 dark in both modes.

### 4. Shot 3 of scene 1 overwhelms (major, slide 11)

At $n = 1.6$ I counted 37 things in motion, i.e. 16 arcs, 16 red outlines, and 5 convergence curves. Also on screen were 16 nodes, 16 sticks, 16 ghosts, and 21 controls. Start shot 3 with the ghosts and the other segment counts off, and switch the race on in the next fragment, at "In the race on the right".

### 5. Slide 11 asks for seven clicks without a rewind (major, slide 11)

In steps 2 and 3 of the notes the speaker clicks seven tabs, from "family 11" to "ER3BP, apoapsis". The clock is not stopped when a tab is clicked, hence the escape at $n = 2$ of family 11 is seen only after a click in the first 6 s of the 16-s loop. The shots are ordered 3, 4, 6 in the storyboard and 3, 6, 4 in the notes. Add "and I drag the scrubber back to its start" after each change of case or system, here and in the Control column of shot 2, and use the order of the notes in the storyboard.

### 6. The chrome and the duplicates crowd the embedded scenes (minor, slides 10 to 13)

In the 880-px box, the controls are about 330 px high, and the tick labels about 12 px. The colorbar of $n$ is drawn twice in scene 1, and the colorbar of $s$ three times in scene 2. On slide 12 the blue orbit panel is framed and titled but empty. Keep one colorbar per scene, hide the blue panel while "pens" is "natural parameter", and hide "Add panel" and "Export video" in the embed.

### 7. The two events of multiple shooting are brief (minor, scene 1)

At speed 0.5, one unit of the clock is played in 16 s / 13.8 = 1.16 s. A defect is thus grown in 0.14 s and shown whole for 0.31 s, and the nodes are moved in 0.21 s, three times as long at iterate 0. Grow the defects from $n + 0.45$ to $n + 0.6$, and move the nodes from $n + 0.7$ to $n + 1$.

### 8. The tangent is highlighted in the color of the failing pen (minor, slide 13)

On slide 13, $\boldsymbol{\tau}_j$ and "$\tau_e = 0$" are orange, and in the notes the speaker says "Its sign, in orange". In scene 2 orange is the natural pen, while the tangent is drawn by the blue pen. Give these highlights `data-tone="violet"`.

### 9. Two different objects are called $x_0$ (minor, slides 10 to 13 and the storyboard)

On slides 10 and 11, $\boldsymbol{x}_0$ is the initial state, while on slides 12 and 13 the italic $x_0$ is the abscissa of the diagram, undefined on slide 12 and in its notes. Add to step 3 of the notes of slide 12 "In the diagram I plot $x_0$, the abscissa at which an orbit crosses the $x$-axis at a right angle, against $p$." In the storyboard, write $y_0'$, $\Delta t_i$, $\boldsymbol{\Phi}(2\pi K; \boldsymbol{x}_0)$, and `bmatrix`, as on the slides.

### 10. The fold is rounded two ways (minor, scene 2, shot 2)

The fold is at $e = 0.45386$ in the storyboard and 0.45387 on the slides. I take 0.453865, since the fold is at 0.45386506 in `fold-family-11-periapsis.json` of DyLAN and the largest $e$ in `runs.json` is 0.45386498, which are rounded to different fifth decimals. Write 0.453865 in both.

### 11. The pulsation factor is not defined (minor, scene 1, shot 4)

The speaker says "The color is the pulsation factor along the arc", and $\theta$ is not defined in the notes of slide 11. Say "The color is the pulsation factor $1/(1 + e\cos\theta)$, where $\theta$ is the true anomaly of the secondary, and it is brightest at apoapsis."

### 12. The caption and the colorbars of scene 1 misread (minor, shots 2, 5, and 6)

After a failure the caption is "iterate n = 2, log₁₀ ‖F‖ = 0.281", without a word of the failure, against decision 19. On the colorbars the integer $n$ is labeled "0.00" and "10.0". Write "run failed at n = 2, last log₁₀ ‖F‖ = 0.281", and label the ticks 0 and 10.

## Counts at the busiest moment

| Shot | Moment | In motion | On screen, without the controls |
|---|---|---|---|
| Scene 1, shots 1 and 2 | $n = 1.6$ | 3 | about 10 |
| Scene 1, shot 3 | $n = 1.6$ | 37 | about 90, overwhelms |
| Scene 1, shot 4 | $n = 2.6$ | 21 | about 50, busy |
| Scene 1, shots 5 and 6 | $n = 2.4$ | 6 | about 25 |
| Scene 2, shot 1 | clock 9 | 2 | about 30 |
| Scene 2, shots 3 and 4 | clock 19 to 24 | 6 | about 70, dense close-up |

## Notation and the speaker's lines

The constraint vector $\boldsymbol{F}$, the state transition matrix $\boldsymbol{\Phi}$, the tangent $\boldsymbol{\tau}_j$, and the step $\Delta s$ are written as in the deck, apart from finding 9. The weights $\boldsymbol{W}$ of slide 13 are right. The lines are in the first person, and the longest of 109 sentences is 40 words long. "Defect", "ghost", "line search", and "fold" are defined at first use, and "pulsation factor" and $x_0$ are not.

## Round 1

I cite `opus.md` as O, `opus-j1.md` as J, and `codex.md` as C, and the decisions by their numbers in `E2b-corrector-round-1-fixes.md`. O3 is still open in part (finding 2), and so are O5 (finding 7), O7 (finding 5), J3 (finding 6), and J10 (finding 11). J12, the keyboard focus of the viewer, is still a live risk. The other findings of round 1 are resolved. Decision 4 was carried out by its fallback, i.e. $y_0'$ keeps a weight, and $\boldsymbol{W}$ is stated on slide 13. Decision 10 was not carried out as written, since the member is indexed by $j$ to keep it apart from the stability index $k$ of slides 14 to 17. Decision 19 was carried out only in the label of the panel (finding 12), and after decision 8 the storyboard and the notes are still in different orders (finding 5).

## What I could not check

- The slide of 0.028 of the nodes in shot 3, the period of −59.7 in shot 6, and the orbit of period 5.17.
- Decisions 22 and 25, i.e. the order of the colorbars after a toggle, and the last blue member of the Lyapunov family.
- The legibility on a projector, and the playback rate on the presentation machine.
- Live keyboard focus between reveal.js and the viewer.
