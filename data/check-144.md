# Check of the reproduction against Broucke 1969

Each of the 144 orbit panels of Broucke's Figs. 13 to 20 is consistent with a reproduced member in the frame assigned to it. A reflection or an exchange of the primary and the secondary is not needed for any panel, and every statement on stability in his text holds for the reproduced families.

| Branch | Figure | Barycentric | Rotating | Pulsating | Geocentric | Selenocentric | Panels | Good | Partial |
|---|---|---|---|---|---|---|---|---|---|
| 7P | 13 | 2 | 2 | 2 | 0 | 2 | 8 | 7 | 1 |
| 7A | 14 | 2 | 9 | 4 | 0 | 9 | 24 | 21 | 3 |
| 8P | 16 | 9 | 5 | 4 | 8 | 11 | 37 | 22 | 15 |
| 8A | 17 | 2 | 2 | 3 | 3 | 6 | 16 | 15 | 1 |
| 11P | 19 | 3 | 5 | 5 | 2 | 3 | 18 | 18 | 0 |
| 11A | 20 | 4 | 9 | 6 | 7 | 15 | 41 | 41 | 0 |
| All | | 22 | 32 | 24 | 20 | 46 | 144 | 124 | 20 |

The source of the counts is the panel-by-panel matching of the DYLAN-504 investigation, in `.claude/broucke_1969_investigation/` of the dylan-core checkout (`REPORT.md` and `workflow_outputs/matching_*_journal_results.json`). I recounted the panels, the frames, and the verdicts from these result files and did not redo the matching. The five frames are those of Broucke's plotting program, i.e. the barycentric inertial frame, the rotating frame, the rotating-pulsating frame, and the inertial frames centered on the primary (geocentric) and on the secondary (selenocentric). A panel is good when its topology and its extents agree with the reproduced member of closest $e$. A panel is partial when a member close to the printed $e$ was not in the gallery used for the matching, so that only the trend toward it could be compared. For 11A, the counts are those of a second run with a gallery up to $e = 0.88$, in which all 41 panels are good, against 33 good and 8 partial in the first run. In addition, the tick labels of five panels are off by a factor of ten, as listed in `REPORT.md`.

| Branch | Broucke's text | Reproduction |
|---|---|---|
| 7P | Unstable, in $\mathcal{EH}^+$ up to $e = 0.35$, and very close to the line $a_2 = -2a_1 - 2$ | In $\mathcal{EH}^+$ up to $e = 0.465$, within 0.018 in $a_2$ of the line up to $e = 0.35$ |
| 7A | Stable, in $\mathcal E^2$ below $e = 0.75$, and approaching $(-4, 6)$ as $e$ grows | In $\mathcal E^2$ from $e = 0.005$ to 0.975, with the distance to $(-4, 6)$ decreasing from 2.37 to 0.39 |
| 8P | Unstable, in $\mathcal{EH}^+$ up to $e = 0.55$ | In $\mathcal{EH}^+$ up to $e = 0.675$, in $\mathcal H^{-+}$ from 0.6768 |
| 8A | In $\mathcal H^{++}$, then in $\mathcal N$ near $e = 0.30$, and in $\mathcal E^2$ at $e = 0.85$, just past the parabola | In $\mathcal N$ from $e = 0.2894$, in $\mathcal E^2$ from 0.8470, with $a_2 = 2.036$ at 0.85 against 2.144 on the parabola |
| 11P | $a_1$ from $-5000$ to $-200$, and $a_2$ largest, about 13,400, near $e = 0.18$ | $a_1$ from $-4918.9$ at $e = 0$ to $-252.5$ at 0.453, $a_2$ largest, 13,348.8, at 0.165 |
| 11A | In $\mathcal{EH}^+$ up to $e = 0.30$, in $\mathcal H^{-+}$ from 0.30 to 0.80, and $a_1$ smallest, $-5500$, at 0.18 | In $\mathcal{EH}^+$ up to $e = 0.2946$, in $\mathcal H^{-+}$ to 0.8425, $a_1$ smallest, $-5621.2$, at 0.1625 |

The statements of Broucke are from Section VI of his JPL Technical Report 32-1360. I took them from the vault note `DYLAN-504-changes.md` and checked each against the OCR of the report, `broucke_report.txt`, in the same investigation folder. I computed the values of the reproduction from `data/stability/` on `vestini/master` of dylan-core. Two numbers of the vault note are out of date: $a_1$ at $e = 0.453$ on 11P is $-252.5$, not $-178$, and the smallest $a_2$ on 11A is $-50{,}929.1$ at $e = 0.655$, not $-50{,}925$.
