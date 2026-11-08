"""Write the comparison slide, the PyDyLAN code block, and the backup tables into the deck source.

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
    (7, "periapsis", 13, r"Family 7 from periapsis is continued at \(\mu = 0.012155\), and one index reaches \(k = -2\) at \(e = 0.468\)."),
    (7, "apoapsis", 14, r"Family 7 from apoapsis is in region 1, i.e. stable, from \(e = 0.005\) to 0.975."),
    (8, "periapsis", 16, r"Family 8 from periapsis is continued at \(\mu = 0.5\), and one index reaches \(k = -2\) at \(e = 0.677\)."),
    (8, "apoapsis", 17, r"Family 8 from apoapsis is in region 2 from \(e = 0.289\), and in region 1 from \(e = 0.847\)."),
    (11, "periapsis", 19, r"Family 11 from periapsis is in region 4 up to the fold at \(e = 0.453865\)."),
    (
        11,
        "apoapsis",
        20,
        r"On family 11 from apoapsis, one index reaches \(k = -2\) at \(e = 0.295\), and the branch is in regions 7 and 5 past \(e = 0.84\).",
    ),
]
COMPARISON_NOTES = """  <aside class="notes">
    <p>Step 0: I go through the comparison figures quickly, one branch per click. First, family 11 in the plane of a₁ and a₂, with Broucke's Fig. 4 of the AIAA paper at left, Fig. 18 of his JPL report in the middle, and DyLAN at right. The curves agree, but the a₁ axis of Fig. 4 is labeled ten times too large. In DyLAN, a₁ goes from −4918.9 to −252.5 up to e = 0.453.</p>
    <p>Step 1: Family 7 from periapsis, at the Earth–Moon mass ratio. On top are my members in the five frames of the Broucke page. Below is Broucke's Fig. 13 of the JPL report, whole, since he did not label its panels with e. The family is unstable, and one index reaches −2 at e = 0.468, past the members drawn here, which end at e = 0.35.</p>
    <p>Step 2: Family 7 from apoapsis, stable from e = 0.005 to e = 0.975. Below each of my frames is Broucke's run of panels in the same frame, from Fig. 14. He did not draw this branch about the primary.</p>
    <p>Step 3: Family 8 from periapsis, at a mass ratio of one half, with Fig. 16 below. One index reaches −2 at e = 0.677. My members go up to e = 0.97, one step short of his last panel, since my member at 0.975 is not converged.</p>
    <p>Step 4: Family 8 from apoapsis, with Fig. 17. It crosses the parabola into region 2 at e = 0.289, and it is stable from e = 0.847 to its last member at 0.85.</p>
    <p>Step 5: Family 11 from periapsis, up to the fold, with Fig. 19.</p>
    <p>Step 6: Family 11 from apoapsis, with Fig. 20. The period-doubling at e = 0.295 is the one of the last section, and three more crossings follow past e = 0.84, into regions 7, 5, and 7 again, on the last members drawn here, which end at e = 0.88, as his do.</p>
    <p>Step 7: So I found every branch consistent with Broucke's figures, in each frame in which he drew one. Last, I show the PyDyLAN calls for one of them.</p>
    <p>TODO(claudio): the frames of a few of Broucke's panels were identified by their shape, in Figs. 13, 14, 16, and 17, as listed under "Where I was unsure" in figures/broucke/INDEX.md.</p>
  </aside>"""


def mode_images(stem: str, alt: str) -> str:
    return (
        f'<img class="for-dark" src="{stem}-dark.png" alt="{alt}">'
        f'<img class="for-light" src="{stem}-light.png" alt="{alt}">'
    )


def paper_image(path: str, alt: str) -> str:
    return f'<img class="paper" src="{path}" alt="{alt}">'


def comparison(talk: Path) -> str:
    def need(path: str) -> str:
        if not (talk / path).is_file():
            raise SystemExit(f"missing figure {path}")
        return path

    for name in ("aiaa-fig-4", "family-11-stability-fig-18"):
        need(f"figures/broucke/{name}.png")
    need("figures/dylan/stability-family-11-dark.png")
    need("figures/dylan/stability-family-11-light.png")
    groups = [
        '  <div class="cmp fragment fade-out" data-fragment-index="1">\n'
        '    <div class="grid three">\n'
        f'      <div class="fig">{paper_image("figures/broucke/aiaa-fig-4.png", "Broucke, AIAA Fig. 4, family 11 in the a1, a2 plane")}</div>\n'
        f'      <div class="fig">{paper_image("figures/broucke/family-11-stability-fig-18.png", "Broucke, report Fig. 18, family 11 in the a1, a2 plane")}</div>\n'
        f'      <div class="fig">{mode_images("figures/dylan/stability-family-11", "DyLAN, family 11 in the a1, a2 plane")}</div>\n'
        "    </div>\n"
        r'    <p class="caption">Family 11 is drawn in Broucke&rsquo;s two figures and in DyLAN. The \(a_1\) labels of the left figure are ten times too large.</p>'
        "\n  </div>"
    ]
    for index, (family, branch, figure, caption) in enumerate(BRANCHES, start=1):
        cells = []
        for frame, words in FRAMES:
            stem = f"figures/dylan/family-{family}-{branch}-{frame}"
            need(f"{stem}-dark.png")
            need(f"{stem}-light.png")
            cells.append(f'      <div class="fig">{mode_images(stem, f"DyLAN, family {family} from {branch} in {words}")}</div>')
        mixed = f"figures/broucke/family-{family}-{branch}-mixed-fig-{figure}.png"
        if (talk / mixed).is_file():
            alt = f"Broucke, Fig. {figure}, family {family} from {branch}, several frames"
            cells.append(f'      <div class="fig span">{paper_image(mixed, alt)}</div>')
        else:
            for frame, words in FRAMES:
                path = f"figures/broucke/family-{family}-{branch}-{frame}-fig-{figure}.png"
                if (talk / path).is_file():
                    alt = f"Broucke, Fig. {figure}, family {family} from {branch} in {words}"
                    cells.append(f'      <div class="fig">{paper_image(path, alt)}</div>')
                else:
                    cells.append('      <div class="fig"></div>')
        kind = "fragment" if index == len(BRANCHES) else "fragment fade-in-then-out"
        groups.append(
            f'  <div class="cmp {kind}" data-fragment-index="{index}">\n'
            '    <div class="grid five">\n' + "\n".join(cells) + "\n    </div>\n"
            f'    <p class="caption">{caption}</p>\n'
            "  </div>"
        )
    return (
        '<section class="figure">\n'
        "  <h2>Every branch against Broucke&rsquo;s figures</h2>\n" + "\n".join(groups) + "\n" + COMPARISON_NOTES + "\n</section>"
    )


# the groups of lines of the code box, one per step of the speaker notes of the slide, each lit at its step
# in the highlight plugin of reveal.js
CALL_GROUPS = "1-6|7-9|10-13|14-20|21-25|26"


def code(talk: Path) -> str:
    lines = (talk / "data/pydylan_calls_dylan.py").read_text(encoding="utf-8").splitlines()
    if lines and lines[0].startswith('"""'):
        lines = lines[1:]
    kept = [line for line in lines if line.strip()]
    if len(kept) != 26:
        raise SystemExit(f"data/pydylan_calls_dylan.py has {len(kept)} lines of code, and the groups {CALL_GROUPS} are written for 26")
    pre = f'<pre style="font-size: 21px"><code class="language-python" data-line-numbers="{CALL_GROUPS}">'
    return pre + html.escape("\n".join(kept), quote=False) + "</code></pre>"


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
    page = splice(page, "<!-- calls start -->", "<!-- calls end -->", code(talk))
    counts, text = tables(talk)
    header = ["Branch", "Fig.", "Barycentric", "Rotating", "Pulsating", "Primary", "Secondary", "Panels", "Good", "Partial"]
    if len(counts[0]) != len(header):
        raise SystemExit("the table of panel counts in check-144.md has changed its columns")
    page = splice(page, "<!-- counts start -->", "<!-- counts end -->", table(counts, "check", header))
    page = splice(page, "<!-- statements start -->", "<!-- statements end -->", table(text, "text"))
    deck.write_text(page, encoding="utf-8")
    print(f"wrote the comparison slide, the calls, and two tables into {deck}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
