# Adversarial review of the correction and continuation explainers

**Verdict: NEEDS CHANGES.** I found two major correctness mismatches, two minor presentation defects, and one documentation note. The numerical corrector, generated orbit data, and headline numbers passed the checks below.

## Findings

1. **Major: slide 13 gives a different pseudo-arclength equation from the implemented algorithm.** The audience sees the unweighted condition $\boldsymbol{\tau}_k^T(\boldsymbol{Y}-\boldsymbol{Y}_k)=\Delta s$ at `index.html:331`. The weighted condition $\boldsymbol{\tau}_k^T\boldsymbol{W}(\boldsymbol{Y}-\boldsymbol{Y}_k)=\Delta s$ is given at `STORYBOARD.md:63` and implemented at `corrector.py:591-598`. This is a substantive difference. At `build.py:51-52`, nonzero weight is assigned to the unplotted launch velocity, and zero weight is assigned to the half period of the Lyapunov family. Thus the metric is not simply the diagram distance, and for the Lyapunov family it is only a seminorm. In my reconstruction of the medium family-11 run, the projected blue predictor ranged from 0.253 to 0.999 of its nominal weighted length. The claim at `STORYBOARD.md:65` that every blue step is as long in the diagram as the corresponding natural step is therefore false near the fold. Slide 13 must include $\boldsymbol{W}$ and define the metric, or the scene must use the unweighted condition shown on the slide.

2. **Major: the speaker states a single-shooting Jacobian while the scene remains at eight segments.** The presenter selects $S=8$ in shot 3 at `STORYBOARD.md:49`. In shot 4 the presenter changes only the system, then says that the Jacobian becomes $\boldsymbol{\Phi}(2\pi K)-\boldsymbol{I}$ at `STORYBOARD.md:50`. At $S=8$, a block multiple-shooting Jacobian is assembled from eight segment state transition matrices and the node-continuity blocks at `corrector.py:320-347`. The displayed matrix is valid only for single shooting. Claudio correctly added this qualification to the live notes at `index.html:294`, but it is absent from the storyboard line intended for those notes. The presenter must reset $S=1$ or say, "With a single segment, the Jacobian is ..."

3. **Minor: the last sentence of slide 13 is clipped.** On page 60 of the current `slides.pdf`, I found the sentence at `index.html:338` below the slide boundary. The audience cannot read the conclusion that the eccentricity component of the tangent changes sign past the fold.

4. **Minor: the storyboard is not synchronized with the deck or its notes.** The scenes are assigned to slides 8 to 10 at `STORYBOARD.md:3`, in `README.md`, and in the heading of `build.py`. They are on slides 10 to 13 at `index.html:246-351`. The live notes also retain unresolved control cues at `index.html:272` and `index.html:349`. A presenter following the storyboard is therefore sent to the wrong slide numbers without the promised control names.

5. **Note: a model docstring has the force-gradient sign backwards.** In the docstring at `corrector.py:68`, the returned vector is called minus the gradient of the effective potential. The returned expressions are the positive gradient $\nabla U$, and the positive sign is used correctly at `corrector.py:83-88`. The results are unaffected, but the description can mislead a later derivation.

## Checks that passed

I derived the planar circular and elliptic restricted three-body problem equations from the stated rotating and rotating-pulsating conventions. The force terms, the pulsation factor $1/(1+e\cos\theta)$, the state transition matrix equations, and the eccentricity sensitivity have the correct signs. Centered finite differences agreed with the propagated state transition matrix, the sensitivity, and both continuation Jacobians.

I reran `check_dylan.py` with the named `vestini/master` bindings. It completed in 22 s. The largest initial-state gap among the converged correction groups was $6.4\times10^{-11}$. The family-11 members were within $7.1\times10^{-12}$ of the DyLAN curve by the check's minimum-norm measure. The largest eccentricity in `runs.json` is 0.45386498, while the separate stability data give 0.45386506 for the fold.

I also propagated both circular references and formed their monodromy matrices. The unstable multipliers are 109.341 for the Earth-Moon Lyapunov orbit and 4916.934 for family 11. The minimum center-to-center Moon distance is 0.0206624 DU, or 7943 km with a 384400 km Earth-Moon distance. These results support the spoken claims of hundredfold and 5000-fold amplification and an 8000 km clearance.

I confirmed the iterate counts, residuals, line-search fractions, alternate period 5.17, stopping values, and failure counts from the generated runs. The small family-11 run has 9 natural-parameter and 14 pseudo-arclength failures. The large run has 25 and 18, respectively.

## What I could not check

- I did not rebuild the scenes, run `npm run check`, or regenerate the PDF because the brief forbids writes outside this verification folder. I reviewed the existing generated `.tys`, `.tyd`, HTML, `runs.json`, and `slides.pdf` files.
- I did not operate the interactive pages. Live playback, controls, light mode, zooming, dragging, and the initial paused state remain unchecked.
- The PDF contains placeholders for the live scenes. I checked the text layout of slides 10 to 13, but not the rendered scene panels within those slides.
- This was a mode-A review, not a clean-room recomputation. The DyLAN agreement does not establish the provenance of the Broucke CSV data or the claim about Richardson's expansion.
