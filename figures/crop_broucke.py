"""Crops Broucke's figures of families 7, 8 and 11 out of his papers at 300 dpi.

The papers are the AIAA Journal paper, [Broucke 1969](https://doi.org/10.2514/3.5267), and JPL
Technical Report 32-1360, "Periodic orbits in the elliptic restricted three-body problem" (1969).
Each page rectangle is in PDF points from the lower left of the page, as Claudio drew it in the
vault note "numerical experiments in Broucke 1969", and holds the figure with its caption. The
script writes three kinds of file into the output folder:

- pages/fig-<M><page letter>.png, each page of a figure cut to its ink, with the caption;
- family-<N>-<branch>-<frame>-fig-<M>.png, the panels of one coordinate frame of a figure,
  collected from all its pages and laid out in order of eccentricity;
- the stability diagrams as whole pages.

A page is split into panels at the blank bands between them, first into rows and then each row
into columns, and PANELS gives the frame and the eccentricity of each panel in reading order.
Run it from anywhere as

    uv run --with pymupdf,pillow,numpy python figures/crop_broucke.py <papers folder> <output folder>

where the papers folder holds broucke-1969-stability.pdf and broucke-1969-periodic-orbits.pdf.
"""

import collections
import io
import pathlib
import sys

import numpy as np
import pymupdf
from PIL import Image

DPI = 300
MARGIN_POINTS = 6
INK_LEVEL = 200
# blank bands between panels and the smallest panel, in pixels at DPI
GAP = 25
MIN_PANEL = 200
CELL_GAP = 60

AIAA = "broucke-1969-stability.pdf"
REPORT = "broucke-1969-periodic-orbits.pdf"

# (paper, page counted from 1, rectangle as left, bottom, right, top in points, page name,
# name of the whole-page output or None when the page is split by PANELS)
PAGES = (
    (AIAA, 7, (304, 379, 542, 627), "aiaa-fig-4", "aiaa-fig-4"),
    (REPORT, 58, (41, 162, 567, 625), "fig-13", None),
    (REPORT, 62, (33, 71, 574, 728), "fig-14a", None),
    (REPORT, 63, (32, 77, 597, 724), "fig-14b", None),
    (REPORT, 66, (161, 144, 446, 426), "fig-15", "family-8-stability-fig-15"),
    (REPORT, 67, (49, 89, 568, 700), "fig-16a", None),
    (REPORT, 68, (60, 88, 567, 697), "fig-16b", None),
    (REPORT, 69, (45, 81, 594, 703), "fig-16c", None),
    (REPORT, 70, (57, 85, 562, 690), "fig-16d", None),
    (REPORT, 73, (105, 148, 522, 637), "fig-17a", None),
    (REPORT, 74, (109, 151, 505, 629), "fig-17b", None),
    (REPORT, 75, (115, 159, 526, 626), "fig-17c", None),
    (REPORT, 78, (158, 73, 452, 344), "fig-18", "family-11-stability-fig-18"),
    (REPORT, 79, (97, 147, 528, 650), "fig-19a", None),
    (REPORT, 80, (106, 120, 521, 632), "fig-19b", None),
    (REPORT, 82, (66, 101, 572, 690), "fig-20a", None),
    (REPORT, 83, (63, 98, 577, 695), "fig-20b", None),
    (REPORT, 84, (44, 109, 558, 701), "fig-20c", None),
    (REPORT, 85, (73, 118, 521, 672), "fig-20d", None),
)

FRAMES = {"I": "inertial", "R": "rotating", "P": "pulsating", "G": "inertial-m1", "S": "inertial-m2"}
FIGURES = {"13": ("7", "periapsis"), "14": ("7", "apoapsis"), "16": ("8", "periapsis"), "17": ("8", "apoapsis"), "19": ("11", "periapsis"), "20": ("11", "apoapsis")}

# the frame letter of FRAMES and the eccentricity Broucke wrote, for each panel in reading order
# (reading order, frames matched by shape to the DyLAN tracks and by the order of the runs). An
# eccentricity of ? is one that Broucke did not write, and such panels are kept in reading order
PANELS = {
    "fig-13": "S:? S:? I:? I:? P:? R:? P:? R:?",
    "fig-14a": "I:0.0 I:0.95 R:0.0 R:0.25 R:0.50 R:0.60 R:0.70 R:0.80 R:0.90 R:0.95 R:0.975 P:0.0 P:0.40 P:0.80 P:0.975 S:0.0",
    "fig-14b": "S:0.25 S:0.50 S:0.60 S:0.70 S:0.80 S:0.90 S:0.95 S:0.975",
    "fig-16a": "I:0.0 I:0.30 I:0.50 I:0.55 I:0.60 I:0.69 I:0.80 I:0.90 I:0.975 R:0.0 R:0.50 R:0.80",
    "fig-16b": "R:0.90 R:0.975 P:0.0 P:0.80 P:0.90 P:0.975 G:0.0 G:0.50 G:0.80 G:0.875 G:0.90 G:0.925",
    "fig-16c": "G:0.96 G:0.975 S:0.0 S:0.10 S:0.20",
    "fig-16d": "S:0.25 S:0.35 S:0.50 S:0.65 S:0.80 S:0.90 S:0.95 S:0.975",
    "fig-17a": "I:0.85 I:0.0 R:0.0 R:0.60 P:0.05 P:0.80 R:0.85 G:0.0",
    "fig-17b": "G:0.5 G:0.85 S:0.05 S:0.25 S:0.40",
    "fig-17c": "S:0.50 S:0.60 S:0.85",
    "fig-19a": "I:0.0 I:0.36 I:0.453 R:0.0 R:0.18 R:0.24 R:0.30 R:0.453 P:0.0 P:0.18 P:0.24 P:0.30",
    "fig-19b": "P:0.453 G:0.0 G:0.453 S:0.0 S:0.30 S:0.453",
    "fig-20a": "I:0.0 I:0.50 I:0.75 I:0.88 R:0.0 R:0.30 R:0.4 R:0.5 R:0.6 R:0.70 R:0.75 R:0.80",
    "fig-20b": "R:0.88 P:0.0 P:0.15 P:0.30 P:0.5 P:0.70 P:0.88 G:0.0 G:0.40 G:0.5 G:0.6 G:0.75",
    "fig-20c": "G:0.85 G:0.88 S:0.0 S:0.15 S:0.20 S:0.25 S:0.35 S:0.40 S:0.45 S:0.60 S:0.65 S:0.70",
    "fig-20d": "S:0.75 S:0.80 S:0.86 S:0.87 S:0.88",
}


def render(document, page_number, rectangle):
    """The rectangle of the page as a grayscale image at DPI, from points measured at the lower left."""
    page = document[page_number - 1]
    left, bottom, right, top = rectangle
    height = page.rect.height
    clip = pymupdf.Rect(left, height - top, right, height - bottom)
    pixmap = page.get_pixmap(clip=clip, dpi=DPI, colorspace=pymupdf.csGRAY)
    return Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("L")


def without_caption(document, page_number, rectangle, image):
    """The image with the caption line blanked, found from the word "Fig" in the OCR layer of the scan.

    On some pages the axis of the last panel runs down beside the caption, hence the caption cannot be
    cut off at a blank band.
    """
    page = document[page_number - 1]
    left, _, _, top = rectangle
    words = page.get_text("words")
    first = max((w for w in words if w[4].startswith("Fig")), key=lambda w: w[1])
    line = [w for w in words if abs(w[1] - first[1]) < 4 and w[0] >= first[0] - 2]
    scale = DPI / 72
    origin_y = page.rect.height - top
    box = (
        round((first[0] - 2 - left) * scale),
        round((first[1] - 2 - origin_y) * scale),
        round((max(w[2] for w in line) + 2 - left) * scale),
        round((max(w[3] for w in line) + 2 - origin_y) * scale),
    )
    blank = image.copy()
    blank.paste(255, box)
    return blank


def ink_box(image, box=None):
    """The box of the ink inside box (the whole image by default), grown by MARGIN_POINTS."""
    left, top, right, bottom = box or (0, 0, image.width, image.height)
    ink = np.asarray(image)[top:bottom, left:right] < INK_LEVEL
    rows, columns = np.flatnonzero(ink.any(axis=1)), np.flatnonzero(ink.any(axis=0))
    margin = round(MARGIN_POINTS * DPI / 72)
    return (
        max(left + columns[0] - margin, 0),
        max(top + rows[0] - margin, 0),
        min(left + columns[-1] + margin + 1, image.width),
        min(top + rows[-1] + margin + 1, image.height),
    )


def runs(occupied):
    """The (start, stop) of each run of occupied entries, merging runs closer than GAP."""
    indices = np.flatnonzero(occupied)
    if len(indices) == 0:
        return []
    breaks = np.flatnonzero(np.diff(indices) > GAP)
    starts = np.concatenate([[indices[0]], indices[breaks + 1]])
    stops = np.concatenate([indices[breaks], [indices[-1]]]) + 1
    return list(zip(starts, stops))


def panels(image):
    """The boxes of the panels of a page in reading order, leaving out the caption."""
    ink = np.asarray(image) < INK_LEVEL
    boxes = []
    for top, bottom in runs(ink.any(axis=1)):
        if bottom - top < MIN_PANEL:
            continue
        for left, right in runs(ink[top:bottom].any(axis=0)):
            if right - left >= MIN_PANEL:
                boxes.append(ink_box(image, (left, top, right, bottom)))
    return boxes


def parse(labels):
    """The (frame letter, eccentricity text) of each panel from a string like 'I:0.0 R:0.25'."""
    return [tuple(item.split(":")) for item in labels.split()]


def compose(images):
    """The images on white in a grid of equal cells, three to a row, or two for two or four images."""
    columns = 2 if len(images) in (2, 4) else min(len(images), 3)
    rows = -(-len(images) // columns)
    width, height = max(i.width for i in images), max(i.height for i in images)
    sheet = Image.new("L", (columns * width + (columns - 1) * CELL_GAP, rows * height + (rows - 1) * CELL_GAP), 255)
    for k, image in enumerate(images):
        row, column = divmod(k, columns)
        x = column * (width + CELL_GAP) + (width - image.width) // 2
        y = row * (height + CELL_GAP) + (height - image.height) // 2
        sheet.paste(image, (x, y))
    return sheet


def main():
    papers, output = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    (output / "pages").mkdir(parents=True, exist_ok=True)
    documents = {name: pymupdf.open(papers / name) for name in (AIAA, REPORT)}
    frames = collections.defaultdict(list)
    for paper, page_number, rectangle, page_name, whole in PAGES:
        image = render(documents[paper], page_number, rectangle)
        page = image.crop(ink_box(image))
        page.save(output / "pages" / f"{page_name}.png", dpi=(DPI, DPI), optimize=True)
        if whole:
            page.save(output / f"{whole}.png", dpi=(DPI, DPI), optimize=True)
            print(f"{whole}.png: {paper} page {page_number}, {page.width} x {page.height} px")
            continue
        image = without_caption(documents[paper], page_number, rectangle, image)
        boxes, labels = panels(image), parse(PANELS[page_name])
        if len(boxes) != len(labels):
            sys.exit(f"{page_name}: {len(boxes)} panels found but {len(labels)} labeled")
        figure = page_name[4:6]
        for box, (frame, eccentricity) in zip(boxes, labels):
            frames[figure, frame].append((None if eccentricity == "?" else float(eccentricity), page_name, image.crop(box)))
    for (figure, frame), items in sorted(frames.items()):
        family, branch = FIGURES[figure]
        items.sort(key=lambda item: (item[0] is None, item[0] or 0.0))
        name = f"family-{family}-{branch}-{FRAMES[frame]}-fig-{figure}.png"
        compose([image for *_, image in items]).save(output / name, dpi=(DPI, DPI), optimize=True)
        print(f"{name}: e = {', '.join('?' if e is None else f'{e:g}' for e, *_ in items)} from {', '.join(sorted({p for _, p, _ in items}))}")


if __name__ == "__main__":
    main()
