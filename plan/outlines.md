# outline:story
# Bifurcation tracking in DyLAN: slide outline

**1. Bifurcation tracking in DyLAN** · `title` · 20 s · backdrop `tubes`
Steps: none.
Notes: name, group, DyLAN, and the epic DYLAN-487 on bifurcations of periodic-orbit families.

**2. Broucke's orbits, redrawn** · `figure` · 60 s · plate: the 25 s MP4 teaser, autoplay, poster
1. The teaser plays on entry.
2. Caption: "What happens to a periodic orbit when the primaries' orbit becomes elliptic, and can we trust what Broucke drew in 1969?"

Notes: families 7, 8, and 11 appear in five frames. Promise to answer both questions by minute 25.

**3. Models** · `section` · 15 s · backdrop: family 7, rotating-pulsating, live
Steps: none.

**4. The CR3BP in one surface** · content · 100 s · zone: three.js surface, μ = 0.05
1. "In the rotating frame, the effective potential drives the motion:"
2. \[\ddot x-2\dot y=-\partial_x\tilde U,\quad \ddot y+2\dot x=-\partial_y\tilde U,\quad \tilde U=U_g+U_c\]
3. Surface: the wells of \(U_g\), then the bowl of \(U_c\), then their sum.
4. "Its five critical points are the libration points \(\mathcal L_1\) to \(\mathcal L_5\)." The surface marks them.

Notes: μ = 0.05 keeps the saddles visible, while Earth–Moon is μ = 0.01215.

**5. Energy fences the motion in** · content · 80 s · zone: same surface
1. "Along every orbit, one quantity is conserved:"
2. \[C=-2E,\qquad E=\tfrac12(\dot x^2+\dot y^2)+\tilde U\]
3. "Hill's region, the allowed region, is \(\tilde U\le -C/2\)." The surface is cut at C, with the Hill curve drawn.

Notes: periodic orbits come in one-parameter families, e.g. in C. The MAE 541 report used the opposite convention.

**6. Let the primaries move on an ellipse** · content · 110 s · zone: frames scene
1. "The primaries now follow a Kepler ellipse of eccentricity e:"
2. \[\rho(\theta)=\frac{1-e^2}{1+e\cos\theta}\]
3. "Dividing by ρ(θ) pins the primaries in place:"
4. \[(\xi,\eta)=\rho(\theta)\,(x,y)\]
5. Demo: I drag the e slider, and the grid breathes in the rotating and inertial panels.

Notes: θ is the true anomaly. The frames are rotating-pulsating (x, y), rotating (ξ, η), and inertial, as on the Broucke page.

**7. A potential that breathes** · content · 110 s · zone: frames scene
1. "With θ as the clock, the orbit of the primaries scales the potential:"
2. \[x''-2y'=-\frac{\partial_x\tilde U}{1+e\cos\theta},\quad y''+2x'=-\frac{\partial_y\tilde U}{1+e\cos\theta}\]
3. "The \(\mathcal L_i\) stay fixed in (x, y) and ride ellipses outside it."
4. "The right side depends on θ, so C is lost, and Hill's region with it."
5. Demo: I toggle family 7. Highlight: "An orbit must close after \(2\pi N\) in θ."

Notes: this is the Nechvíle transformation, so the slide has no zero-velocity curve. The epoch \(\theta_0\) is part of the orbit.

**8. Theory: find, follow, judge** · `section` · 15 s · backdrop: family 8, rotating-pulsating
Steps: none.

**9. Closing an orbit with Newton** · content · 120 s · zone: scene 1, CR3BP tab, Earth–Moon \(\mathcal L_1\) Lyapunov orbit
1. "A periodic orbit is a zero of the residual:"
2. \[F(X)=\phi(T;x_0)-x_0,\qquad DF\,\delta X=-F\]
3. Demo: the single-shooting iterates close on the Lyapunov orbit.
4. "Newton needs a seed: the linearization at \(\mathcal L_1\), or Richardson's third order for a halo."
5. Highlight: "a normal form in disguise" turns orange.

Notes: the free variables are \((\dot y_0, T/2)\) by symmetry. Leave the suspense: next week explains the seed.

**10. Many segments, two clocks** · content · 110 s · zone: scene 1
1. "Multiple shooting cuts the arc at nodes and adds continuity defects:"
2. \[F_i=\phi(\Delta t_i;x_i)-x_{i+1}\]
3. Demo: the convergence race over N = 1, 2, 4, 8, 16 segments.
4. "In the ER3BP the period is fixed at \(2\pi N\), so the Jacobian is square:"
5. \[D_{x_0}F=M-I,\qquad M=\Phi(\theta_0+2\pi N,\theta_0)\] Demo: the tabs for the ER3BP at periapsis, then at apoapsis.

Notes: in the CR3BP, \(M-I\) is singular because of the trivial pair, so T is freed. Ask the audience to remember \(M-I\).

**11. Following a family** · content · 120 s · zone: scene 2, Lyapunov tab in C
1. "Natural parameter: step p, then correct X."
2. Demo: the natural-parameter pen follows the Lyapunov family in C.
3. "Pseudo-arclength instead steps along the tangent τ of the curve Y = (X, p):"
4. \[Y^{(0)}=Y_k+\Delta s\,\tau_k,\quad G(Y)=\begin{bmatrix}F(Y)\\ \tau_k\cdot(Y-Y_k)-\Delta s\end{bmatrix}\]
5. Demo: both pens succeed. Column: "Here both succeed. Keep the second in mind."

Notes: the bordered Jacobian stays nonsingular at a fold. I hold the family 11 tab back for slide 18.

**12. Judging an orbit: the multipliers** · content · 100 s · zone: stability demo, unit circle, family 11 tab
1. "Over one period, M maps small deviations, and its λ obey:"
2. \[\lambda^4+a_1\lambda^3+a_2\lambda^2+a_1\lambda+1=0\]
3. "The λ come in reciprocal pairs, so \(a_1\) and \(a_2\) decide." Highlight: \(a_1\) and \(a_2\) turn orange.

Notes: M is symplectic, hence the palindrome. These are Broucke's stability coefficients.

**13. Broucke's diagram** · content · 120 s · zone: stability demo, circle synced with the \((a_1,a_2)\) point
1. "With \(k=\lambda+1/\lambda\), each pair gives one index:"
2. \[k^2+a_1k+a_2-2=0\]
3. "Three curves cut the plane into seven regions:"
4. \[a_2=-2a_1-2,\quad a_2=2a_1-2,\quad a_2=\tfrac{a_1^2}{4}+2\] Demo: the region names appear, with the crossings of k = ±2 marked.
5. "The CR3BP lives on the first line, and e releases an orbit." Demo: the tabs for families 7, 8, and 11.

Notes: say ζ = k/2 once, and use the Frauenfelder–Moreno names. Only region 1 is stable.

**14. Where k = ±2, families change** · content · 110 s · zone: stability demo paused at a crossing
1. "The Jacobian of the corrector degenerates on the line k = 2:"
2. \[\det(M-I)=2+2a_1+a_2=(2-k_1)(2-k_2)\]
3. "At k = 2: a fold (saddle-node, tangent) or a branch point (pitchfork or transcritical)."
4. "The tangent tells them apart: \(\tau_p=0\) only at a fold."
5. "At k = −2: a period-doubling (flip)."

Notes: Keller's condition is that \(D_pF\) lies outside the range of \(D_XF\). Give our names beside the textbook ones.

**15. Broucke 1969, reproduced** · `section` · 15 s · backdrop: family 11, inertial
Steps: none.

**16. Six branches, five frames** · `figure` · 100 s · plate: the Broucke page inline, kiosk mode
1. Caption: "Families 7, 8, and 11, both branches, every statement of Broucke's text reproduced."

Notes: family 7 uses the Earth–Moon μ, and families 8 and 11 use μ = 0.5.

**17. Side by side with Broucke** · content · 130 s · zone: the comparison figures
1. Figure: AIAA Fig. 4 beside the DyLAN diagram of family 11.
2. Highlight: the \(a_1\) axis, mislabeled by a factor of ten.
3. The figures cycle through each branch, with DyLAN in each frame beside Broucke's panel.
4. "His pulsating panels match, and his inertial ones are scaled per axis."

Notes: the text of the paper gives the correct values, i.e. \(a_1\) from −5000 to −200.

**18. Where Broucke stopped** · content · 160 s · zone: scene 2, family 11 tab in e
1. Quote: "for e = 0.454 there definitely was divergence" (Broucke 1969).
2. Demo: the natural-parameter pen fails past e = 0.453.
3. Demo: the pseudo-arclength pen turns at e = 0.45386.
4. "There \(k_1=2\) and \(\tau_e=0\): a fold, not a numerical failure."
5. "Past the fold, \(k_1=-2\) at e = 0.452: a period-doubling."

Notes: this slide answers the opening question. "The other branch" is the same family past its fold.

**19. The calls in PyDyLAN** · content · 60 s · zone: a code block
1. Code: `pydylan.eom.ER3BP(primary, secondary, eccentricity)`, `EllipticPeriodicOrbit`, `ContinuationMethod.pseudo_arc_length`, `ParameterType.eccentricity`, `StabilityRegion`, with f as the true anomaly.

Notes: the build is vestini/master, and the branches 537 to 532 are unmerged.

**20. Next week: where seeds come from** · `closing` · 45 s · backdrop `tubes`
1. "Broucke holds up, and his wall at 0.454 is a fold. Next: normal forms."

Notes: thanks, then questions.

---

The talk runs 1700 s (28 min 20 s), on 20 slides with 57 steps. The style guide's range is 35 to 55 steps, and I went over it on purpose on the theory slides. Two slides more than the target of 18 come from the CR3BP ramp and the ER3BP each taking two slides.

I posed the two questions on the first content slide, so each theory slide answers a need that the story has just raised. Each piece is also used by the next one: \(M-I\) reappears as \(\det(M-I)\), and the pseudo-arclength pen reappears at the fold. I held the family 11 tab and Broucke's quote of his divergence back until the theory explains them, so the climax resolves both opening questions at once. The orange "normal form in disguise" on slide 9 then pays off on the closing slide as next week's talk.

# outline:two-acts
# Outline: bifurcation tracking in DyLAN (about 30 min, 19 slides)

### 1. Bifurcation tracking in DyLAN
`title` · 30 s · backdrop `tubes`, live
Steps: none.
Note: The talk has two acts, the models and then the bifurcation theory, and it ends on Broucke 1969 as validation.

### 2. Broucke's families as e grows
`figure` · 45 s · plate: the 25 s MP4 teaser, `data-autoplay`, looped, with a poster
Steps: none. Caption: "Families 7, 8, and 11 of Broucke 1969, reproduced in DyLAN."
Note: This is where we land, and by the end every frame and color here has a meaning.

### 3. Act 1: the models
`section` · 15 s · backdrop: the new family 7 backdrop, inertial frame
Note: The CR3BP gets two slides, then the ER3BP gets four.

### 4. The CR3BP in one potential
content · 100 s · zone: the three.js surface of Ũ at μ = 0.05
1. Sentence: "In the rotating frame, the primaries sit at −μ and 1 − μ:"
2. Display: `\ddot{x}-2\dot{y}=-\partial_x\tilde{U},\qquad \ddot{y}+2\dot{x}=-\partial_y\tilde{U}`
3. Sentence: "The effective potential adds gravity and a centrifugal term:"
4. Display: `\tilde{U}=U_g+U_c=-\frac{1-\mu}{\rho_1}-\frac{\mu}{\rho_2}-\frac{x^2+y^2}{2}`. The surface shows the two wells, then the bowl, on shared indices.
5. Demo: the surface shows the sum.

Note: The Coriolis terms do no work, hence the potential alone decides where a particle can go.

### 5. One integral, five fixed points
content · 90 s · zone: the same surface
1. Sentence: "The energy is conserved, written as the Jacobi constant:"
2. Display: `C=-2E=-2\tilde{U}-\dot{x}^2-\dot{y}^2`
3. Demo: the five extrema light up as \mathcal{L}_1 to \mathcal{L}_5.
4. Demo and sentence: the cut at Ũ = −C/2 draws the Hill curve, with the line "Hill's region, the allowed region, is where −2Ũ ≥ C."

Note: Keep two facts in mind. C is conserved and the \mathcal{L}_i are fixed, and the ER3BP breaks the first and keeps the second.

### 6. Primaries on an ellipse
content · 120 s · zone: the tycho frames scene with its pulsating, rotating, and inertial panels
1. Sentence: "The primaries now move on ellipses, at a separation"
2. Display: `\rho(\theta)=\frac{1-e^2}{1+e\cos\theta}`
3. Display: `(\xi,\eta)=\rho(\theta)\,(x,y)`
4. Demo and sentence: the clock plays, with the line "In (x, y) the primaries stay at −μ and 1 − μ."

Note: θ is the secondary's true anomaly. (ξ, η) rotates with θ, and (x, y) also divides by ρ.

### 7. θ as the clock, and no Jacobi integral
content · 140 s · zone: the frames scene, with the clock switched from θ to t
1. Sentence: "With θ as the clock, the CR3BP returns, scaled:"
2. Display: `x''-2y'=-\frac{\partial_x\tilde{U}}{1+e\cos\theta},\quad y''+2x'=-\frac{\partial_y\tilde{U}}{1+e\cos\theta},\quad \frac{dt}{d\theta}=\frac{\rho^2}{\sqrt{1-e^2}}`. The clock toggle shares this index.
3. Sentence: "The factor depends on θ, hence the energy drifts:"
4. Display: `\frac{dE}{d\theta}=\frac{e\sin\theta}{(1+e\cos\theta)^2}\,\tilde{U},\quad E=\tfrac12(x'^2+y'^2)+\frac{\tilde{U}}{1+e\cos\theta}`
5. Sentence: "The Jacobi constant and a fixed Hill's region are lost."

Note: The primes mean d/dθ. In t, the motion runs fast near periapsis.

### 8. Libration points as homographic solutions
content · 120 s · zone: the frames scene, with the eccentricity slider and the breathing grid
1. Sentence: "The factor does not move the zeros of the gradient:"
2. Display: `\nabla\tilde{U}(x,y)=\boldsymbol{0}\;\Rightarrow\;\mathcal{L}_i\ \text{fixed in }(x,y)\ \text{for every }e`
3. Demo: the slider takes e from 0 to 0.6. The points stay fixed in the pulsating panel, breathe in the rotating panel, and trace ellipses in the inertial panel.
4. Sentence: "Each \mathcal{L}_i keeps its shape with the primaries."
5. Highlight: the grid lines breathe in the rotating and inertial panels.

Note: These are Lagrange's homographic solutions. Each is fixed in (x, y) and 2π-periodic in the physical frames.

### 9. Orbits must close after 2πN
content · 110 s · zone: the frames scene, with the family 7 orbit toggle
1. Sentence: "The equations are 2π-periodic in θ, so an orbit closes on a multiple:"
2. Display: `\boldsymbol{x}(\theta_0+2\pi N)=\boldsymbol{x}(\theta_0),\qquad N\in\mathbb{N}`
3. Sentence: "The period is fixed, so e becomes the family parameter."
4. Demo and sentence: the toggle shows the orbit, with the line "θ₀ = 0 and θ₀ = π start the periapsis and apoapsis branches."

Note: The CR3BP has families at fixed μ in C, whereas Broucke continues in e at the period 2π.

### 10. Act 2: bifurcation theory
`section` · 15 s · backdrop: the family 11 backdrop, rotating-pulsating frame
Note: The act corrects an orbit, continues it, measures its stability, and classifies each crossing.

### 11. Correcting a periodic orbit
content · 150 s · zone: tycho scene 1, with the tabs CR3BP, ER3BP at periapsis, and ER3BP at apoapsis
1. Sentence: "A periodic orbit is a zero of the closure defect:"
2. Display: `\boldsymbol{F}(\boldsymbol{X})=\boldsymbol{\phi}(T;\boldsymbol{x}_0)-\boldsymbol{x}_0,\qquad \boldsymbol{D}_{\boldsymbol{X}}\boldsymbol{F}\,\delta\boldsymbol{X}=-\boldsymbol{F}`
3. Demo: single shooting on the Lyapunov orbit, then on family 11.
4. Sentence and demo: "Multiple shooting splits the arc and closes the defects." The convergence race runs over N = 1, 2, 4, 8, 16.
5. Sentence: "Seeds come from the linearization at \mathcal{L}_1, or from Richardson."

Note: In the ER3BP T = 2πN and X = x₀, hence D_X F = M − I. Richardson's third-order halo seed is a normal form in disguise, which is next week's talk.

### 12. Continuation through a fold
content · 140 s · zone: tycho scene 2
1. Sentence and demo: "A family solves F(X, p) = 0 as p varies." The Lyapunov family is continued in C, and both pens succeed.
2. Sentence: "Pseudo-arclength steps along the tangent τ and adds one row:"
3. Display: `\boldsymbol{G}(\boldsymbol{Y})=\begin{bmatrix}\boldsymbol{F}(\boldsymbol{Y})\\ \boldsymbol{\tau}_k\cdot(\boldsymbol{Y}-\boldsymbol{Y}_k)-\Delta s\end{bmatrix}=\boldsymbol{0},\quad \boldsymbol{Y}=(\boldsymbol{X},p)`
4. Demo and sentence: family 11 is continued in e, with the line "At the fold, e = 0.454 and τ_e = 0, and natural steps fail."

Note: Broucke's corrections diverged past e = 0.453. The second solution there is the same family past its fold, not another branch.

### 13. Monodromy matrix and multipliers
content · 120 s · zone: the stability demo, unit-circle panel
1. Sentence: "Linearizing over one period gives the monodromy matrix:"
2. Display: `\boldsymbol{M}=\boldsymbol{\Phi}(\theta_0+2\pi N,\theta_0),\qquad \det(\boldsymbol{M}-\lambda\boldsymbol{I})=0`. The multipliers appear on the circle at this step.
3. Sentence: "M is symplectic, so the multipliers pair as λ and 1/λ:"
4. Display: `\lambda^4+a_1\lambda^3+a_2\lambda^2+a_1\lambda+1=0,\qquad k^2+a_1k+a_2-2=0,\quad k=\lambda+1/\lambda`
5. Sentence: "An orbit is stable when both k are real in (−2, 2)."

Note: Say ζ = k/2 once, for the registry's readers.

### 14. Broucke's diagram and its regions
content · 170 s · zone: the stability demo, (a1, a2) panel synchronized with the circle
1. Sentence: "Each orbit is a point (a1, a2), and three curves cut the plane:"
2. Display: `a_2=\frac{a_1^2}{4}+2,\qquad a_2=-2a_1-2,\qquad a_2=2a_1-2`
3. Sentence: "The parabola splits real from complex k, and the lines are k = ±2."
4. Demo: the seven regions get their names, and region 1 is the only stable one.
5. Demo and sentence: the family 11 point leaves the line, with the text "The CR3BP sits on k = 2, and e lifts a family off it."

Note: The lines touch the parabola at (∓4, 6) and cross at (0, −2). The regions take the Frauenfelder–Moreno names, from 𝓔² to 𝓔𝓗⁻.

### 15. Which crossing is which bifurcation
content · 120 s · zone: the stability demo, family 11 tab, with the crossings of k = ±2 marked
1. Sentence: "The corrector's Jacobian ties the diagram to continuation:"
2. Display: `\det(\boldsymbol{M}-\boldsymbol{I})=2+2a_1+a_2=(2-k_1)(2-k_2)`
3. Sentence: "At k = 2 there is a fold (saddle-node, tangent) if τ_p = 0, and otherwise a branch point (pitchfork or transcritical)."
4. Sentence and demo: "At k = −2 there is a period-doubling (flip)." On family 11, k₁ = 2 at e = 0.45386, and k₁ = −2 at 0.452138, past the fold.

Note: A crossing of k = 2cos(2πl/q) is a period-multiplying bifurcation, which DyLAN does not track yet.

### 16. The Broucke page
`narrow` · 80 s · zone: the Broucke page inline, a tycho-viewer in kiosk mode
1. Demo: the e slider runs to 0.453 through families 7, 8, and 11 and both branches, across five panels.

Note: Hand the slider to someone during the questions.

### 17. DyLAN beside Broucke
`figure` · 150 s · plate: the comparison figures, each replaced in place
1. Figure: AIAA Fig. 4, the stability diagram, with its a1-axis mislabel noted.
2. Figure: family 7, both branches, the DyLAN figure in each frame beside Broucke's.
3. Figure: family 8, the same layout.
4. Figure: family 11, the same layout.

Caption: "The pulsating panels match, and the other frames differ only in scale."
Note: I checked all 144 panels. His inertial panels are scaled per axis, and five of his tick labels are off by a factor of ten.

### 18. The calls in PyDyLAN
`wide` · 40 s · zone: a code block
1. Code: `pydylan.eom.ER3BP(primary, secondary, eccentricity)` and the frame maps, which take f as the true anomaly.
2. Code: the orbit, continuation in e, and `StabilityRegion`. These names are placeholders until they are copied from the vestini/master demo scripts.

Note: The elliptic periodic orbit is not merged yet. It is on the dylan-core chain from DYLAN-537 to DYLAN-188.

### 19. Next week: the normal form
`closing` · 45 s · backdrop `tubes`
1. Sentence: "Next week: normal forms, and why Richardson's seed works."

Note: Take questions.

## Totals

The slides add up to 1800 s (30 min) over 19 slides with 58 steps. The ER3BP slides 6 to 9 take 490 s, and the Broucke diagram and bifurcation slides 14 to 15 take 290 s, plus 230 s of results. The outline has one slide and a few steps more than the style guide's 18 slides and 35 to 55 steps.

## Why this order

1. The CR3BP comes first, built around one conserved integral and five fixed points, so that each ER3BP slide can show which of these the eccentricity takes away and which it keeps.
2. The ER3BP section ends on orbits closing after 2πN, so the fixed period leads straight to a corrector whose Jacobian is M − I. That ties correction, continuation, and the multipliers to one matrix.
3. The bifurcation types come only after the Broucke diagram, which lets every crossing be pointed at in the stability demo before the comparison figures check the whole chain against Broucke.

## To check

1. Slide 7 uses Szebehely's form, with 1/(1 + e cos θ) scaling the whole gradient, which is the form that keeps the libration points fixed. The vault note on the planar ER3BP puts r/p on gravity alone. Check it against Broucke 1969, and check the sign of dE/dθ, before the slides are built.

# outline:teacher
# Bifurcation tracking in DyLAN: slide outline

### 1. Tracking bifurcations of periodic-orbit families
title · 35 s · backdrop `tubes`, live
Steps: none.
Note: Claudio's name, the Beeson group, and the question of how orbit families change as the model changes.

### 2. Broucke's 1969 families, recomputed
figure · 50 s · plate with the 25 s MP4 teaser of the Broucke page, autoplay, loop, poster
Steps: none.
Note: tell the audience that by slide 15 they will be able to read every panel of this clip.

### 3. The models
section · 15 s · backdrop of family 7, rotating-pulsating
Steps: none.

### 4. Motion in the rotating frame
content · 120 s · zone: three.js surface of Ũ at μ = 0.05
1. Two primaries of mass ratio μ circle their barycenter. In the frame that turns with them, a massless third body obeys these equations.
2. `\ddot x - 2\dot y = -\partial_x \tilde U, \qquad \ddot y + 2\dot x = -\partial_y \tilde U`
3. `\tilde U = U_g + U_c, \quad U_g = -\frac{1-\mu}{\rho_1} - \frac{\mu}{\rho_2}, \quad U_c = -\frac{x^2+y^2}{2}`, where ρ₁ and ρ₂ are the distances to the primaries. The surface shows the wells of U_g (same index as the display).
4. Demo: the surface adds the centrifugal bowl U_c.
5. Demo: the surface shows the sum Ũ. Sentence: the body slides on Ũ, and the Coriolis terms push it sideways.
Note: the primaries sit at (−μ, 0) and (1 − μ, 0), in nondimensional units.

### 5. Equilibria and Hill's region
content · 110 s · zone: the same surface
1. Demo and sentence: where ∇Ũ = 0 the body can rest. These are five libration points, 𝓛₁ to 𝓛₅, i.e. three saddles and two maxima.
2. Multiplying by the velocity and integrating gives a conserved quantity, the Jacobi constant.
3. `C = -2E = -2\tilde U(x,y) - (\dot x^2 + \dot y^2)`
4. Demo: the surface is cut at height −C/2, which draws the Hill curve. Sentence: Hill's region, the allowed region, is the set where −2Ũ ≥ C.
Note: speed squared cannot be negative, so the cut is the boundary of the region the body can reach.

### 6. Primaries on ellipses: the ER3BP
content · 180 s · zone: tycho frames scene (pulsating, rotating, and inertial panels), opening at e = 0
1. Let the primaries move on ellipses of eccentricity e. Their separation then pulses with the true anomaly θ.
2. `\rho(\theta) = \frac{1-e^2}{1+e\cos\theta}`
3. Dividing the rotating coordinates (ξ, η) by ρ gives the rotating-pulsating coordinates (x, y), with θ as the time variable.
4. `x'' - 2y' = -\frac{\partial_x \tilde U}{1+e\cos\theta}, \qquad y'' + 2x' = -\frac{\partial_y \tilde U}{1+e\cos\theta}`
5. Sentence: Ũ is unchanged, hence the 𝓛ᵢ stay fixed in (x, y), and C is not conserved. Live: drag the e slider and watch the grid breathe in the rotating and inertial panels. Then toggle the family 7 orbit, which closes only after 2πN.
Note: the vector field is 2π-periodic in θ, so a periodic orbit has to close in phase with the primaries. A zero-velocity curve does not exist here.

### 7. Families of periodic orbits
section · 15 s · backdrop of family 8, inertial
Steps: none.

### 8. Differential correction
content · 130 s · zone: tycho scene 1, CR3BP tab, single shooting
1. An orbit is periodic when the flow φ returns its initial state. Hence we look for a zero of F.
2. `\boldsymbol F(\boldsymbol x_0, T) = \boldsymbol\phi(T;\boldsymbol x_0) - \boldsymbol x_0 = \boldsymbol 0`
3. Newton's method linearizes F with the state transition matrix Φ = ∂φ/∂x₀.
4. `\boldsymbol D_{\boldsymbol X}\boldsymbol F\,\delta\boldsymbol X = -\boldsymbol F, \quad \boldsymbol D_{\boldsymbol X}\boldsymbol F = \begin{bmatrix}\boldsymbol\Phi(T,\boldsymbol x_0) - \boldsymbol I & \boldsymbol f(\boldsymbol x(T))\end{bmatrix}`
5. Demo: the iterates on the Earth–Moon 𝓛₁ Lyapunov orbit close, and ‖F‖ falls quadratically.
Note: X = (x₀, T), and f is the vector field.

### 9. Multiple shooting, and where seeds come from
content · 120 s · zone: tycho scene 1, family 11
1. On a long or unstable arc, the errors grow. Multiple shooting cuts the arc at nodes x_i and asks each segment to meet the next.
2. `\boldsymbol F_i = \boldsymbol\phi(\Delta t_i;\boldsymbol x_i) - \boldsymbol x_{i+1} = \boldsymbol 0, \qquad \boldsymbol x_S \coloneqq \boldsymbol x_0`
3. Demo: the convergence race over S = 1, 2, 4, 8, and 16 segments. The nodes slide and the defects close.
4. Demo: the ER3BP tabs, at periapsis and at apoapsis. Sentence: T is pinned at 2πN, so the Jacobian is Φ(2πN, x₀) − I.
5. Newton still needs a seed. It comes from the linearization at 𝓛₁ for a Lyapunov orbit, or from Richardson's third-order approximation for a halo, which is a normal form in disguise.
Note: leave step 5 open as the hook for next week's talk on normal forms. I write S for the segment count because N already counts the revolutions in 2πN.

### 10. Continuation: from one orbit to a family
content · 170 s · zone: tycho scene 2, the (p, x₀) diagram over two orbit panels
1. If we free a parameter p, e.g. C or e, the isolated zeros become a curve, i.e. the family.
2. `\boldsymbol F(\boldsymbol X, p) = \boldsymbol 0`
3. Sentence: natural-parameter continuation steps p and corrects X, while pseudo-arclength continuation steps a distance Δs along the tangent τ_k. Demo: both pens trace the Lyapunov family in C.
4. `\boldsymbol Y = (\boldsymbol X, p), \quad \boldsymbol G(\boldsymbol Y) = \begin{bmatrix}\boldsymbol F(\boldsymbol Y)\\ \boldsymbol\tau_k^{\mathsf T}(\boldsymbol Y - \boldsymbol Y_k) - \Delta s\end{bmatrix} = \boldsymbol 0`
5. Demo: family 11 in e. The natural pen fails at the fold, e = 0.454, and the arclength pen turns back. Sentence: at a fold τ_e = 0, and the sign change of τ_e detects the fold.
Note: the bordered Jacobian stays nonsingular at a simple fold (Keller).

### 11. Stability: the monodromy matrix
content · 110 s · zone: stability demo, unit-circle panel only, family 11 at e = 0
1. Follow a small offset for one period. It comes back multiplied by the monodromy matrix M.
2. `\delta\boldsymbol x(T) = \boldsymbol M\,\delta\boldsymbol x_0, \qquad \boldsymbol M = \boldsymbol\Phi(T,\boldsymbol x_0)`
3. Its eigenvalues λ are the Floquet multipliers. A Hamiltonian flow pairs each λ with 1/λ, so the planar CR3BP has {1, 1, λ, 1/λ}. The circle panel lights up (same index).
4. `k = \lambda + \frac{1}{\lambda}, \qquad |k| < 2 \iff |\lambda| = 1`
Note: |k| > 2 gives a real pair, which is unstable. Mention the registry's ζ = k/2 once here.

### 12. Broucke's diagram
content · 150 s · zone: stability demo, full (unit circle beside the (a₁, a₂) diagram)
1. In the ER3BP the trivial pair leaves 1. Two indices, k₁ and k₂, are then free, and the multipliers solve a quartic.
2. `\lambda^4 + a_1\lambda^3 + a_2\lambda^2 + a_1\lambda + 1 = 0, \quad a_1 = -(k_1+k_2), \quad a_2 = 2 + k_1k_2`
3. The stability type can change only on three curves, where k₁ = k₂ or k = ±2.
4. `a_2 = \tfrac{a_1^2}{4} + 2, \qquad a_2 = -2a_1 - 2, \qquad a_2 = 2a_1 - 2`
5. Demo: on family 11, the point leaves the CR3BP line a₂ = −2a₁ − 2 as e grows, and the region names light up. Then the tabs for families 7 and 8.
Note: the curves cut the plane into seven regions, and only region 1 is stable. The names are Frauenfelder–Moreno's.

### 13. How a family changes
content · 130 s · zone: stability demo, with the crossings of k = ±2 marked
1. With T pinned, the corrector Jacobian is M − I, and its determinant factors into the indices.
2. `\det(\boldsymbol M - \boldsymbol I) = 2 + 2a_1 + a_2 = (2-k_1)(2-k_2)`
3. At k = +2 the corrector is singular. The point is a fold (saddle-node, tangent) if τ_e = 0, and otherwise a branch point (pitchfork or transcritical). Highlight: the k = +2 line turns orange.
4. At k = −2 a multiplier is −1. This is a period-doubling (flip): the doubled orbit bifurcates while the family continues. Highlight: the k = −2 line turns violet.
5. Demo: on family 11, k₁ = 2 at the fold, e = 0.45386, and k₁ = −2 at e = 0.452138, past the fold.
Note: this slide ties continuation to stability, because folds sit on the k = +2 line.

### 14. Broucke 1969, reproduced
section · 15 s · backdrop of family 11, rotating-pulsating
Steps: none.

### 15. The Broucke page
wide · 130 s · zone: the Broucke page inline as a tycho-viewer in kiosk mode
1. Broucke continued three families in e at period 2π from two epochs, with the secondary at periapsis or at apoapsis. Family 7 is at μ = 0.012155, and families 8 and 11 are at μ = 0.5.
2. Live: family 7 at apoapsis stays stable as e grows. Then family 11 at periapsis ends at e = 0.453, at its fold. Switch the panels.
Note: the "intricate" shapes are an effect of the frame, so compare in the rotating-pulsating frame.

### 16. Every branch against Broucke's figures
figure · 140 s · plate, with each figure replacing the last in place
1. Figure: AIAA Fig. 4. Caption: the a₁ axis is mislabelled by a factor of ten.
2. to 7. Figures, one step per branch (7 periapsis, 7 apoapsis, 8 periapsis, 8 apoapsis, 11 periapsis, 11 apoapsis): the DyLAN row in five frames over Broucke's row.
Note: give each branch its region path, e.g. 8 apoapsis runs from region 4 to region 2 near e = 0.30 and reaches region 1 at e = 0.85.

### 17. The same, in PyDyLAN
wide · 80 s · zone: none, code at 36 px
1. Code: `pydylancore.eom.ER3BP(earth, moon, e)` and `EllipticPeriodicOrbit(system, seed, 2*pi, 1, 1, f0)`.
2. Code: `ContinuationMethod.pseudo_arc_length`, `set_record_family(True)`, and `solve_for_orbit()`.
3. Code: `compute_member_stability(...)` and `StabilityAnalysis.stability_region_from_coefficients(a1, a2)`.
Note: the code writes f for θ, as DyLAN's frame API does, and a₁ = −tr M.

### 18. Next: branch switching and normal forms
closing · 70 s · backdrop `tubes`
Steps: none. Column: detecting and switching branches (DYLAN-490), Krein signs (DYLAN-491), and next week, normal forms.
Note: invite questions, and repeat the suspense about why Richardson's seed works.

## Totals and rationale

The total time is 1770 s, about 29.5 minutes. The outline has 18 slides and 55 steps. Each step is a fragment or a live demo action.

Each object of the theory (Ũ, C, ρ(θ), F, Φ, M, k, and a₁ with a₂) is defined at the moment the next demo needs it, so a student who knows only the CR3BP can climb one rung per slide. The determinant det(M − I) = (2 − k₁)(2 − k₂) joins the corrector to the stability diagram, which lets the fold seen in continuation reappear as a crossing of k = +2 rather than as a new idea. The Broucke results come only after every symbol on his figures has been taught, so the comparisons can go by quickly and still be read.

