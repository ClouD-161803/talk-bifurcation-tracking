# Frames scene of the ER3BP

The files in this folder are the TyCHO scene of the elliptic restricted three-body problem (ER3BP) drawn in three frames at once, for slides 6 and 7 of the teacher outline in `plan/outlines.md`. What the presenter does and what the audience sees at each step is described in `STORYBOARD.md`, whose lines are written to become speaker notes.

## Files

The script `build.py` writes `frames.tys` (the scene document), `frames.tyd` (the data container), and `frames.html` (one page with the runtime and both files inlined). It reads the Broucke input `examples/broucke/broucke-input.tyd` of the TyCHO checkout at `/Users/claudiovestini/git/tycho/code`, checks it against its released SHA-256, and imports only NumPy, pytycho, and the standard library. The script `check.py` runs the numerical checks below on the written files. Both run with the pytycho of the checkout,

```sh
uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/frames/build.py
uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/frames/check.py
```

and a build takes a few seconds. Screenshots of the page in headless Chrome are kept in `shots/`.

## The scene

The scene has one view per frame, i.e. the rotating-pulsating frame $(x, y)$, the rotating frame $(\xi, \eta)$, and the barycentric inertial frame $(X, Y)$. The page opens with the panel of the inertial frame alone, and the presenter adds the other two panels from the Add panel group of the viewer. The rotating frame is the pulsating frame scaled by the channel $\rho$, and the inertial frame is the rotating frame turned by the channel $\theta$, as on the Broucke page. The driver of every view is the secondary, at rest in the pulsating frame and sampled at 361 equal steps of $\theta$ over one forcing period, with the channels $\theta$, $t$, and $\rho(\theta)$ in float64. The time $t$ is the mean anomaly from Kepler's equation, zero at periapsis. The bodies are the primary $m_1$, the secondary $m_2$, and the five libration points $\mathcal{L}_1$ to $\mathcal{L}_5$, at their CR3BP positions in the pulsating frame, which are stored as attributes of the driver set. I solved the quintics of $\mathcal{L}_1$, $\mathcal{L}_2$, and $\mathcal{L}_3$ with NumPy's `roots` and polished each root with Newton's method. The grid is made of chords of a disc of radius 1.5 DU, 0.25 DU apart with a brighter line every 0.5 DU, and the circle of the disc, all drawn in the driver's context in one neutral gray.

A tab picks one of two mass ratios. At $\mu = 0.5$, the default, the orbit is the periapsis branch of Broucke's family 11, and at $\mu = 0.012155$ it is the periapsis branch of family 7. The Broucke input does not have family 7 at $\mu = 0.5$, since Broucke continued it only at the Earth–Moon value, and family 11 is the branch at $\mu = 0.5$ that fits the same box as family 7. The orbit is switched by the toggle "Broucke orbit" and is drawn whole in the colormap of the frame (viridis, blues, and plasma), under a comet trail with a yellow head. The slider of $e$ takes 24 values at $\mu = 0.5$ (0 to 0.44 in steps of 0.02, and 0.453, the last member of the branch) and 26 values at $\mu = 0.012155$ (0 to 0.5 in steps of 0.02). Every value has an orbit, and every orbit closes after $K = 1$ forcing period. The clock is a fraction clock over the channels $\theta$ and $t$, 480 frames a loop, switched in the transport. The caption gives $e$, $\theta$, $t$, $\rho(\theta)$, $K$, $\mu$, and the family.

An invisible diagonal of a box is also drawn in every view, in the frame of the view. In the rotating and the inertial views, the box is a square of half side 2.25 DU, which is large enough for the grid at apoapsis for $e = 0.5$. The cameras of these two panels are thus fitted to the same box at every $e$, for both mass ratios, and with the orbit on or off. Nothing is scaled in the pulsating view, hence I fitted its box per mass ratio to the grid and to every orbit of the tab, and the pulsating panel is drawn at a larger scale than the other two. The layout of two panels over one suits the zones of the deck in `theme/beeson.css`, i.e. 600 by 800 and 920 by 800 CSS pixels. In the zone of 600 by 800 pixels on slide 7, at $\mu = 0.012155$, I measured about 80 pixels per DU in the pulsating panel and about 60 in the rotating panel. In a landscape zone of 1100 by 600 pixels, the same layout is drawn at about 37 pixels per DU in the rotating and the inertial panels, and a row of three panels would double this.

At $\mu = 0.012155$ the labels of $\mathcal{L}_1$, $m_2$, and $\mathcal{L}_2$ overlap at the zone sizes, since these bodies are 0.15 DU apart. I kept the label of $m_2$, because the visibility of a tycho layer can be bound to a toggle but not to a tab. The speaker notes of slide 7 tell the presenter to zoom in on $m_2$ with the scroll wheel and to press F to fit the panels again.

## Checks

I ran `check.py` on the files as written, and every check passed.

| Check | Largest error | Tolerance |
|---|---|---|
| Quintic residual of $\mathcal{L}_1$, $\mathcal{L}_2$, and $\mathcal{L}_3$ | $8.9 \times 10^{-16}$ | $10^{-12}$ |
| Gradient of the effective potential at $\mathcal{L}_1$ to $\mathcal{L}_5$ | $8.3 \times 10^{-16}$ | $10^{-12}$ |
| Driver $\theta$ and $t$ at the first and last sample against 0 and $2\pi K$ | 0 | $10^{-12}$ |
| Driver $\rho$ against $(1 - e^2)/(1 + e\cos\theta)$ | 0 | $10^{-12}$ |
| Driver $\theta$ against Kepler's equation solved for the stored $t$ | $2.7 \times 10^{-15}$ | $10^{-12}$ |
| Orbit $\theta$ and $t$ (float32) at the first and last sample against 0 and $2\pi K$ | $1.8 \times 10^{-7}$ | $4 \times 10^{-6}$ |
| Orbit $\theta$ (float32) against Kepler's equation solved for the stored $t$ | $9.4 \times 10^{-7}$ | $4 \times 10^{-6}$ |
| Bodies in the pulsating panel against their stored positions | $2.2 \times 10^{-16}$ | $10^{-12}$ |
| Radius in the rotating panel against $\rho$ times the radius in the pulsating panel | $2.2 \times 10^{-16}$ | $10^{-12}$ |
| Bodies in the inertial panel against the two driver samples turned, scaled, and blended | $6.9 \times 10^{-16}$ | $10^{-12}$ |

The panel checks were made with pytycho's evaluator on 72 states, i.e. both mass ratios, the first, middle, and last $e$ of each, both clock channels, and six frame indices. The radius in the rotating panel is compared with $\rho$ blended between the two driver samples around the reading, as the runtime blends it, which differs from the formula at the blended $\theta$ by at most $1.1 \times 10^{-5}$. In the inertial panel, the runtime blends the two turned samples along a chord (rule C4 of the scene spec), hence a body is drawn up to $4.7 \times 10^{-5}$ DU inside its ellipse, which is far below a pixel.

The page `frames.html` is 1.34 MB, within its budget of 1.5 MB, with `frames.tyd` at 456 kB and `frames.tys` at 21 kB. I loaded the page in headless Chrome, set the variables and the clock through the viewer's store, played it on both clock channels, and took the screenshots in `shots/`, and the page did not print any console error or warning. The screenshots are at 920 by 800 pixels unless the name gives another size, at $\theta = 2.62$ (frame 200 of 480).

| Screenshot | Mass ratio | $e$ | Orbit |
|---|---|---|---|
| `shots/e0.png` | 0.5 | 0 | off |
| `shots/e0.24.png` | 0.5 | 0.24 | off |
| `shots/e0.453.png` | 0.5 | 0.453 | off |
| `shots/e0.24-orbit.png` | 0.5 | 0.24 | on |
| `shots/e0.24-orbit-earth-moon.png` | 0.012155 | 0.24 | on |
| `shots/e0.24-orbit-1100x600.png` | 0.5 | 0.24 | on |
| `shots/e0.24-orbit-600x800.png` | 0.5 | 0.24 | on |
