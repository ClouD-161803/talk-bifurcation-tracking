# Judge report, round 1: the correction and continuation scenes (Opus, brief J1)

Orchestrating session: 43f4a815-2ba7-4fb6-93d4-d702ed7aaee4.

The two scenes are ready with changes. Every number I checked is right, but scene 2 cannot be slowed to quarter speed in a kiosk embed, its fold payoff is split by 12 s, and the gaps of multiple shooting cannot be seen.

Another agent's report was already at `opus.md`, hence I wrote this one at `opus-j1.md`.

I took screenshots of each shot in headless Chrome, traced the readout frame by frame, and reran all 180 corrections and every continuation run with `corrector.py`. I found the storyboard right on the fall of $\log_{10}\|\boldsymbol{F}\|$ from −0.23 to −12.36 in seven iterates, with the exponent multiplied by 1.86, 1.80, and 1.87 near the end, and on every iterate and failure count. I computed the largest multipliers $|\lambda_{\mathrm{h}}| = 109$ for the Lyapunov orbit and 4917 for family 11, and a closest approach of 7943 km to the Moon, in agreement with the speaker's numbers.

The standard caps a report at twelve findings, and I give twelve, from the most severe.

## Findings

### 1. Scene 2 cannot reach quarter speed in a kiosk embed (major, slides 12 and 13)

The page is always opened at 1×, and in pytycho a value clock cannot be given a longer loop. At 1× a blue attempt lasts 0.28 s on the Lyapunov family and 0.11 s on family 11, and the tangent is shown for 15% of it. The speed menu is hidden in a kiosk embed, the default of `embed_scene.py`. Even at 0.25×, a family 11 tangent is drawn for 65 ms. Embed scene 2 with `--controls`, set 0.25× before slide 12, and stretch the first attempt of each pen to about 3 s at that speed.

### 2. On the medium step the fold payoff is split by 12 s (major, scene 2, shot 2)

The blue pen is seen to finish its turn at the fold 16.8 s into the 32 s loop, while the orange pen is still far below. Every full orange step from $e = 0.05$ is rejected, and the orange pen is stopped at the fold only at 28.7 s. On the small step I found all 9 orange failures at $e \ge 0.45$, the orange pen stopped at 21.7 s, and the blue turn from 22.7 s to 29.9 s. Play shot 2 on the small step, and move "which is why the blue one can take longer steps" to shot 4.

### 3. The scenes are not in the deck, and the default zone is too small (major, slides 10 to 13)

All four zones are placeholders. In the default zone of 600 by 800 px, the five tab rows of scene 1 are stacked and the convergence panel is about 270 px wide. With separate viewers on slides 10 and 11, the targeting would have to be set to the full period again for shot 3, which is not listed in the storyboard. Embed each scene once at full width with `--controls`, and reset its tabs after the rehearsal, since they are restored from local storage.

### 4. The notes of slide 13 claim that a large step jumps past the fold (major, scene 2, shot 4)

The speaker says that "a large step can jump past the fold", and the viewer then sees the orange pen stopped at $e = 0.45313$, below the fold at 0.45386, after 25 failures. Say instead "With the large step the orange pen fails 25 times and still stops short of the fold, while the blue pen goes around it." The tabs of the TODO are "small step", "medium step", and "large step".

### 5. Shot 1 shows multiple shooting before it is introduced (major, scene 1, shot 1)

During single shooting, the gray curves of $S = 2$ to 16 are seen to converge faster than the highlighted $S = 1$ curve, and a colorbar of $1/(1 + e\cos\theta)$ is shown although it is constant in the CR3BP. The eye is thus drawn to what is explained only on slide 11. The convergence panel is also to the right of the orbit, not below it. Hide the other segment counts and the colorbar until shot 3, and say "Watch the curve on the right".

### 6. The gaps that multiple shooting closes cannot be seen (major, scene 1, shot 3)

With $S = 8$ the position gaps are below a pixel, and the red defects are drawn as short velocity sticks, only slightly wider with the far guess. The viewer thus cannot see each segment meet the next node. Draw the position gaps magnified by a stated factor, or say "The red sticks are the jumps in velocity at each node, and Newton shrinks all eight at once."

### 7. The blue pen runs on slide 12, before it is introduced (major, scene 2, shot 1)

In the notes the speaker says "I … let the orange pen run", but the blue pen, its tangent, and its orbit panel are drawn with the same weight. The viewer thus follows two methods, one of them defined only on slide 13. Add a toggle for the blue pen, off on slide 12, or say "Follow only the orange pen for now."

### 8. The Jacobian of shot 4 is not the one on screen (minor, scene 1, shots 3 and 4)

The speaker says "the Jacobian becomes $\boldsymbol{\Phi}(2\pi K) - \boldsymbol{I}$" while $S = 8$ is on screen, and this form holds only for $S = 1$, which fails over the full period in both elliptic systems. Say "With one segment, the Jacobian would be $\boldsymbol{\Phi}(2\pi K) - \boldsymbol{I}$." The notes of slide 11 also say that more segments converge "from a worse guess", whereas shot 3 keeps the near guess. Say "From the same guess, one and two segments fail, and eight converge in four iterates."

### 9. The letter $k$ has three meanings (minor, both scenes)

The Newton iterate is written $k$ in the readout and $n$ on slide 10, the member index $k$ on slide 13, and the stability index $k$ on slides 14 to 17. On slide 13, $\tau_e$ is not defined and the weight $\boldsymbol{W}$ is left out. Rename the iterate to $n$ in the readout and the storyboard, define $\tau_e$ as "the $e$-component of the tangent", and add $\boldsymbol{W}$ to slide 13.

### 10. The speaker's words differ from the screen's (minor, scene 2, and scene 1 shot 4)

The speaker says "orange pen" and "blue pen", while the caption reads "natural pen" and "arclength pen", and the orbit panels are not drawn in the pen colors. A "natural parameter" chip is also shown over the whole diagram, and the legend "arclength s, as a f…" is cut. "The pulsation factor" of scene 1 is not defined. Write "orange (natural)" and "blue (arclength)" in the caption, tint the title of each orbit panel, drop the chip of the diagram, and say "The color is $1/(1 + e\cos\theta)$, where $\theta$ is the true anomaly of the secondary."

### 11. Three statements of the storyboard are wrong (minor, scene 1 shot 5, and the opening)

With the line search, a red cross is still drawn at the cap of ten iterates on the curves of $S = 1$, 2, and 4, and for $S = 1$ I found $\log_{10}\|\boldsymbol{F}\|$ stuck between −0.25 and −0.33. Write "With the line search, these curves no longer escape, but they creep to the cap." The slides are also numbered 8 to 10 instead of 10 to 13, and the convergence panel is placed under the orbit instead of to its right.

### 12. Live handling (note, both scenes)

Space and k are passed to the viewer only while it has the focus. Otherwise the speaker advances the deck with Space and toggles fullscreen with the F key. The zoom of shot 3 of scene 2 is undone only with the house icon, and the × of each panel and the method chips are easy to hit. In shot 6 of scene 1, $S = 2$ converges while $S = 4$ collides, and a student may ask why. The tabs for the TODO of slide 10 are "𝓛1 Lyapunov, Earth–Moon", "family 11, μ = 0.5", "CR3BP", and two "ER3BP e = 0.3" tabs. The others are "half period, symmetric", "full period", "S = 1" to "S = 16", "near", "far", and "far, line search".

## What I could not check

1. The scenes in the deck, whose zones are placeholders.
2. The frame rate on the presentation hardware, since I timed frame indices in headless Chrome.
3. The corrector against DyLAN, for which I relied on `CHECKS.md`.
4. The reveal.js key conflicts in a live deck, which I inferred from the key maps.
5. The shots of agent S, since `demos/corrector/shots/INDEX.md` was absent.
6. The legibility from the back of a room.
