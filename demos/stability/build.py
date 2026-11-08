"""Builds the plot of the stability demo of slides 14 to 17 from the data in data/stability.

The plot has two panels. In the panel circle, the four in-plane Floquet multipliers of a member are
drawn on the complex plane with the unit circle, and in the panel diagram, the point (a1, a2) of
the same member is drawn in Broucke's stability diagram. The six tabs are the six branches of
families 11, 7 and 8. Run the script with the system python3, from any folder:

    python3 demos/stability/build.py

It writes stability.json next to this file and the same JSON into the inline block of
preview/index.html, and it prints the number of frames of each tab. With --deck PATH, the same JSON
is also written into the block <script type="application/json" id="stability"> of the deck at
PATH, e.g. index.html or a copy of it. With --scale linear or --scale asinh, every tab of the
preview is drawn on that scale, for the screenshots that compare the two, and stability.json is
left as it is. The two flags are not combined.
"""

import argparse
import cmath
import json
import math
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent.parent / 'data' / 'stability'
PREVIEW = HERE / 'preview' / 'index.html'

# tab name, branch file, and the scale of the diagram chosen from the screenshots of both scales
TABS = [
    ('11P', 'family-11-periapsis', 'asinh'),
    ('11A', 'family-11-apoapsis', 'asinh'),
    ('7P', 'family-7-periapsis', 'linear'),
    ('7A', 'family-7-apoapsis', 'linear'),
    ('8P', 'family-8-periapsis', 'asinh'),
    ('8A', 'family-8-apoapsis', 'asinh'),
]
# the margin of the view of a tab beyond its path, as fractions of the span of the path in scaled
# coordinates, at the left, right, bottom, and top, where a region the path visits needs room for
# its name
PAD = {'asinh': (0.07, 0.07, 0.07, 0.07), 'linear': (0.1, 0.1, 0.1, 0.1)}
PAD_TAB = {
    ('11P', 'asinh'): (0.07, 0.07, 0.15, 0.07),
    ('11A', 'asinh'): (0.07, 0.23, 0.07, 0.23),
    ('7P', 'linear'): (0.1, 0.1, 0.18, 0.1),
    ('8A', 'asinh'): (0.2, 0.07, 0.15, 0.3),
}
RESIDUAL = 1e-6

# the symbols of Frauenfelder and Moreno for Broucke's regions 1 to 7, in the markup of the plot
SYMBOL = {
    1: r'$\mathcal{E}^{2}$', 2: r'$\mathcal{N}$', 3: r'$\mathcal{H}^{-+}$', 4: r'$\mathcal{H}^{++}$',
    5: r'$\mathcal{H}^{--}$', 6: r'$\mathcal{EH}^{+}$', 7: r'$\mathcal{EH}^{-}$',
}

# the box of the diagram in px at the zone of the preview, 880 by 840 px, used to place the labels
# and to space the ticks
BOX = (391, 592)
CELL = 4
FONT = 28
SPACING = {'x': 64, 'y': 38}


def load(name):
    return json.loads((DATA / f'{name}.json').read_text())


def sig(x, digits=6):
    return float(f'{x:.{digits}g}')


# ---- multipliers and indices


def indices(a1, a2):
    """The indices k1 and k2, the roots of k^2 + a1 k + a2 - 2 = 0, ascending if real, and with the
    negative imaginary part first if complex, as in the data."""
    disc = a1 * a1 - 4 * (a2 - 2)
    if disc >= 0:
        r = math.sqrt(disc)
        return [complex((-a1 - r) / 2), complex((-a1 + r) / 2)]
    r = math.sqrt(-disc)
    return [complex(-a1 / 2, -r / 2), complex(-a1 / 2, r / 2)]


def pair(k):
    """The two multipliers of the index k, the one of modulus at least 1 first, and on the unit
    circle the one with the nonnegative imaginary part first."""
    if abs(k.imag) < 1e-12 and abs(k.real) < 2:
        c = k.real / 2
        s = math.sqrt(max(0.0, 1 - c * c))
        return [complex(c, s), complex(c, -s)]
    lam = (k + cmath.sqrt(k * k - 4)) / 2
    if abs(lam) < 1:
        lam = 1 / lam
    return [lam, 1 / lam]


def region_of(a1, a2):
    """Broucke's region of the point (a1, a2), from the indices."""
    k = indices(a1, a2)
    if k[0].imag != 0:
        return 2
    inner = sum(abs(x.real) < 2 for x in k)
    above = sum(x.real > 2 for x in k)
    below = sum(x.real < -2 for x in k)
    if inner == 2:
        return 1
    if above == 2:
        return 4
    if below == 2:
        return 5
    if above == 1 and below == 1:
        return 3
    return 6 if above == 1 else 7


def squeeze(z):
    """The point at which a multiplier z is drawn, at the radius exp(sign(ln r) ln(1 + |ln r|) / 2)
    for the modulus r, so that z and its inverse are mirror images across the unit circle."""
    r = abs(z)
    lr = math.log(r)
    big = math.exp(math.copysign(math.log1p(abs(lr)) / 2, lr))
    return [round(big * z.real / r, 4), round(big * z.imag / r, 4)]


def continuous(frames):
    """The frames with the two multipliers of a pair swapped wherever the swapped order is nearer to
    the previous frame in the circle panel, so that a trace does not cut a chord across the circle.
    A fixed order, e.g. the one of modulus at least 1 first, is not continuous on family 8 from
    apoapsis, whose two pairs are equal on the real axis at the entry into region 2 and on the unit
    circle at the exit from it. Where both orders are equally near, as just after the two
    multipliers of a pair are at 1 or -1, the order is kept."""
    last = None
    for f in frames:
        lam = f['lam']
        if last:
            for i in (0, 2):
                a, b = squeeze(lam[i]), squeeze(lam[i + 1])
                if math.dist(b, last[i]) + math.dist(a, last[i + 1]) < math.dist(a, last[i]) + math.dist(b, last[i + 1]) - 1e-9:
                    lam[i], lam[i + 1] = lam[i + 1], lam[i]
        last = [squeeze(z) for z in lam]
    return frames


def radius(r):
    return math.sqrt(1 + math.log(r))


# ---- frames


def frame(e, a1, a2, k=None, lam=None, region=None):
    k = k or indices(a1, a2)
    lam = lam or pair(k[0]) + pair(k[1])
    return {'e': e, 'a1': a1, 'a2': a2, 'k': k, 'lam': lam, 'region': region or region_of(a1, a2), 'cross': None}


def from_member(m):
    k = [complex(*p) for p in m['k']]
    lam = [complex(*p) for p in m['multipliers']]
    return frame(m['e'], m['a1'], m['a2'], k, lam, m['region'])


# the functions whose zeros are the three curves. f = (2 - k1)(2 - k2) is zero on the line k = 2,
# g = (2 + k1)(2 + k2) on the line k = -2, and h, negative for real indices, on the parabola k1 = k2
CURVES = {
    'plus': lambda a1, a2: 2 + 2 * a1 + a2,
    'minus': lambda a1, a2: 2 - 2 * a1 + a2,
    'equal': lambda a1, a2: a2 - a1 * a1 / 4 - 2,
}


def root(fn, p, q):
    lo, hi = 0.0, 1.0
    at = lambda t: fn(p['a1'] + t * (q['a1'] - p['a1']), p['a2'] + t * (q['a2'] - p['a2']))
    f0 = at(lo)
    for _ in range(80):
        mid = (lo + hi) / 2
        if (at(mid) > 0) == (f0 > 0):
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def with_crossings(frames):
    """The frames with a frame added on each crossing of a curve, on the curve itself. The interval
    from the member at e = 0, which lies on the line k = 2, is not searched."""
    out = [frames[0]]
    for p, q in zip(frames, frames[1:]):
        found = []
        if p is not frames[0]:
            for name, fn in CURVES.items():
                if fn(p['a1'], p['a2']) * fn(q['a1'], q['a2']) < 0:
                    found.append((root(fn, p, q), name))
        for t, name in sorted(found):
            f = frame(p['e'] + t * (q['e'] - p['e']), p['a1'] + t * (q['a1'] - p['a1']), p['a2'] + t * (q['a2'] - p['a2']), region=q['region'])
            f['cross'] = name
            out.append(f)
        out.append(q)
    return out


def branch(tab, name):
    members = load(name)['members']
    kept = [m for m in members if m['symplecticity_residual'] <= RESIDUAL]
    dropped = [m for m in members if m['symplecticity_residual'] > RESIDUAL]
    if tab != '11P':
        return with_crossings([from_member(m) for m in kept]), dropped
    # family 11 at periapsis is followed through its fold, from the continuation in e up to 0.45
    # and from the continuation in arclength after it
    fold = load('fold-family-11-periapsis')
    frames = [from_member(m) for m in kept if m['e'] < 0.45 - 1e-9]
    frames += [from_member(m) for m in fold['members']]
    frames = with_crossings(frames)
    marks = fold['marks']
    plus = [f for f in frames if f['cross'] == 'plus']
    minus = [f for f in frames if f['cross'] == 'minus']
    assert len(plus) == 1 and len(minus) == 1, 'one fold and one period doubling are expected'
    m = marks['fold']
    plus[0].update(from_member({**m, 'index': None}), cross='plus')
    minus[0]['e'] = marks['k1 = -2']['e']
    return frames, dropped


# ---- the diagram of a tab


def scale_fn(scale):
    if scale == 'asinh':
        return math.asinh, math.sinh
    return (lambda v: v), (lambda v: v)


def view(frames, scale, pad):
    """The ranges of a1 and a2 fitted to the path with the margin pad, in the coordinates of the
    scale. A linear view also holds region 1, the triangle between (-4, 6), (4, 6), and (0, -2),
    since a path near the origin is otherwise drawn without the regions it is measured against."""
    fwd, _ = scale_fn(scale)
    points = [(f['a1'], f['a2']) for f in frames]
    if scale == 'linear':
        points += [(-4, 6), (4, 6), (0, -2)]
    out = []
    for axis in (0, 1):
        lo = min(fwd(p[axis]) for p in points)
        hi = max(fwd(p[axis]) for p in points)
        span = max(hi - lo, 0.5 if scale == 'asinh' else 0.2)
        out.append((lo - pad[2 * axis] * span, hi + pad[2 * axis + 1] * span))
    return out


def tick_text(v, plain=False):
    if v == 0:
        return '$0$'
    a = abs(v)
    sign = '-' if v < 0 else ''
    if a >= 100 and not plain:
        return f'${sign}10^{{{round(math.log10(a))}}}$'
    return f'${sign}{a:g}$'


def ticks(lo, hi, scale, px, gap, key):
    """Ticks inside the range (lo, hi) of scaled coordinates along an axis of px pixels, at least gap
    px apart, and on the axis a1 with at least 16 px between their texts. On an asinh scale
    they are taken at +-2, +-10, ..., +-10^4 in this order of preference. Where fewer than three of
    these are in the range, the ticks are taken at 1, 2, and 5 times the powers of 10 instead,
    with their values in digits. On a linear scale they are taken at a round step."""
    fwd, back = scale_fn(scale)
    unit = px / (hi - lo)

    def spaced(order, plain):
        kept = []
        for v in order:
            s = fwd(v)
            room = lambda w: gap if key == 'y' else max(gap, (text_width(tick_text(v, plain)) + text_width(tick_text(w, plain))) / 2 + 16)
            if lo < s < hi and all(abs(s - fwd(w)) * unit >= room(w) for w in kept):
                kept.append(v)
        return [{'at': v, 'text': tick_text(v, plain)} for v in sorted(kept)]

    if scale == 'asinh':
        out = spaced([2, -2, 100, -100, 10000, -10000, 10, -10, 1000, -1000], False)
        if len(out) >= 3:
            return out
        steps = [m * 10 ** n for n in range(0, 5) for m in (1, 5, 2)]
        return spaced([v for m in steps for v in (m, -m)], True)
    span = back(hi) - back(lo)
    for step in [m * 10 ** n for n in range(-1, 6) for m in (1, 2, 2.5, 5)]:
        wide = max(text_width(tick_text(v, True)) for v in (back(lo), back(hi)))
        if step * unit >= (gap if key == 'y' else max(gap, wide + 16)) and span / step <= 7:
            break
    first = math.ceil(back(lo) / step)
    vals = [round(i * step, 6) for i in range(first, int(math.floor(back(hi) / step)) + 1)]
    return [{'at': v, 'text': f'${v:g}$'} for v in vals]


def curve_points(name, x_range, y_range, scale, n=360):
    """A curve as a polyline over the view, sampled evenly in the coordinate of the scale of a1, in
    data coordinates. The lines are sampled over the scaled view of a1 and cut where a2 leaves the
    scaled view of a2 by more than its height."""
    fwd, back = scale_fn(scale)
    lo, hi = x_range
    ylo, yhi = y_range
    pad = hi - lo
    ypad = yhi - ylo
    y = {'plus': lambda a: -2 * a - 2, 'minus': lambda a: 2 * a - 2, 'equal': lambda a: a * a / 4 + 2}[name]
    pts = []
    for i in range(n + 1):
        s = lo - pad * 0.1 + (hi - lo + pad * 0.2) * i / n
        a1 = back(s)
        a2 = y(a1)
        if ylo - ypad <= fwd(a2) <= yhi + ypad:
            pts.append([sig(a1), sig(a2)])
    return pts


def stable_polygon(scale, n=60):
    """Region 1, between the two lines and below the parabola, as a polygon in data coordinates."""
    fwd, back = scale_fn(scale)
    pts = []
    for i in range(n + 1):
        a1 = back(fwd(-4) + (fwd(0) - fwd(-4)) * i / n)
        pts.append([sig(a1), sig(-2 * a1 - 2)])
    for i in range(1, n + 1):
        a1 = back(fwd(0) + (fwd(4) - fwd(0)) * i / n)
        pts.append([sig(a1), sig(2 * a1 - 2)])
    for i in range(1, n):
        a1 = 4 - 8 * i / n
        pts.append([sig(a1), sig(a1 * a1 / 4 + 2)])
    return pts


# ---- placement of the names of the curves and the regions

# the words at the crossings of the lines k = 2 and k = -2 on a tab, and where they are drawn
# relative to the mark, at the left of it, below for the fold and above for the period doubling
WORDS = {'11P': {'plus': 'fold', 'minus': 'period doubling'}}
EVENT = {'plus': {'anchor': 'end', 'dx': -22, 'dy': 30}, 'minus': {'anchor': 'end', 'dx': -22, 'dy': -26}}


def text_width(text):
    plain = re.sub(r'\\mathrm|\\mathcal|[${}_^]', '', text)
    return 15 * len(plain) + 8


class Field:
    """A raster of the box of the diagram in cells of CELL px, with the distance in px from each
    cell to the nearest obstacle, by a two-pass chamfer transform."""

    def __init__(self, cells):
        self.nx = BOX[0] // CELL + 1
        self.ny = BOX[1] // CELL + 1
        big = 1e9
        d = [[big] * self.nx for _ in range(self.ny)]
        for i, j in cells:
            if 0 <= i < self.nx and 0 <= j < self.ny:
                d[j][i] = 0
        for j in range(self.ny):
            for i in range(self.nx):
                for di, dj, w in ((-1, 0, 1), (0, -1, 1), (-1, -1, 1.414), (1, -1, 1.414)):
                    a, b = i + di, j + dj
                    if 0 <= a < self.nx and 0 <= b < self.ny and d[b][a] + w < d[j][i]:
                        d[j][i] = d[b][a] + w
        for j in reversed(range(self.ny)):
            for i in reversed(range(self.nx)):
                for di, dj, w in ((1, 0, 1), (0, 1, 1), (1, 1, 1.414), (-1, 1, 1.414)):
                    a, b = i + di, j + dj
                    if 0 <= a < self.nx and 0 <= b < self.ny and d[b][a] + w < d[j][i]:
                        d[j][i] = d[b][a] + w
        self.d = d

    def clearance(self, x0, y0, x1, y1):
        """The least distance in px from the rectangle to an obstacle, 0 if one is inside."""
        best = 1e9
        for j in range(max(0, int(y0 // CELL)), min(self.ny, int(y1 // CELL) + 1)):
            row = self.d[j]
            for i in range(max(0, int(x0 // CELL)), min(self.nx, int(x1 // CELL) + 1)):
                if row[i] < best:
                    best = row[i]
        return best * CELL


def place_labels(frames, x_range, y_range, scale, curves, events):
    """The names of the regions in view and of the three curves, each placed where it is farthest
    from the path, from the curves, from the marks and words of the events, and from the names
    placed before it, and each region name inside its region. Where a region has no such place
    with 8 px of room, its name is placed inside it at 3 px from the curves, and over the path if
    need be. The region names are placed first, since a curve has more room along it."""
    fwd, back = scale_fn(scale)
    (xlo, xhi), (ylo, yhi) = x_range, y_range
    to_px = lambda a1, a2: ((fwd(a1) - xlo) / (xhi - xlo) * BOX[0], (yhi - fwd(a2)) / (yhi - ylo) * BOX[1])
    to_data = lambda px, py: (back(xlo + px / BOX[0] * (xhi - xlo)), back(yhi - py / BOX[1] * (yhi - ylo)))

    def cells_of(points, dense=3.0):
        out = set()
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            steps = max(1, int(math.hypot(x1 - x0, y1 - y0) / dense))
            for s in range(steps + 1):
                t = s / steps
                out.add((int((x0 + t * (x1 - x0)) // CELL), int((y0 + t * (y1 - y0)) // CELL)))
        return out

    curve_cells = {name: cells_of([to_px(*p) for p in pts]) for name, pts in curves.items()}
    path_cells = cells_of([to_px(f['a1'], f['a2']) for f in frames])
    all_curves = set().union(*curve_cells.values())
    labels = []
    h = FONT + 4

    def cells_in(x0, y0, x1, y1):
        return {(i, j) for i in range(int(x0 // CELL), int(x1 // CELL) + 1) for j in range(int(y0 // CELL), int(y1 // CELL) + 1)}

    taken = set()
    for a1, a2, kind, text in events:
        px, py = to_px(a1, a2)
        taken |= cells_in(px - 16, py - 16, px + 16, py + 16)
        if text:
            style = EVENT[kind]
            x1 = px + style['dx']
            taken |= cells_in(x1 - text_width(text), py + style['dy'] - h / 2, x1, py + style['dy'] + h / 2)

    def candidates(w):
        for py in range(int(h / 2) + 6, BOX[1] - int(h / 2) - 6, 8):
            for px in range(int(w / 2) + 6, BOX[0] - int(w / 2) - 6, 8):
                yield px, py

    def rect(px, py, w):
        return px - w / 2, py - h / 2, px + w / 2, py + h / 2

    path_field = Field(path_cells)
    for region in range(1, 8):
        text = SYMBOL[region]
        w = text_width(text)
        walls = Field(all_curves | taken)
        best = None
        for px, py in candidates(w):
            x0, y0, x1, y1 = rect(px, py, w)
            probes = [(x, y) for x in (x0, px, x1) for y in (y0, py, y1)]
            if any(region_of(*to_data(x, y)) != region for x, y in probes):
                continue
            wall = walls.clearance(x0, y0, x1, y1)
            path = path_field.clearance(x0, y0, x1, y1)
            if wall < 3:
                continue
            # a place with 8 px of room from everything is preferred to any place without it
            score = (1, min(wall, path, 80)) if min(wall, path) >= 8 else (0, min(wall, 30) + min(path, 30))
            if best is None or score > best[0]:
                best = (score, px, py)
        if best:
            _, px, py = best
            a1, a2 = to_data(px, py)
            labels.append({'id': f'r{region}', 'at': [sig(a1), sig(a2)], 'text': text, 'tone': 'text'})
            taken |= cells_in(*rect(px, py, w))

    for name, text in (('plus', '$k = 2$'), ('minus', '$k = -2$'), ('equal', '$k_1 = k_2$')):
        if not curve_cells[name]:
            continue
        own = Field(curve_cells[name])
        others = Field(all_curves - curve_cells[name] | taken)
        w = text_width(text)
        best = None
        for px, py in candidates(w):
            r = rect(px, py, w)
            near = own.clearance(*r)
            if not 6 <= near <= 16:
                continue
            room = min(others.clearance(*r), path_field.clearance(*r), 60)
            # 14 px of room are preferred, and 6 px are enough
            score = (room >= 14, room)
            if room >= 6 and (best is None or score > best[0]):
                best = (score, px, py)
        if best:
            _, px, py = best
            a1, a2 = to_data(px, py)
            labels.append({'id': f'k{name}', 'at': [sig(a1), sig(a2)], 'text': text, 'tone': 'subtle', 'class': f'k{name}'})
            taken |= cells_in(*rect(px, py, w))

    return labels


# ---- the plot


def fmt(x):
    a = abs(x)
    if a < 10:
        return f'{x:.3f}'
    if a < 100:
        return f'{x:.2f}'
    if a < 10000:
        return f'{x:.1f}'
    return f'{x:.0f}'


def index_text(name, k):
    if abs(k.imag) < 1e-9:
        return f'${name} = {fmt(k.real)}$'
    sign = '+' if k.imag >= 0 else '-'
    return rf'${name} = {fmt(k.real)} {sign} {fmt(abs(k.imag))}\mathrm{{i}}$'


def crossings(name, frames):
    """The frames on the lines k = 2 and k = -2, with their words on the tab name."""
    words = WORDS.get(name, {})
    return [(i, f, words.get(f['cross'], '')) for i, f in enumerate(frames) if f['cross'] in ('plus', 'minus')]


def diagram(name, frames, scale):
    pad = PAD_TAB.get((name, scale), PAD[scale])
    x_range, y_range = view(frames, scale, pad)
    curves = {key: curve_points(key, x_range, y_range, scale) for key in ('plus', 'minus', 'equal')}
    events = [(f['a1'], f['a2'], f['cross'], text) for _, f, text in crossings(name, frames)]
    _, back = scale_fn(scale)
    title = ' on an asinh scale' if scale == 'asinh' else ''
    axis = lambda r, key: {
        'range': [sig(back(r[0])), sig(back(r[1]))],
        'scale': scale,
        'ticks': ticks(r[0], r[1], scale, BOX[0] if key == 'x' else BOX[1], SPACING[key], key),
        'title': f'$a_{1 if key == "x" else 2}${title}',
    }
    return {
        'x': axis(x_range, 'x'),
        'y': axis(y_range, 'y'),
        'regions': [{'id': 'stable', 'points': stable_polygon(scale), 'tone': 'data-3', 'opacity': 0.16}],
        'curves': [
            {'id': 'kequal', 'class': 'kequal', 'points': curves['equal'], 'tone': 'subtle', 'width': 2.5},
            {'id': 'kplus', 'class': 'kplus', 'points': curves['plus'], 'tone': 'subtle', 'width': 2.5},
            {'id': 'kminus', 'class': 'kminus', 'points': curves['minus'], 'tone': 'subtle', 'width': 2.5},
        ],
        'labels': place_labels(frames, x_range, y_range, scale, curves, events),
    }


def tab_data(name, frames, panel):
    x_range = panel['x']['range']
    y_range = panel['y']['range']
    events = {'plus': [], 'minus': []}
    for i, f, text in crossings(name, frames):
        events[f['cross']].append({'frame': i, 'at': [sig(f['a1']), sig(f['a2'])], 'text': text})
    return {
        'pair-1': [squeeze(f['lam'][0]) + squeeze(f['lam'][1]) for f in frames],
        'pair-2': [squeeze(f['lam'][2]) + squeeze(f['lam'][3]) for f in frames],
        **{f'pair-{1 + i // 2}{"ab"[i % 2]}': [squeeze(f['lam'][i]) for f in frames] for i in range(4)},
        'k1': {'at': [-3.5, 3.5], 'text': [index_text('k_1', f['k'][0]) for f in frames]},
        'k2': {'at': [-3.5, 3.5], 'text': [index_text('k_2', f['k'][1]) for f in frames]},
        'path': [[sig(f['a1']), sig(f['a2'])] for f in frames],
        'point': [[sig(f['a1']), sig(f['a2'])] for f in frames],
        'region': {'at': [x_range[1], y_range[1]], 'text': [f"region {f['region']}, {SYMBOL[f['region']]}" for f in frames]},
        'plus': events['plus'],
        'minus': events['minus'],
    }


def circle_panel():
    """The unit circle with the axes and the dashed rings at |lambda| = 10 and 100, named in the
    legend under the circle, since at the size of the panel beside the diagram the two rings are
    too close for a name on each. The readouts of k1 and k2 are drawn above the circle."""
    r10, r100 = radius(10), radius(100)
    return {
        'id': 'circle',
        'x': {'range': [-3.5, 3.5]},
        'y': {'range': [-3.5, 3.5]},
        'equal': True,
        'axes': False,
        'size': 0.75,
        'margin': [84, 8, 132, 8],
        'curves': [
            {'points': [[-3.4, 0], [3.4, 0]], 'tone': 'muted', 'width': 1.5},
            {'points': [[0, -3.4], [0, 3.4]], 'tone': 'muted', 'width': 1.5},
            {'circle': [0, 0, round(r100, 4)], 'tone': 'muted', 'width': 1.5, 'dash': [5, 7]},
            {'circle': [0, 0, round(r10, 4)], 'tone': 'muted', 'width': 1.5, 'dash': [5, 7]},
            {'id': 'unit', 'circle': [0, 0, 1], 'tone': 'subtle', 'width': 2.5},
        ],
        'labels': [
            {'at': [1, 0], 'text': '$1$', 'anchor': 'start', 'dx': 6, 'dy': 20, 'tone': 'muted'},
            {'at': [-1, 0], 'text': '$-1$', 'anchor': 'end', 'dx': -6, 'dy': 20, 'tone': 'muted'},
            {'id': 'legend', 'at': [0, -3.5], 'text': r'$|\lambda|$ at radius $(1 + \mathrm{ln}|\lambda|)^{1/2}$', 'dy': 30, 'tone': 'muted'},
            {'id': 'legend-2', 'at': [0, -3.5], 'text': r'$1/\lambda$ mirrored inside', 'dy': 66, 'tone': 'muted'},
            {'id': 'legend-3', 'at': [0, -3.5], 'text': r'dashed at $|\lambda| = 10$ and $100$', 'dy': 102, 'tone': 'muted'},
        ],
    }


def build(scale_all=None):
    tabs = []
    patches = {}
    dropped_all = {}
    for name, file, scale in TABS:
        scale = scale_all or scale
        frames, dropped = branch(name, file)
        frames = continuous(frames)
        dropped_all[name] = dropped
        panel = diagram(name, frames, scale)
        tabs.append({
            'name': name,
            'label': name,
            'values': [round(f['e'], 7) for f in frames],
            'data': tab_data(name, frames, panel),
            'active': [[f"r{f['region']}"] for f in frames],
            'panels': {'diagram': panel},
        })
        patches[name] = panel
        crossed = sum(f['cross'] is not None for f in frames)
        mismatch = sum(region_of(f['a1'], f['a2']) != f['region'] for f in frames if f['e'] > 0 and f['cross'] is None)
        names = sorted(int(l['id'][1:]) for l in panel['labels'] if l['id'].startswith('r'))
        unnamed = sorted({f['region'] for f in frames} - set(names))
        print(f'{name}: {len(frames)} frames, {crossed} on a curve, {len(dropped)} members dropped, '
              f'{mismatch} regions differ from the data, {scale} diagram, regions named {names}'
              + (f', VISITED BUT NOT NAMED {unnamed}' if unnamed else ''))
    first = patches['11P']
    plot = {
        'parameter': {'label': '$e$', 'digits': 4},
        'duration': 12,
        'hold': 2,
        'layout': 'row',
        'panels': [
            circle_panel(),
            {'id': 'diagram', 'size': 1.25, 'margin': [52, 24, 84, 100], **first},
        ],
        # a trace of each multiplier, under the dots of its pair and without the faint whole path,
        # since the four paths are on the unit circle and the real axis, which are drawn already
        'marks': [
            *[{'id': f'pair-{p}{c}', 'panel': 'circle', 'kind': 'trace', 'tone': f'data-{p + 1}', 'width': 3, 'size': 16, 'ghost': False}
              for p in (1, 2) for c in 'ab'],
            {'id': 'pair-1', 'panel': 'circle', 'kind': 'points', 'tone': 'data-2', 'size': 16},
            {'id': 'pair-2', 'panel': 'circle', 'kind': 'points', 'tone': 'data-3', 'size': 16},
            {'id': 'k1', 'panel': 'circle', 'kind': 'label', 'tone': 'data-2', 'anchor': 'start', 'dy': -56},
            {'id': 'k2', 'panel': 'circle', 'kind': 'label', 'tone': 'data-3', 'anchor': 'start', 'dy': -18},
            {'id': 'path', 'panel': 'diagram', 'kind': 'trace', 'tone': 'text', 'width': 3, 'size': 8},
            {'id': 'plus', 'panel': 'diagram', 'kind': 'events', 'tone': 'accent', 'size': 26, 'width': 3, **EVENT['plus']},
            {'id': 'minus', 'panel': 'diagram', 'kind': 'events', 'tone': 'violet', 'size': 26, 'width': 3, **EVENT['minus']},
            {'id': 'point', 'panel': 'diagram', 'kind': 'points', 'tone': 'accent', 'size': 18},
            {'id': 'region', 'panel': 'diagram', 'kind': 'label', 'tone': 'text', 'anchor': 'end', 'dy': -30},
        ],
        'tabs': tabs,
    }
    return plot, dropped_all


def inject(page, text):
    html = page.read_text()
    start = '<script type="application/json" id="stability">'
    i = html.index(start) + len(start)
    j = html.index('</script>', i)
    page.write_text(html[:i] + text + html[j:])


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n", 1)[0])
    parser.add_argument('--scale', choices=['linear', 'asinh'], help='draw every tab of the preview on this scale')
    parser.add_argument('--deck', type=pathlib.Path, help='also write the JSON into the block id="stability" of this deck')
    args = parser.parse_args()
    if args.scale and args.deck:
        parser.error('--deck is not combined with --scale, since the JSON of a --scale run is not the one of stability.json')
    plot, dropped = build(args.scale)
    text = json.dumps(plot, separators=(',', ':'), ensure_ascii=False)
    if not args.scale:
        (HERE / 'stability.json').write_text(text + '\n')
    if PREVIEW.exists():
        inject(PREVIEW, text)
    if args.deck:
        inject(args.deck, text)
        print(f'written into {args.deck}')
    for name, members in dropped.items():
        if members:
            es = ', '.join(f"{m['e']:g}" for m in members)
            print(f'{name}: dropped at e = {es}')
    print(f'{len(text) / 1e3:.0f} kB of JSON')


if __name__ == '__main__':
    main()
