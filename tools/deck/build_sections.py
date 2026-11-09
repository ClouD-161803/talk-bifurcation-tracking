"""Write the comparison slide of the orbits, the slide of the three families in Broucke's diagram, the
PyDyLAN code block, and the backup tables into the deck source.

Run it as `python3 build_sections.py <talk folder> <deck>`, where the deck is index.html of the talk
folder. The figures, the calls, and the table of the check are read from the talk folder, and each
block replaces the one between its two marker comments in the deck.
"""

import html
import re
import sys
from pathlib import Path

FRAMES = [
    ("pulsating", "the rotating-pulsating frame"),
    ("rotating", "the rotating frame"),
    ("inertial", "the barycentric inertial frame"),
    ("inertial-m1", "the inertial frame about the primary"),
    ("inertial-m2", "the inertial frame about the secondary"),
]
BRANCHES = [
    (7, "periapsis", 13, r"Family 7 from periapsis, at \(\mu = 0.012155\). One index reaches \(k = -2\) at \(e = 0.468\)."),
    (7, "apoapsis", 14, r"Family 7 from apoapsis, at \(\mu = 0.012155\). It is in \(\mathcal E^2\), i.e. stable, for \(e \in [0.005, 0.975]\)."),
    (8, "periapsis", 16, r"Family 8 from periapsis, at \(\mu = 0.5\). One index reaches \(k = -2\) at \(e = 0.677\)."),
    (8, "apoapsis", 17, r"Family 8 from apoapsis, at \(\mu = 0.5\). It enters \(\mathcal N\) at \(e = 0.289\), and \(\mathcal E^2\) at \(e = 0.847\)."),
    (11, "periapsis", 19, r"Family 11 from periapsis, at \(\mu = 0.5\). It is in \(\mathcal H^{++}\) up to the fold at \(e = 0.453865\)."),
    (
        11,
        "apoapsis",
        20,
        r"Family 11 from apoapsis, at \(\mu = 0.5\). One index reaches \(k = -2\) at \(e = 0.295\), and it enters \(\mathcal{EH}^-\) and \(\mathcal H^{--}\) past \(e = 0.84\).",
    ),
]
COMPARISON_NOTES = """  <aside class="notes">
    <p>Step 0: First the orbits themselves, one branch per click. On top are my members in the five frames of the Broucke page, and under each of my frames are Broucke's panels in the same frame. Family 7 from periapsis is at the Earth–Moon mass ratio, with the two panels of Fig. 13 of his JPL report under each frame. He did not label them with e, and he did not draw this branch about the primary. The family is unstable, and one index reaches −2 at e = 0.468, past the members drawn here, which end at e = 0.35.</p>
    <p>Step 1: Family 7 from apoapsis, stable from e = 0.005 to e = 0.975, with Fig. 14. He did not draw this branch about the primary either.</p>
    <p>Step 2: Family 8 from periapsis, at a mass ratio of one half, with Fig. 16. One index reaches −2 at e = 0.677. My members go up to e = 0.97, one step short of his last panel, since my member at 0.975 is not converged.</p>
    <p>Step 3: Family 8 from apoapsis, with Fig. 17. It crosses the parabola into N at e = 0.289, and it is stable from e = 0.847 to its last member at 0.85.</p>
    <p>Step 4: Family 11 from periapsis, up to the fold, with Fig. 19.</p>
    <p>Step 5: Family 11 from apoapsis, with Fig. 20. One index reaches −2 at e = 0.295, the period-doubling I come back to in a few slides, and three more crossings follow past e = 0.84, into EH⁻, H⁻⁻, and EH⁻ again, on the last members drawn here, which end at e = 0.88, as his do.</p>
    <p>Step 6: So every branch is consistent with Broucke's figures, in each frame in which he drew one. Next, the same families as curves in Broucke's diagram.</p>
    <p>TODO(claudio): the frames of a few of Broucke's panels were identified by their shape, in Figs. 13, 14, 16, and 17, as listed under "Where I was unsure" in figures/broucke/INDEX.md.</p>
  </aside>"""
# (family, the cells of Broucke's figures, caption), one group per step of the diagram slide. A cell is the
# path and alt text of a crop, or the text of a placeholder over the two cells of Broucke's figures
DIAGRAMS = [
    (
        7,
        r"Broucke did not draw family 7 in the diagram. He wrote that its orbits are &ldquo;all very close to the line \(a_2 = -2a_1 - 2\)&rdquo;.",
        r"Family 7 at \(\mu = 0.012155\) in DyLAN. Both branches stay near the line \(k = 2\), as Broucke wrote.",
    ),
    (
        8,
        [
            ("figures/broucke/aiaa-fig-3.png", "Broucke, AIAA Fig. 3, family 8 in the a1, a2 plane"),
            ("figures/broucke/family-8-stability-fig-15.png", "Broucke, report Fig. 15, family 8 in the a1, a2 plane"),
        ],
        r"Family 8 at \(\mu = 0.5\) in Broucke&rsquo;s Figs. 3 and 15, and in DyLAN.",
    ),
    (
        11,
        [
            ("figures/broucke/aiaa-fig-4.png", "Broucke, AIAA Fig. 4, family 11 in the a1, a2 plane"),
            ("figures/broucke/family-11-stability-fig-18.png", "Broucke, report Fig. 18, family 11 in the a1, a2 plane"),
        ],
        r"Family 11 at \(\mu = 0.5\) in Broucke&rsquo;s Figs. 4 and 18, and in DyLAN. The \(a_1\) labels of Fig. 4 are ten times too large.",
    ),
]
DIAGRAM_NOTES = """  <aside class="notes">
    <p>Step 0: The three families as curves in Broucke's diagram, on linear axes, one family per click, with Broucke's figures at left and DyLAN at right. Family 7, at the Earth–Moon mass ratio, is the one he did not draw in the diagram. He wrote only that its orbits are all very close to the line a₂ = −2a₁ − 2, i.e. k = 2, and in DyLAN both branches indeed stay near this line.</p>
    <p>Step 1: Family 8, at a mass ratio of one half, in Fig. 3 of the AIAA paper and Fig. 15 of his JPL report. The branch from periapsis rises into EH⁺, and the branch from apoapsis crosses the parabola into N at e = 0.289, as in his figures.</p>
    <p>Step 2: Family 11, in Fig. 4 of the AIAA paper and Fig. 18 of the report. The curves agree, but the a₁ axis of Fig. 4 is labeled ten times too large. In DyLAN, a₁ goes from −4918.9 to −252.5 on the branch from periapsis, up to e = 0.453.</p>
    <p>Step 3: So DyLAN draws Broucke's curves. Next, what is changed where a curve meets k = 2 or k = −2.</p>
  </aside>"""


def mode_images(stem: str, alt: str) -> str:
    return (
        f'<img class="for-dark" src="{stem}-dark.png" alt="{alt}">'
        f'<img class="for-light" src="{stem}-light.png" alt="{alt}">'
    )


def paper_image(path: str, alt: str) -> str:
    return f'<img class="paper" src="{path}" alt="{alt}">'


def placeholder(text: str, span: int = 1) -> str:
    style = f' style="grid-column: span {span}"' if span > 1 else ""
    return f'<div class="fig none"{style}><p>{text}</p></div>'


def step_kind(index: int, count: int) -> tuple[str, int]:
    """The fragment classes and index of group index of count, shown one per step: the first is shown at step 0
    and faded out at step 1, and the last is kept."""
    if index == 0:
        return "fragment fade-out", 1
    if index == count - 1:
        return "fragment", index
    return "fragment fade-in-then-out", index


def comparison(talk: Path) -> str:
    def need(path: str) -> str:
        if not (talk / path).is_file():
            raise SystemExit(f"missing figure {path}")
        return path

    groups = []
    for index, (family, branch, figure, caption) in enumerate(BRANCHES):
        cells = []
        for frame, words in FRAMES:
            stem = f"figures/dylan/family-{family}-{branch}-{frame}"
            need(f"{stem}-dark.png")
            need(f"{stem}-light.png")
            cells.append(f'      <div class="fig">{mode_images(stem, f"DyLAN, family {family} from {branch} in {words}")}</div>')
        for frame, words in FRAMES:
            path = f"figures/broucke/family-{family}-{branch}-{frame}-fig-{figure}.png"
            if (talk / path).is_file():
                alt = f"Broucke, Fig. {figure}, family {family} from {branch} in {words}"
                cells.append(f'      <div class="fig">{paper_image(path, alt)}</div>')
            else:
                cells.append(f"      {placeholder('Broucke did not draw this frame.')}")
        kind, step = step_kind(index, len(BRANCHES))
        groups.append(
            f'  <div class="cmp {kind}" data-fragment-index="{step}">\n'
            '    <div class="grid five">\n' + "\n".join(cells) + "\n    </div>\n"
            f'    <p class="caption full">{caption}</p>\n'
            "  </div>"
        )
    return (
        '<section class="figure">\n'
        "  <h2>Orbits against Broucke&rsquo;s figures</h2>\n" + "\n".join(groups) + "\n" + COMPARISON_NOTES + "\n</section>"
    )


def diagram(talk: Path) -> str:
    groups = []
    for index, (family, broucke, caption) in enumerate(DIAGRAMS):
        stem = f"figures/dylan/stability-family-{family}"
        crops = [] if isinstance(broucke, str) else [path for path, _ in broucke]
        for path in (f"{stem}-dark.png", f"{stem}-light.png", *crops):
            if not (talk / path).is_file():
                raise SystemExit(f"missing figure {path}")
        if isinstance(broucke, str):
            cells = [f"      {placeholder(broucke, 2)}"]
        else:
            cells = [f'      <div class="fig">{paper_image(path, alt)}</div>' for path, alt in broucke]
        cells.append(f'      <div class="fig">{mode_images(stem, f"DyLAN, family {family} in the a1, a2 plane")}</div>')
        kind, step = step_kind(index, len(DIAGRAMS))
        groups.append(
            f'  <div class="cmp {kind}" data-fragment-index="{step}">\n'
            '    <div class="grid three">\n' + "\n".join(cells) + "\n    </div>\n"
            f'    <p class="caption full">{caption}</p>\n'
            "  </div>"
        )
    return (
        '<section class="figure">\n'
        "  <h2>The families in Broucke&rsquo;s diagram</h2>\n" + "\n".join(groups) + "\n" + DIAGRAM_NOTES + "\n</section>"
    )


# the lines of code of the code box in each step of the speaker notes of the slide, set apart by a blank line,
# and each lit at its step in the highlight plugin of reveal.js. Blank lines are not counted, and only those
# around the imports are kept from the source, as in PEP 8
CALL_STEPS = [6, 3, 4, 7, 5, 1]


def code(talk: Path) -> str:
    lines = (talk / "data/pydylan_calls_dylan.py").read_text(encoding="utf-8").splitlines()
    if lines and lines[0].startswith('"""'):
        lines = lines[1:]
    while lines and not lines[0].strip():
        lines = lines[1:]
    body = next(k for k, line in enumerate(lines) if line.strip() and not line.startswith(("import ", "from ")))
    kept = lines[:body] + [line for line in lines[body:] if line.strip()]
    if sum(1 for line in kept if line.strip()) != sum(CALL_STEPS):
        raise SystemExit(f"data/pydylan_calls_dylan.py has {sum(1 for line in kept if line.strip())} lines of code, and the steps {CALL_STEPS} are written for {sum(CALL_STEPS)}")
    out: list[str] = []
    ranges = []
    for size in CALL_STEPS:
        if out:
            out.append("")
        first = len(out) + 1
        while size:
            line = kept.pop(0)
            out.append(line)
            size -= bool(line.strip())
        ranges.append(f"{first}-{len(out)}" if len(out) > first else str(first))
    pre = f'<pre style="font-size: 19px; line-height: 1.1"><code class="language-python" data-line-numbers="{"|".join(ranges)}">'
    return pre + html.escape("\n".join(out), quote=False) + "</code></pre>"


def cells(row: str) -> list[str]:
    parts = [part.strip() for part in row.strip().strip("|").split("|")]
    return [html.escape(re.sub(r"\$([^$]+)\$", r"\\(\1\\)", part), quote=False) for part in parts]


def tables(talk: Path) -> tuple[list[list[str]], list[list[str]]]:
    rows = [line for line in (talk / "data/check-144.md").read_text(encoding="utf-8").splitlines() if line.startswith("|")]
    blocks: list[list[list[str]]] = [[]]
    for row in rows:
        if set(row.replace("|", "").strip()) <= {"-"}:
            continue
        if blocks[-1] and row.startswith("| Branch") and len(blocks[-1]) > 1:
            blocks.append([])
        blocks[-1].append(cells(row))
    if len(blocks) != 2:
        raise SystemExit(f"expected two tables in check-144.md, found {len(blocks)}")
    return blocks[0], blocks[1]


def table(rows: list[list[str]], kind: str, header: list[str] | None = None) -> str:
    head = header or rows[0]
    out = [f'  <table class="{kind}">', "    <thead><tr>" + "".join(f"<th>{h}</th>" for h in head) + "</tr></thead>", "    <tbody>"]
    out += ["      <tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows[1:]]
    out += ["    </tbody>", "  </table>"]
    return "\n".join(out)


def splice(page: str, start: str, end: str, block: str) -> str:
    if start not in page or end not in page:
        raise SystemExit(f"marker {start!r} or {end!r} is not in the deck source")
    head, rest = page.split(start, 1)
    _, tail = rest.split(end, 1)
    return f"{head}{start}\n{block}\n{end}{tail}"


def main(talk: Path, deck: Path) -> None:
    page = deck.read_text(encoding="utf-8")
    page = splice(page, "<!-- comparison start -->", "<!-- comparison end -->", comparison(talk))
    page = splice(page, "<!-- diagram start -->", "<!-- diagram end -->", diagram(talk))
    page = splice(page, "<!-- calls start -->", "<!-- calls end -->", code(talk))
    counts, text = tables(talk)
    header = ["Branch", "Fig.", "Barycentric", "Rotating", "Pulsating", "Primary", "Secondary", "Panels", "Good", "Partial"]
    if len(counts[0]) != len(header):
        raise SystemExit("the table of panel counts in check-144.md has changed its columns")
    page = splice(page, "<!-- counts start -->", "<!-- counts end -->", table(counts, "check", header))
    page = splice(page, "<!-- statements start -->", "<!-- statements end -->", table(text, "text"))
    deck.write_text(page, encoding="utf-8")
    print(f"wrote the comparison slide, the diagram slide, the calls, and two tables into {deck}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
