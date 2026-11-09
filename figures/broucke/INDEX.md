# Broucke's figures of families 7, 8, and 11

I cut these figures at 300 dpi out of two of Broucke's papers with `figures/crop_broucke.py`. The AIAA paper is R. Broucke, "Stability of periodic orbits in the elliptic, restricted three-body problem", AIAA Journal 7(6), 1003–1009 (1969). The report is R. Broucke, "Periodic orbits in the elliptic restricted three-body problem", Jet Propulsion Laboratory (JPL) Technical Report 32-1360 (1969). Both PDFs are in `/Users/claudiovestini/vault/_support/_pdfs/_articles/`, and the pages below are pages of the PDF. In his 1968 report (JPL Technical Report 32-1168) the families of the circular problem are named by letters, and families 7, 8, and 11 are not drawn in it.

Broucke drew each orbit figure of the report as runs of panels, one run per coordinate frame, and each run starts again at a low eccentricity $e$. A figure is spread over several pages, and a run may be cut at a page break. He labeled every axis x, y and wrote only the eccentricity in each panel. I thus identified the frame of each panel by its shape, against the DyLAN orbits of the same branch in the five frames, and by the order of his runs. In the report the runs are given in the order barycentric inertial, rotating, rotating-pulsating, inertial centered on the primary $m_1$ (his "geocentric"), and inertial centered on the secondary $m_2$ (his "selenocentric"). The frame names in the file names are those of the DyLAN figures:

- `inertial` is the barycentric inertial frame,
- `rotating` is the rotating frame $(\xi, \eta)$,
- `pulsating` is the rotating-pulsating frame $(x, y)$,
- `inertial-m1` and `inertial-m2` are the inertial frames centered on $m_1$ and on $m_2$, respectively.

In each `family-<N>-<branch>-<frame>-fig-<M>.png` file I collected the panels of one frame of Fig. M from all its pages, ordered by eccentricity in a grid of equal cells. The panels themselves are unchanged, with his tick labels and his labels of $e$. The whole pages, with the caption, are in `pages/` (e.g. `pages/fig-16b.png` for the second page of Fig. 16).

| File | Paper, PDF page | Fig. | Branch | Frame | Eccentricities drawn | Caption |
|---|---|---|---|---|---|---|
| `aiaa-fig-3.png` | AIAA, 6 (journal p. 1008) | 3 | 8P and 8A | the $(a_1, a_2)$ plane | 0.0, .20, .25 (periapsis), .30, .50, .85 (apoapsis) | Family 8 of periodic orbits. |
| `aiaa-fig-4.png` | AIAA, 7 (journal p. 1009) | 4 | 11P and 11A | the $(a_1, a_2)$ plane | 0.0, 0.20, 0.45 (periapsis), 0.30, 0.50, 0.70, 0.80 (apoapsis) | Family 11 of periodic orbits. |
| `aiaa-quote-family-7.png` | AIAA, 6 (journal p. 1008) | none | 7P and 7A | none | none | the paragraph on family 7, with the sentence "However, they are all very close to the line a2 = −2a1 − 2 in this diagram." highlighted |
| `aiaa-quote-divergence.png` | AIAA, 7 (journal p. 1009) | none | 11P | none | none | the paragraph on family 11, with the sentence on the divergence at e = 0.454 highlighted |
| `family-7-periapsis-inertial-fig-13.png` | report, 58 | 13 | 7P | inertial, see below | not labeled, two panels | Family 7P of periodic orbits |
| `family-7-periapsis-rotating-fig-13.png` | report, 58 | 13 | 7P | rotating, see below | not labeled, two panels | same |
| `family-7-periapsis-pulsating-fig-13.png` | report, 58 | 13 | 7P | pulsating, see below | not labeled, two panels | same |
| `family-7-periapsis-inertial-m2-fig-13.png` | report, 58 | 13 | 7P | inertial-m2 | not labeled, two panels | same |
| `family-7-apoapsis-inertial-fig-14.png` | report, 62 | 14 | 7A | inertial | 0.0, 0.95 | Family 7A of periodic orbits |
| `family-7-apoapsis-rotating-fig-14.png` | report, 62 | 14 | 7A | rotating | 0.0, 0.25, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.975 | same |
| `family-7-apoapsis-pulsating-fig-14.png` | report, 62 | 14 | 7A | pulsating | 0.0, 0.40, 0.80, 0.975 | same |
| `family-7-apoapsis-inertial-m2-fig-14.png` | report, 62–63 | 14 | 7A | inertial-m2 | 0.0, 0.25, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.975 | same |
| `family-8-stability-fig-15.png` | report, 66 | 15 | 8P and 8A | the $(a_1, a_2)$ plane | 0.0, 0.20, 0.25 (periapsis), 0.30, 0.50, 0.85 (apoapsis) | Family 8 of periodic orbits |
| `family-8-periapsis-inertial-fig-16.png` | report, 67 | 16 | 8P | inertial | 0.0, 0.30, 0.50, 0.55, 0.60, 0.69, 0.80, 0.90, 0.975 | Family 8P of periodic orbits |
| `family-8-periapsis-rotating-fig-16.png` | report, 67–68 | 16 | 8P | rotating | 0.0, 0.50, 0.80, 0.90, 0.975 | same |
| `family-8-periapsis-pulsating-fig-16.png` | report, 68 | 16 | 8P | pulsating | 0.0, 0.80, 0.90, 0.975 | same |
| `family-8-periapsis-inertial-m1-fig-16.png` | report, 68–69 | 16 | 8P | inertial-m1 | 0.0, 0.50, 0.80, 0.875, 0.90, 0.925, 0.96, 0.975 | same |
| `family-8-periapsis-inertial-m2-fig-16.png` | report, 69–70 | 16 | 8P | inertial-m2 | 0.0, 0.10, 0.20, 0.25, 0.35, 0.50, 0.65, 0.80, 0.90, 0.95, 0.975 | same |
| `family-8-apoapsis-inertial-fig-17.png` | report, 73 | 17 | 8A | inertial | 0.0, 0.85 | Family 8A of periodic orbits |
| `family-8-apoapsis-rotating-fig-17.png` | report, 73 | 17 | 8A | rotating | 0.0, 0.60, 0.85 | same |
| `family-8-apoapsis-pulsating-fig-17.png` | report, 73 | 17 | 8A | pulsating | 0.05, 0.80 | same |
| `family-8-apoapsis-inertial-m1-fig-17.png` | report, 73–74 | 17 | 8A | inertial-m1 | 0.0, 0.5, 0.85 | same |
| `family-8-apoapsis-inertial-m2-fig-17.png` | report, 74–75 | 17 | 8A | inertial-m2 | 0.05, 0.25, 0.40, 0.50, 0.60, 0.85 | same |
| `family-11-stability-fig-18.png` | report, 78 | 18 | 11P and 11A | the $(a_1, a_2)$ plane | 0.0, 0.20, 0.45 (periapsis), 0.30, 0.50, 0.70, 0.80 (apoapsis) | Family 11 of periodic orbits |
| `family-11-periapsis-inertial-fig-19.png` | report, 79 | 19 | 11P | inertial | 0.0, 0.36, 0.453 | Family 11P of periodic orbits |
| `family-11-periapsis-rotating-fig-19.png` | report, 79 | 19 | 11P | rotating | 0.0, 0.18, 0.24, 0.30, 0.453 | same |
| `family-11-periapsis-pulsating-fig-19.png` | report, 79–80 | 19 | 11P | pulsating | 0.0, 0.18, 0.24, 0.30, 0.453 | same |
| `family-11-periapsis-inertial-m1-fig-19.png` | report, 80 | 19 | 11P | inertial-m1 | 0.0, 0.453 | same |
| `family-11-periapsis-inertial-m2-fig-19.png` | report, 80 | 19 | 11P | inertial-m2 | 0.0, 0.30, 0.453 | same |
| `family-11-apoapsis-inertial-fig-20.png` | report, 82 | 20 | 11A | inertial | 0.0, 0.50, 0.75, 0.88 | Family 11A of periodic orbits |
| `family-11-apoapsis-rotating-fig-20.png` | report, 82–83 | 20 | 11A | rotating | 0.0, 0.30, 0.4, 0.5, 0.6, 0.70, 0.75, 0.80, 0.88 | same |
| `family-11-apoapsis-pulsating-fig-20.png` | report, 83 | 20 | 11A | pulsating | 0.0, 0.15, 0.30, 0.5, 0.70, 0.88 | same |
| `family-11-apoapsis-inertial-m1-fig-20.png` | report, 83–84 | 20 | 11A | inertial-m1 | 0.0, 0.40, 0.5, 0.6, 0.75, 0.85, 0.88 | same |
| `family-11-apoapsis-inertial-m2-fig-20.png` | report, 84–85 | 20 | 11A | inertial-m2 | 0.0, 0.15, 0.20, 0.25, 0.35, 0.40, 0.45, 0.60, 0.65, 0.70, 0.75, 0.80, 0.86, 0.87, 0.88 | same |

I wrote the eccentricities as he wrote them, hence 0.4 and 0.40 both appear. The two `aiaa-quote-` files are cuts of the text of the AIAA paper, with each quoted sentence marked by a PDF highlight in `quotes` of `figures/crop_broucke.py`, and they are shown on the slides as images rather than retyped.

## Where I was unsure

1. In Fig. 13 (family 7P) Broucke did not label any panel with $e$, and he wrote "μ = 0.012155" on the two top panels instead. I read its eight panels as two panels in each of four frames, and I kept each pair in reading order. The two top panels are loops around x ≈ −1, like the DyLAN orbits in the inertial frame centered on $m_2$. The first two panels of the middle row are ovals, either barycentric inertial or centered on $m_1$. These two frames differ only by a shift of the mass ratio $\mu$ at the Earth–Moon value, and I called the ovals barycentric as in Fig. 14. The other four panels are kidneys, which I matched by shape to the DyLAN orbits. The two kidneys whose dimple is a smooth S across the y axis are the last of the middle row and the middle of the bottom row, and I put them in the rotating-pulsating frame. The two whose dimple is a cusp at the origin are the first and the last of the bottom row, and I put them in the rotating frame. Broucke did not follow the order of runs in Fig. 13.
2. For the same reason the two inertial panels of Fig. 14 ($\mu$ = 0.012155) may be centered on $m_1$ rather than on the barycenter. In Fig. 14 Broucke drew only these two inertial panels and runs in three other frames, hence I followed the order of runs and called them barycentric.
3. At $e = 0$ the rotating and the rotating-pulsating frames coincide. On the first page of Fig. 17 a kidney at e = 0.0 is placed between the two runs, and I put it in the rotating run, with e = 0.60 and 0.85. The lowest eccentricity of the pulsating run is thus 0.05. The panels on this page are not in the order of $e$ or of the runs, hence the order in the composites is mine.
4. In Fig. 16 (family 8P) I told the rotating run from the rotating-pulsating run by the order of runs. I confirmed the split by shape and by size against the DyLAN orbits of the branch, drawn up to e = 0.97. In the rotating run the kidney becomes an oval at high $e$, whose right end is at x = 2.26 at e = 0.805 in DyLAN and at about 2.25 at e = 0.80 in his panel. In the pulsating run the orbit remains a kidney, whose top is at y = 1.32 at e = 0.91 in DyLAN and at about 1.34 at e = 0.90 in his panel. In the other figures I checked the same split against the DyLAN orbits: in the rotating frame the dimple of an apoapsis orbit becomes deeper with $e$, and in the rotating-pulsating frame the orbit becomes larger.
5. Fig. 16 shows family 8P up to e = 0.975, whereas in his text Broucke gives about 120 orbits from e = 0.0 to 0.875 for this family (the OCR text reads "8B").
6. A few of his tick labels are off by a factor of ten against the size of the curve. Examples are the "0.2" of the pulsating panel at e = 0.80 in Fig. 17 and the "1.0" of the pulsating panel at e = 0.975 in Fig. 14. The right end of the curve of this panel is at 6.8 of his units, against x = 66 for the DyLAN member at the same $e$. Several inertial panels are scaled differently in x and y, e.g. those of Figs. 13 and 16.
7. The $a_1$ axis of the AIAA Fig. 4 is labeled from −60000 to 40000, whereas the same curves are drawn over −8000 to 8000 in Fig. 18 of the report. In the AIAA text Broucke gives $a_1 = -5500$ as the minimum of family 11A. The AIAA axis is thus mislabelled by a factor of ten. I added Figs. 15 and 18 of the report, the stability diagrams of families 8 and 11, for this comparison. The $a_1$ axis of the AIAA Fig. 3, of family 8, is labeled at the scale of the curves. Broucke did not draw family 7 in the $(a_1, a_2)$ plane in either paper, and he wrote in the report that its orbits are all very close to the line $a_2 = -2a_1 - 2$.
