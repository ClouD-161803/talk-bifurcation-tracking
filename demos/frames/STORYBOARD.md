# Storyboard of the frames scene

The frames scene is the demo of slides 6 and 7 of the teacher outline in `plan/outlines.md`, "Let the primaries move on an ellipse" and "A potential that breathes". It shows the elliptic restricted three-body problem (ER3BP) in three frames at once, so that the audience can see what changes once the primary and the secondary move on ellipses. Each step below has one line on what the presenter does and one line per panel on what the audience sees, written to be read as speaker notes.

The deck of `plan/briefs/F-deck.md` reorders the two outline slides into three ER3BP slides, i.e. the equations of motion (deck slide 6), the pulsating coordinates with this scene in the zone (deck slide 7), and the consequences (deck slide 8). Slide 6 below then maps to deck slide 7, steps 1 and 2 of slide 7 below to deck slide 6, and steps 3 to 6 of slide 7 below to deck slide 8. The steps of slide 7 that use the scene are run in the zone of deck slide 7 unless the scene is embedded on deck slide 8 as well.

## The page

The rotating-pulsating frame $(x, y)$ is drawn in the top left panel, the rotating frame $(\xi, \eta)$ in the top right panel, and the barycentric inertial frame $(X, Y)$ in the bottom panel. The rotating frame is the pulsating frame scaled by the separation of the primary and the secondary, which is given by
$$
\rho(\theta) = \frac{1 - e^2}{1 + e\cos\theta},
$$
where $e$ is the eccentricity of their orbit and $\theta$ is the true anomaly. The inertial frame is the rotating frame turned by $\theta$. Lengths are in DU, the semi-major axis of the relative orbit of the primary and the secondary, and times are in TU, so that one forcing period is $2\pi$ TU long.

The rotating and the inertial panels are fitted to one square box, 4.5 DU on a side, at every $e$, so that the audience can compare lengths across the eccentricities and between these two panels. The pulsating panel is fitted to a tighter box for each mass ratio, around the grid and every orbit of the tab, since nothing is scaled in this frame. In each panel the audience sees the primary $m_1$, the secondary $m_2$, and the five libration points $\mathcal{L}_1$ to $\mathcal{L}_5$, each with its trail. Behind them is a dim grid of straight lines of the pulsating frame, 0.25 DU apart inside a circle of radius 1.5 DU. The grid is drawn in one neutral gray in all three panels, so that it is not confused with the orbit. The orbit is colored by $e$ in the colormap of the frame of its panel (viridis, blues, and plasma, as on the Broucke page), with a colorbar of $e$ beside it. A zero-velocity curve is not drawn, since the ER3BP does not have a Jacobi integral.

The presenter works the scene with the tabs of the mass ratio $\mu$, the slider of $e$, the orbit switch labeled "Broucke orbit", and the transport, whose switch moves the clock between the true anomaly $\theta$ and the time $t$. The caption below the panels gives $e$, $\theta$, $t$, $\rho(\theta)$, the number $K$ of forcing periods after which the orbit closes, $\mu$, and the Broucke family of the orbit. In the deck the scene is embedded on slide 7 as a kiosk viewer without these controls, and the presenter works it with the keys given in the speaker notes of the slide.

The scene is loaded at $\mu = 0.5$ and $e = 0$, with the orbit off and the clock on $\theta$. At $\mu = 0.5$ the primary and the secondary have equal masses and lie at $x = -0.5$ and $x = 0.5$, respectively. The point $\mathcal{L}_1$ is then at the barycenter, $\mathcal{L}_2$ and $\mathcal{L}_3$ are mirror images at $x = 1.198$ and $x = -1.198$, respectively, and $\mathcal{L}_4$ and $\mathcal{L}_5$ are at $(0, \pm\sqrt{3}/2)$.

The second tab sets $\mu = 0.012155$, the Earth–Moon value at which Broucke continued family 7. There $\mathcal{L}_1$ and $\mathcal{L}_2$ are on either side of $m_2$, at $x = 0.837$ and $x = 1.156$, respectively, $\mathcal{L}_3$ is at $x = -1.005$, and $\mathcal{L}_4$ and $\mathcal{L}_5$ are at $(0.488, \pm 0.866)$. With the orbit switch on, the audience sees the periapsis member of family 11 at $\mu = 0.5$ and the periapsis member of family 7 at $\mu = 0.012155$, since these are the families of the Broucke data at the two mass ratios. Both close after one forcing period, $K = 1$, at every $e$.

## Slide 6, "Let the primaries move on an ellipse"

1. The first sentence, on the Kepler ellipse of eccentricity $e$, is shown.
   - The presenter plays the scene at $\mu = 0.5$ and $e = 0$, with the clock on $\theta$.
   - In the pulsating panel, the audience sees $m_1$, $m_2$, and the five $\mathcal{L}_i$ at rest on a grid that is at rest too.
   - In the rotating panel, the audience sees the picture of the pulsating panel again, since $\rho(\theta) = 1$ at every $\theta$ when $e = 0$.
   - In the inertial panel, the audience sees the grid turn at a constant rate, and $m_1$, $m_2$, and $\mathcal{L}_2$ to $\mathcal{L}_5$ move on circles about the barycenter, while $\mathcal{L}_1$ is at rest at the barycenter.
2. The display of $\rho(\theta)$ is shown.
   - The presenter points at the caption, where $\rho(\theta) = 1$ is read at every $\theta$ while $e = 0$.
   - In all three panels, the audience sees the motion of step 1.
3. The second sentence, on dividing by $\rho(\theta)$, is shown.
   - The presenter points at the two top panels and says that the pulsating panel is the rotating panel divided by $\rho(\theta)$.
   - In the pulsating and the rotating panels, the audience still sees one picture twice, since $e = 0$.
   - In the inertial panel, the audience sees the rotating panel turned by $\theta$.
4. The display $(\xi, \eta) = \rho(\theta)\,(x, y)$ is shown.
   - The presenter reads the display as the map from the top left panel to the top right panel.
   - In all three panels, the audience sees the motion of step 1.
5. The demo is run.
   - The presenter drags the slider slowly from $e = 0$ to its largest value, $e = 0.453$, and lets one forcing period play.
   - In the pulsating panel, the audience sees $m_1$, $m_2$, the $\mathcal{L}_i$, and the grid at rest at every $e$, since a change of $e$ is not seen in this frame.
   - In the rotating panel, the audience sees the grid breathe about the barycenter, from $1 - e$ times its size at periapsis, $\theta = 0$, to $1 + e$ times its size at apoapsis, $\theta = \pi$. The bodies are carried in and out along their rays from the barycenter, and their trails are drawn as segments of these rays.
   - In the inertial panel, the audience sees the grid breathe and turn at once. The audience also sees the primary and the secondary trace ellipses of eccentricity $e$ with a focus at the barycenter, and $\mathcal{L}_2$ to $\mathcal{L}_5$ trace ellipses of the same shape, larger for the points farther out.

## Slide 7, "A potential that breathes"

1. The first sentence, on $\theta$ as the clock, is shown.
   - The presenter leaves $e$ at its largest value, switches the clock from $\theta$ to $t$ with the switch of the transport, lets one forcing period play, and switches back to $\theta$.
   - In the pulsating panel, the audience sees the bodies at rest, and reads in the caption that $\theta$ and $t$ advance at different rates.
   - In the rotating panel, on $t$, the audience sees the grid rush through periapsis and linger near apoapsis.
   - In the inertial panel, on $t$, the audience sees $m_1$ and $m_2$ speed up near periapsis and slow down near apoapsis, as Kepler's second law requires. Back on $\theta$, the audience sees a turn at a constant rate again, which is why $\theta$ is taken as the independent variable of the equations of motion.
2. The equations of motion in $(x, y)$ are shown, with the factor $1/(1 + e\cos\theta)$ on the gradient of $\tilde{U}$.
   - The presenter leaves the clock on $\theta$ and lets the scene play.
   - In all three panels, the audience sees the motion of step 5 of slide 6.
3. The sentence on the $\mathcal{L}_i$ is shown.
   - The presenter drags $e$ down to 0 and back up while pointing at the libration points.
   - In the pulsating panel, the audience sees the $\mathcal{L}_i$ at rest at every $e$, since the factor $1/(1 + e\cos\theta)$ does not change the zeros of the gradient of $\tilde{U}$.
   - In the rotating panel, the audience sees each $\mathcal{L}_i$ slide along its ray between $1 - e$ and $1 + e$ times its distance from the barycenter in the pulsating panel, and $\mathcal{L}_1$ at rest at the barycenter.
   - In the inertial panel, the audience sees each $\mathcal{L}_i$ other than $\mathcal{L}_1$ trace an ellipse of eccentricity $e$. The triangles of $m_1$, $m_2$, and $\mathcal{L}_4$ or $\mathcal{L}_5$ are equilateral at every $\theta$, while they grow, shrink, and turn.
4. The sentence on the loss of $C$ is shown.
   - The presenter leaves the controls alone.
   - In all three panels, the audience sees the motion of step 3, and a zero-velocity curve is not drawn in any of them.
5. The demo is run, with the highlight that an orbit must close after $2\pi K$ in $\theta$.
   - The presenter sets $e$ to about 0.24 and switches the orbit on.
   - In the pulsating panel, the audience sees the periapsis member of family 11 at this $e$ as a figure eight that crosses itself between $\mathcal{L}_1$ and $m_2$, with one lobe about $\mathcal{L}_1$ and the other about $m_2$. A yellow head with a glowing trail goes once around the figure eight while $\theta$ runs from 0 to $2\pi$, and the caption gives $K = 1$.
   - In the rotating panel, the audience sees the same orbit with each sample scaled by $\rho(\theta)$ at its own $\theta$, hence distorted, and closed after the same forcing period.
   - In the inertial panel, the audience sees the orbit close as well, since the primary and the secondary are back at periapsis after one forcing period.
6. Family 7, which the outline names for this demo, is shown.
   - The presenter switches the mass ratio to $\mu = 0.012155$ and leaves the orbit on, to show the member of family 7 at the same $e$.
   - In the pulsating panel, the audience sees $\mathcal{L}_1$ and $\mathcal{L}_2$ close to $m_2$, and a kidney-shaped loop about $m_2$ whose notch passes close to $m_1$.
   - In the rotating panel, the audience sees the loop breathe with $\rho(\theta)$, as the grid does.
   - In the inertial panel, the audience sees the loop as an oval about 2 DU long, with one end next to $m_1$ and the barycenter, closed after one forcing period.

At $\mu = 0.012155$ the labels of $\mathcal{L}_1$, $m_2$, and $\mathcal{L}_2$ overlap at the size of a slide zone, unless the presenter zooms in on $m_2$. I kept the label of $m_2$, and the speaker notes of slide 7 tell the presenter to zoom in on $m_2$ with the scroll wheel.
