"""Builds the plot of the stability demo of slides 15 to 17 and 20 from the data in data/stability.

The plot has two panels. In the panel circle, the four in-plane Floquet multipliers of a member are
drawn on the complex plane with the unit circle, and in the panel diagram, the point (a1, a2) of
the same member is drawn in Broucke's stability diagram. The six tabs are the six branches of
families 11, 7 and 8. Run the script with the system python3, from any folder:

    python3 demos/stability/build.py

It writes stability.json next to this file and the same JSON into the inline block of
preview/index.html, and it prints the number of frames of each tab. With --deck PATH, the same JSON
is also written into the block <script type="application/json" id="stability"> of the deck at
PATH, e.g. index.html or a copy of it, and the still plot of the seven regions on linear axes into
its block id="regions". With --scale linear or --scale asinh, every tab of the
preview is drawn on that scale, for the screenshots that compare the two, and stability.json is
left as it is. The two flags are not combined.
"""

import argparse
import cmath
import itertools
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

# the names of Frauenfelder and Moreno, in the markup of the plot, keyed by the region numbers 1 to 7
# of the members in data/stability
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
    """The region number of the point (a1, a2), from the indices, as in data/stability."""
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
    apoapsis, whose two pairs are equal on the real axis at the entry into N and on the unit
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
    scale. A linear view also holds E2, the triangle between (-4, 6), (4, 6), and (0, -2),
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


# the colors of the regions in Fig. 4 of Zimovan-Spreen, Howell, and Davis (2019), sampled from the PDF
# and keyed by the region number, which are drawn faintly under the curves of every diagram
HOWELL = {1: '#ffd7bb', 2: '#c7ebf3', 3: '#d8d8d8', 4: '#f7ef8e', 5: '#ffaec9', 6: '#e4e0f3', 7: '#e4f5af'}
# the opacity of a fill in the dark mode, raised in the light mode by the rule .plot-region.howell of the deck
HOWELL_OPACITY = 0.22


def region_fills(x_range, y_range, scale, n=120):
    """The seven regions as polygons in data coordinates over the view, extended by a tenth of its
    span on each side. Over a range of a1, each region is the band between a lower and an upper
    function of a1, hence its polygon is the lower function sampled forward and the upper one
    backward, evenly in the coordinate of the scale and at the corners a1 = -4, 0, and 4."""
    fwd, back = scale_fn(scale)
    lo, hi = x_range
    ylo, yhi = y_range
    xa, xb = back(lo - 0.1 * (hi - lo)), back(hi + 0.1 * (hi - lo))
    par = lambda a: a * a / 4 + 2
    plus = lambda a: -2 * a - 2
    minus = lambda a: 2 * a - 2
    top_value = max(back(yhi + (yhi - ylo)), par(xa), par(xb))
    bottom_value = min(back(ylo - (yhi - ylo)), minus(xa), plus(xb))
    top = lambda a: top_value
    bottom = lambda a: bottom_value
    bands = {
        1: (-4, 4, lambda a: max(plus(a), minus(a)), par),
        2: (xa, xb, par, top),
        3: (xa, xb, bottom, lambda a: min(plus(a), minus(a))),
        4: (xa, -4, plus, par),
        5: (4, xb, minus, par),
        6: (xa, 0, minus, plus),
        7: (0, xb, plus, minus),
    }
    out = []
    for region, (a, b, lower, upper) in bands.items():
        a, b = max(a, xa), min(b, xb)
        if not a < b:
            continue
        sa, sb = fwd(a), fwd(b)
        m = max(16, math.ceil(n * (sb - sa) / (fwd(xb) - fwd(xa))))
        xs = sorted({a, b, *[c for c in (-4, 0, 4) if a < c < b], *[back(sa + (sb - sa) * i / m) for i in range(1, m)]})
        # a band edge at the top or the bottom of the view is drawn with its two ends only, since a
        # polygon of many collinear vertices is filled with faint seams in Chrome
        edge = lambda f, xs: [xs[0], xs[-1]] if f in (top, bottom) else xs
        points = [[sig(x), sig(lower(x))] for x in edge(lower, xs)] + [[sig(x), sig(upper(x))] for x in edge(upper, xs[::-1])]
        out.append({'id': f'fill-{region}', 'class': 'howell', 'points': points, 'tone': HOWELL[region], 'opacity': HOWELL_OPACITY})
    return out


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
        'regions': region_fills(x_range, y_range, scale),
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
        'region': {'at': [x_range[1], y_range[1]], 'text': [SYMBOL[f['region']] for f in frames]},
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
              f'{mismatch} regions differ from the data, {scale} diagram, regions named {[SYMBOL[r] for r in names]}'
              + (f', VISITED BUT NOT NAMED {[SYMBOL[r] for r in unnamed]}' if unnamed else ''))
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


# ---- the diagram of the slide that introduces it, on linear axes in about the window of Howell's Fig. 4

# the zone of the plot in px, with the bar of the plot hidden by the class bare, and the margin of its
# panel, from which the thumbnails of the multipliers are drawn round on axes of unequal scales
REGIONS_ZONE = (880, 840)
REGIONS_MARGIN = [40, 24, 84, 96]
REGIONS_X = (-8, 8)
REGIONS_Y = (-10, 20)
THUMB = 17


def thumbnail(cx, cy, multipliers, radius=THUMB, ident='thumbs', ring=False):
    """The unit circle, the real axis, and four multipliers, drawn round in a circle of radius px at
    (cx, cy), with the multipliers at their points of on_circle in units of the radius of the circle.
    A multiplier on the circle, of a stable pair, is violet, and one off the circle, of an unstable
    pair, is orange. With ring, the circle has the class ring, from which a circle of the table is
    flown to its row."""
    reach = max(1.6, max(abs(z.real) for z in multipliers) + 0.4)
    w = REGIONS_ZONE[0] - REGIONS_MARGIN[1] - REGIONS_MARGIN[3]
    h = REGIONS_ZONE[1] - REGIONS_MARGIN[0] - REGIONS_MARGIN[2]
    rx = radius * (REGIONS_X[1] - REGIONS_X[0]) / w
    ry = radius * (REGIONS_Y[1] - REGIONS_Y[0]) / h
    at = lambda z: [sig(cx + rx * z.real, 4), sig(cy + ry * z.imag, 4)]
    circle = [at(cmath.exp(2j * math.pi * i / 64)) for i in range(65)]
    out = [
        {'id': ident, 'points': [at(complex(-reach, 0)), at(complex(reach, 0))], 'tone': 'muted', 'width': 1.5},
        {'id': ident, 'points': circle, 'tone': 'subtle', 'width': 1.5, **({'class': 'ring'} if ring else {})},
    ]
    tone = lambda z: 'violet' if abs(abs(z) - 1) < 1e-9 else 'accent'
    out += [{'id': ident, 'points': [at(z), at(z)], 'tone': tone(z), 'width': 6} for z in multipliers]
    return out


# the order in which the regions are filled and classified, as in the table of the slide, and the
# point from which the fill of each spreads
REGION_ORDER = [1, 2, 3, 4, 5, 6, 7]
SPREAD_FROM = {1: (0, 1), 2: (0, 12), 3: (0, -7), 4: (-6.6, 12.1), 5: (6.6, 12.1), 6: (-5.6, 1.5), 7: (5.6, 1.5)}
SPREAD_SECONDS = 1.8
# the seconds of a move of the point between two regions, for the first crossing of a bifurcation
# and for each further one
FIRST_MOVE, NEXT_MOVE = 2.6, 1.6
MOVE_FRAMES = 48


def multipliers_of(k):
    """The two multipliers of the index k, i.e. the roots of lam^2 - k lam + 1 = 0."""
    r = cmath.sqrt(k * k - 4)
    return [(k + r) / 2, (k - r) / 2]


def on_circle(lam):
    """The multiplier drawn on the unit circle of the slide, at the radius (1 + ln|lam|)^(1/2) and
    mirrored inside for |lam| < 1, so that a multiplier far from the circle is still in view."""
    rho = abs(lam)
    radius = math.sqrt(1 + math.log(rho)) if rho >= 1 else 1 / math.sqrt(1 - math.log(rho))
    return lam / rho * radius


def stable_tone(z):
    return 'violet' if abs(abs(z) - 1) < 1e-9 else 'accent'


def segment_tones(zs):
    """The tone of each frame of a trace for the segment that starts at it, violet where both ends of
    the segment are on the unit circle and orange otherwise, and the tone of the last frame for it."""
    on = [stable_tone(z) == 'violet' for z in zs]
    return ['violet' if a and b else 'accent' for a, b in zip(on, on[1:])] + [stable_tone(zs[-1])]


def kind_of(k1, k2):
    """Whether each index is elliptic, and whether the two are complex."""
    elliptic = lambda k: abs(k.imag) < 1e-12 and abs(k.real) < 2
    return elliptic(complex(k1)), elliptic(complex(k2)), abs(complex(k1).imag) > 1e-12


def crossings_of(path, n=400):
    """The parameters in (0, 1) at which the kinds of the indices along path change, i.e. at which a
    pair meets at 1 or -1, or the two pairs meet, found by bisection to 1e-13."""
    out, last = [], kind_of(*path(0))
    for i in range(1, n + 1):
        now = kind_of(*path(i / n))
        if now != last:
            lo, hi = (i - 1) / n, i / n
            while hi - lo > 1e-13:
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if kind_of(*path(mid)) == last else (lo, mid)
            out.append(hi)
        last = now
    return out


def snapped(k1, k2):
    """The indices at a crossing set to their exact values, i.e. 2 or -2, or the two equal, so that the
    multipliers are drawn at 1 or -1, or at one point of the circle."""
    k1, k2 = complex(k1), complex(k2)
    if abs(k1 - k2) < 1e-4:
        mean = complex(((k1 + k2) / 2).real)
        return mean, mean
    fix = lambda k: complex(math.copysign(2, k.real)) if abs(k.imag) < 1e-9 and abs(abs(k.real) - 2) < 1e-6 else k
    return fix(k1), fix(k2)


def follow(previous, current):
    """The multipliers of current in the order nearest to the points of previous on the circle of
    the slide, so that each trace follows one multiplier from frame to frame."""
    return list(min(itertools.permutations(current), key=lambda order: sum(abs(on_circle(a) - on_circle(b)) for a, b in zip(previous, order))))


def move_tab(name, path, seconds, marks=None):
    """A tab in which the point is moved through the diagram while its multipliers are moved on the
    unit circle, each leaving a trace in violet while on the circle and in orange off it. path maps
    s in [0, 1] to the two indices, and the point is eased in and out. The frame nearest to each
    crossing is moved onto it, hence the traces of a pair that meets at 1 or -1 pass through it, and
    a segment is violet only where both of its ends are on the circle."""
    ease = lambda s: s * s * (3 - 2 * s)
    params = [ease(i / (MOVE_FRAMES - 1)) for i in range(MOVE_FRAMES)]
    for c in crossings_of(path):
        i = min(range(1, MOVE_FRAMES - 1), key=lambda j: abs(params[j] - c))
        params[i] = c
    trace, lams = [], []
    for s in params:
        k1, k2 = snapped(*path(s))
        trace.append([sig((-(k1 + k2)).real, 4), sig((2 + k1 * k2).real, 4)])
        now = multipliers_of(k1) + multipliers_of(k2)
        lams.append(follow(lams[-1], now) if lams else now)
    data = {'point': {'points': trace, 'ghost': 0}}
    for j in range(4):
        zs = [on_circle(f[j]) for f in lams]
        data[f'm{j + 1}'] = {'points': [[sig(z.real, 4), sig(z.imag, 4)] for z in zs], 'ghost': 0, 'tones': segment_tones([f[j] for f in lams])}
    tab = {
        'name': name, 'label': name, 'values': list(range(MOVE_FRAMES)),
        'times': [sig(seconds * i / (MOVE_FRAMES - 1), 4) for i in range(MOVE_FRAMES)],
        'data': data,
    }
    if marks:
        tab['panels'] = {'circle': {'curves': circle_curves() + [
            {'circle': [sig(z.real, 4), sig(z.imag, 4), 0.09], 'tone': 'muted', 'width': 2} for z in marks]}}
    return tab


def circle_curves():
    return [
        {'points': [[-2.1, 0], [2.1, 0]], 'tone': 'muted', 'width': 1.5},
        {'circle': [0, 0, 1], 'tone': 'subtle', 'width': 2},
    ]


def lin(a, b):
    """The indices along a straight line from the pair a to the pair b."""
    return lambda s: (a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]))


def collide(c, q0, q1):
    """The indices c +- sqrt(q), with q from q0 to q1, which are equal at q = 0 and complex past it."""
    return lambda s: (c + cmath.sqrt(q0 + s * (q1 - q0)), c - cmath.sqrt(q0 + s * (q1 - q0)))


def bifurcation_tabs():
    """One tab per crossing of the table of bifurcations, in its order: the tangent and the
    period-doubling crossings of k = 2 and k = -2 from each side, the crossings of k = -1 and k = 0
    inside E2, and the collisions of the indices on the parabola."""
    root = lambda deg: [cmath.exp(1j * math.radians(deg)), cmath.exp(-1j * math.radians(deg))]
    return [
        move_tab('tan-1', lin((1.0, -0.6), (3.2, -0.6)), FIRST_MOVE),
        move_tab('tan-2', lin((1.0, -3.2), (3.2, -3.2)), NEXT_MOVE),
        move_tab('tan-3', lin((4.2, 2.3), (5.8, 0.8)), NEXT_MOVE),
        move_tab('pd-1', lin((-1.0, 0.6), (-3.2, 0.6)), FIRST_MOVE),
        move_tab('pd-2', lin((-1.0, 3.2), (-3.2, 3.2)), NEXT_MOVE),
        move_tab('pd-3', lin((-4.2, -2.3), (-5.8, -0.8)), NEXT_MOVE),
        move_tab('p3', lin((-0.3, 1.2), (-1.7, 1.2)), FIRST_MOVE, root(120)),
        move_tab('p4', lin((0.8, -1.2), (-0.6, -1.2)), FIRST_MOVE, root(90)),
        move_tab('hopf', collide(-0.4, 1.2, -1.2), FIRST_MOVE),
        move_tab('mhopf-1', collide(3.2, 0.8, -2.5), FIRST_MOVE),
        move_tab('mhopf-2', collide(-3.2, 0.8, -2.5), NEXT_MOVE),
    ]


# ---- the circles of the rows of the table of regions

# the window of the circle of a row in its units, drawn at ROW_UNIT px per unit while its row is in
# focus and at 0.4 of that size otherwise, and the tones of the multipliers lam_1, 1/lam_1, lam_2,
# and 1/lam_2, two reds for the first pair and two blues for the second
ROW_X, ROW_Y = 2.3, 1.8
PAIR_TONES = ['pair-1a', 'pair-1b', 'pair-2a', 'pair-2b']
LAMBDAS = [r'$\lambda_1$', r'$1/\lambda_1$', r'$\lambda_2$', r'$1/\lambda_2$']
# the seconds of a wiggle, and of the hold after it in which its traces are faded out
WIGGLE_SECONDS, WIGGLE_FRAMES = 4.5, 90
FADE_SECONDS, HOLD_FRAMES = 1.2, 6
LABEL_GAP = 0.42


def h(k):
    """The log of the modulus of the multiplier of the real index k, with |k| > 2."""
    return math.acosh(abs(k) / 2)


def first(kind, u):
    """The first multiplier of a pair: e^(i u) for an elliptic pair, u in degrees, and +-e^u for a
    positive or a negative hyperbolic pair."""
    if kind == 'E':
        return cmath.exp(1j * math.radians(u))
    return complex(math.copysign(math.exp(u), 1 if kind == 'H+' else -1))


# the kinds of the two pairs of each region, named in the order of the symbol of the region, the
# parameters of the pairs at the state drawn in the row, and the range over which each is wiggled.
# the ranges are the allowed ones, cut where the point would leave the window of the diagram. in N,
# the second pair is the conjugate of the first, hence the parameters are the angle in degrees and
# the log of the modulus of lam_1, and the two wiggles turn and stretch it
ROWS = {
    1: (('E', 'E'), (45, 135), (3, 177), (3, 177)),
    2: (('N', 'N'), (60, math.log(2)), (3, 177), (math.log(1.02), math.log(4))),
    3: (('H-', 'H+'), (h(3), h(3)), (h(2.02), h(3.9)), (h(2.02), h(3.9))),
    4: (('H+', 'H+'), (h(2.3), h(4)), (h(2.02), h(3.9)), (h(2.02), h(5.6))),
    5: (('H-', 'H-'), (h(2.3), h(4)), (h(2.02), h(3.9)), (h(2.02), h(5.6))),
    6: (('E', 'H+'), (120, h(3)), (3, 177), (h(2.02), h(8.9))),
    7: (('E', 'H-'), (60, h(3)), (3, 177), (h(2.02), h(8.9))),
}


def row_multipliers(region, u1, u2):
    """lam_1, 1/lam_1, lam_2, and 1/lam_2 of a row at the parameters u1 and u2."""
    kinds = ROWS[region][0]
    if kinds[0] == 'N':
        lam = math.exp(u2) * cmath.exp(1j * math.radians(u1))
        return [lam, 1 / lam, lam.conjugate(), 1 / lam.conjugate()]
    a, b = first(kinds[0], u1), first(kinds[1], u2)
    return [a, 1 / a, b, 1 / b]


def point_of(lams):
    """The point (a1, a2) of the four multipliers, from the indices of the two pairs."""
    k1, k2 = lams[0] + lams[1], lams[2] + lams[3]
    return (-(k1 + k2)).real, (2 + k1 * k2).real


def label_place(region, j):
    """The anchor of the label of multiplier j of a row, and the point of the label at the point z of
    the multiplier on the circle. A label is put outside the circle beside a multiplier on it, along
    the radius beside a complex one, and above for the first pair or below for the second beside a
    real one, on the side of the multiplier away from the other of its pair."""
    kind = ROWS[region][0][j // 2]
    if kind in ('E', 'N'):
        def at(z):
            r = abs(z)
            out = 1 + LABEL_GAP if kind == 'E' else r + LABEL_GAP if r > 1 else r - LABEL_GAP
            return z / r * out
        return 'middle', at
    outer = j % 2 == 0
    y = LABEL_GAP if j < 2 else -LABEL_GAP
    start = (kind == 'H+') == outer
    return ('start' if start else 'end'), (lambda z: complex(z.real + (0.04 if start else -0.04), y))


def wiggle_path(u0, lo, hi, n=WIGGLE_FRAMES):
    """The parameter at n frames from u0 to lo, to hi, and back to u0, eased at each end of a leg, and
    the frames of each leg in proportion to its length."""
    ease = lambda s: s * s * (3 - 2 * s)
    legs = [(u0, lo), (lo, hi), (hi, u0)]
    total = sum(abs(b - a) for a, b in legs)
    counts = [max(4, round((n - 1) * abs(b - a) / total)) for a, b in legs]
    counts[1] += (n - 1) - sum(counts)
    out = [u0]
    for (a, b), c in zip(legs, counts):
        out += [a + (b - a) * ease(i / c) for i in range(1, c + 1)]
    return out


def xy(z, digits=4):
    return [sig(z.real, digits), sig(z.imag, digits)]


def row_panels():
    return [{
        'id': f'row-{k}', 'margin': [0, 0, 0, 0], 'equal': True, 'axes': False,
        'x': {'range': [-ROW_X, ROW_X]}, 'y': {'range': [-ROW_Y, ROW_Y]},
        'curves': [
            {'points': [[-2.2, 0], [2.2, 0]], 'tone': 'muted', 'width': 2},
            {'circle': [0, 0, 1], 'class': 'ring', 'tone': 'subtle', 'width': 2.5},
        ],
    } for k in ROWS]


def row_marks():
    marks = []
    for k in ROWS:
        marks += [{'id': f'r{k}-m{j + 1}', 'panel': f'row-{k}', 'kind': 'trace', 'tone': PAIR_TONES[j],
                   'size': 12, 'width': 2, 'ghost': False, 'fade': FADE_SECONDS} for j in range(4)]
        marks += [{'id': f'r{k}-l{j + 1}', 'panel': f'row-{k}', 'kind': 'label', 'tone': 'text',
                   'anchor': label_place(k, j)[0], 'class': 'lambda'} for j in range(4)]
    return marks


def row_tabs():
    """The tabs of the table of regions. In rows-st, the multipliers of every row are violet on the
    circle and orange off it, as in the thumbnails of the diagram, and in rows-pl they are all
    plain. In row-k, the multipliers of row k are in the tones of their pairs, with their names, and
    the point of row k is drawn on the diagram. In row-k-w1 and row-k-w2, the first or the second
    pair is wiggled over its range, and the point is moved on the diagram with a trace in the tone
    of the pair, faded out after FADE_SECONDS."""
    still = {k: row_multipliers(k, *ROWS[k][1]) for k in ROWS}
    for k, lams in still.items():
        assert region_of(*point_of(lams)) == k, f'the state of row {k} is outside its region'

    def plain(tones):
        return {f'r{k}-m{j + 1}': {'points': [xy(on_circle(still[k][j]))], 'ghost': 0, 'tones': [tones(k, j)]} for k in ROWS for j in range(4)}

    def tab(name, data, frames=1, times=None):
        out = {'name': name, 'label': name, 'values': list(range(frames)), 'data': data}
        if times:
            out['times'] = times
        return out

    tabs = [
        tab('rows-st', plain(lambda k, j: stable_tone(still[k][j]))),
        tab('rows-pl', plain(lambda k, j: 'subtle')),
    ]
    for k in ROWS:
        others = {key: v for key, v in plain(lambda k, j: 'subtle').items() if not key.startswith(f'r{k}-')}

        def drawn(frames):
            data = dict(others)
            for j in range(4):
                anchor, at = label_place(k, j)
                zs = [on_circle(f[j]) for f in frames]
                data[f'r{k}-m{j + 1}'] = {'points': [xy(z) for z in zs], 'ghost': 0}
                data[f'r{k}-l{j + 1}'] = {'at': [xy(at(z), 3) for z in zs], 'text': LAMBDAS[j]}
            return data

        data = drawn([still[k]])
        data['w-dot'] = [[sig(v, 4) for v in point_of(still[k])]]
        tabs.append(tab(f'row-{k}', data))
        (u1, u2), r1, r2 = ROWS[k][1:]
        for w, (lo, hi) in ((1, r1), (2, r2)):
            path = wiggle_path(u1 if w == 1 else u2, lo, hi)
            frames = [row_multipliers(k, u, u2) if w == 1 else row_multipliers(k, u1, u) for u in path]
            frames += [frames[-1]] * HOLD_FRAMES
            points = [point_of(f) for f in frames]
            for f, (a1, a2) in zip(frames, points):
                assert region_of(a1, a2) == k and REGIONS_X[0] < a1 < REGIONS_X[1] and REGIONS_Y[0] < a2 < REGIONS_Y[1], f'wiggle {w} of row {k} leaves its region or the window'
            data = drawn(frames)
            data['w-dot'] = [[sig(a1, 4), sig(a2, 4)] for a1, a2 in points]
            data[f'w-trail-{w}'] = {'points': [[sig(a1, 4), sig(a2, 4)] for a1, a2 in points], 'ghost': 0}
            n = len(path)
            times = [sig(WIGGLE_SECONDS * i / (n - 1), 4) for i in range(n)]
            times += [sig(WIGGLE_SECONDS + (FADE_SECONDS + 0.1) * i / HOLD_FRAMES, 4) for i in range(1, HOLD_FRAMES + 1)]
            tabs.append(tab(f'row-{k}-w{w}', data, len(frames), times))
    return tabs


def regions_plot():
    """The plot of Broucke's diagram on linear axes, with the unit circle beside it and a circle for
    each row of the table of regions. The curves are drawn on one after another, and each region is
    filled from a point, named, and given a thumbnail of its multipliers at a step of its own. H++
    and H-- are too thin for a name, which is put above them with an arrow, and the thumbnail of each
    is beside its name. In the tabs of the rows, the pairs of a row are wiggled one at a time while
    its point is moved on the diagram, and in the tabs of the table of bifurcations, a point is moved
    across a curve while its multipliers are moved on the circle."""
    x_range, y_range = REGIONS_X, REGIONS_Y
    px_x = (x_range[1] - x_range[0]) / (REGIONS_ZONE[0] - REGIONS_MARGIN[1] - REGIONS_MARGIN[3])
    px_y = (y_range[1] - y_range[0]) / (REGIONS_ZONE[1] - REGIONS_MARGIN[0] - REGIONS_MARGIN[2])
    line = lambda f: [[x, sig(f(x))] for x in (-9, 9)]
    par = [[sig(-9 + 18 * i / 180, 4), sig((-9 + 18 * i / 180) ** 2 / 4 + 2, 4)] for i in range(181)]
    name = lambda i, x, y: {'id': f'name-{i}', 'at': [x, y], 'text': SYMBOL[i], 'tone': 'text', 'delay': 0.9}
    curve_label = lambda key, x, y, text, delay, **kw: {'id': key, 'class': key, 'at': [x, y], 'text': text, 'tone': 'subtle', 'delay': delay, **kw}

    # a leader from just under a name down to a tip inside its region, with a filled head of 7 by 9 px.
    # the name is faded in at 0.9 s, the leader is drawn down from 1.3 s, and the head is shown at
    # 1.8 s, when the leader reaches it
    def arrow(i, x, top, tip):
        hx, hy = 3.5 * px_x, 9 * px_y
        head = {'id': f'name-{i}', 'points': [[sig(x - hx, 4), sig(tip + hy, 4)], [x, tip], [sig(x + hx, 4), sig(tip + hy, 4)]],
                'tone': 'subtle', 'opacity': 1, 'delay': 1.8}
        return head, {'id': f'name-{i}', 'points': [[x, top], [x, sig(tip + hy, 4)]], 'tone': 'subtle', 'width': 1.5, 'draw': 0.5, 'delay': 1.3}

    heads, leaders = zip(arrow(4, -7, 16.7, 13.1), arrow(5, 7, 16.7, 13.1))
    # each thumbnail is drawn at the state of its row in the table, from which its circle is flown
    # to the row, and N has a second thumbnail at its right, at the multipliers of the first negated
    shown = lambda k, sign=1: [on_circle(sign * z) for z in row_multipliers(k, *ROWS[k][1])]
    thumbs = (
        thumbnail(0, -0.6, shown(1), radius=15, ident='thumb-1', ring=True)
        + thumbnail(-3.2, 9.5, shown(2), ident='thumb-2', ring=True)
        + thumbnail(3.2, 9.5, shown(2, -1), ident='thumb-2')
        + thumbnail(0, -5.8, shown(3), ident='thumb-3', ring=True)
        + thumbnail(-4.9, 17.6, shown(4), ident='thumb-4', ring=True)
        + thumbnail(4.9, 17.6, shown(5), ident='thumb-5', ring=True)
        + thumbnail(-5.6, -2.2, shown(6), ident='thumb-6', ring=True)
        + thumbnail(5.6, -2.2, shown(7), ident='thumb-7', ring=True)
    )
    fills = []
    for r in region_fills(x_range, y_range, 'linear'):
        i = int(r['id'].split('-')[1])
        assert region_of(*SPREAD_FROM[i]) == i, f'the fill of region {i} spreads from outside it'
        fills.append({**r, 'spread': SPREAD_SECONDS, 'from': list(SPREAD_FROM[i])})
    diagram = {
        'id': 'regions',
        'margin': REGIONS_MARGIN,
        'x': {'range': list(x_range), 'ticks': [{'at': v, 'text': f'${v}$'} for v in (-8, -4, 0, 4, 8)], 'title': '$a_1$'},
        'y': {'range': list(y_range), 'ticks': [{'at': v, 'text': f'${v}$'} for v in (-10, -5, 0, 5, 10, 15, 20)], 'title': '$a_2$'},
        'regions': fills + list(heads),
        'curves': [
            {'id': 'mult-3', 'points': line(lambda a: a + 1), 'tone': 'muted', 'width': 2, 'dash': [10, 8]},
            {'id': 'mult-4', 'points': line(lambda a: 2), 'tone': 'muted', 'width': 2, 'dash': [2, 7]},
            {'id': 'kequal', 'class': 'kequal', 'points': par, 'tone': 'subtle', 'width': 2.5, 'draw': 1.2},
            {'id': 'kplus', 'class': 'kplus', 'points': line(lambda a: -2 * a - 2), 'tone': 'subtle', 'width': 2.5, 'draw': 1.0, 'delay': 1.3},
            {'id': 'kminus', 'class': 'kminus', 'points': line(lambda a: 2 * a - 2), 'tone': 'subtle', 'width': 2.5, 'draw': 1.0, 'delay': 2.4},
            *leaders,
            *thumbs,
        ],
        'labels': [
            name(1, 0, 1.2),
            name(2, 0, 14),
            name(3, 0, -8.6),
            name(4, -7, 17.6),
            name(5, 7, 17.6),
            name(6, -5.6, 4.4),
            name(7, 5.6, 4.4),
            curve_label('kequal', 6.0, 12.2, '$k_1 = k_2$', 1.2, anchor='end'),
            curve_label('kplus', 3.35, -7.6, '$k = 2$', 2.3, anchor='start'),
            curve_label('kminus', -3.35, -7.6, '$k = -2$', 3.4, anchor='end'),
            {'id': 'mult-3', 'at': [-7.8, -4.6], 'text': '$k = -1$', 'tone': 'muted', 'anchor': 'start'},
            {'id': 'mult-4', 'at': [-7.8, 2.75], 'text': '$k = 0$', 'tone': 'muted', 'anchor': 'start'},
        ],
    }
    circle = {
        'id': 'circle', 'margin': [8, 8, 8, 8], 'equal': True, 'axes': False,
        'x': {'range': [-2.2, 2.2]}, 'y': {'range': [-2.2, 2.2]},
        'curves': circle_curves(),
        'labels': [
            {'at': [1, 0], 'text': '$1$', 'tone': 'muted', 'anchor': 'start', 'dx': 4, 'dy': 18},
            {'at': [-1, 0], 'text': '$-1$', 'tone': 'muted', 'anchor': 'end', 'dx': -4, 'dy': 18},
        ],
    }
    return {
        'parameter': {'label': '', 'digits': 0},
        'duration': 1,
        'panels': [diagram, circle] + row_panels(),
        'marks': [
            {'id': 'point', 'panel': 'regions', 'kind': 'trace', 'tone': 'text', 'size': 14, 'width': 2.5, 'ghost': False},
            {'id': 'w-trail-1', 'panel': 'regions', 'kind': 'trace', 'tone': 'pair-1a', 'size': 0, 'width': 3, 'ghost': False, 'fade': FADE_SECONDS},
            {'id': 'w-trail-2', 'panel': 'regions', 'kind': 'trace', 'tone': 'pair-2a', 'size': 0, 'width': 3, 'ghost': False, 'fade': FADE_SECONDS},
            {'id': 'w-dot', 'panel': 'regions', 'kind': 'points', 'tone': 'text', 'size': 14},
            *[{'id': f'm{j}', 'panel': 'circle', 'kind': 'trace', 'tone': 'violet', 'size': 11, 'width': 2, 'ghost': False} for j in range(1, 5)],
            *row_marks(),
        ],
        'tabs': [{'name': 'regions', 'label': 'regions', 'values': [0], 'data': {}}] + row_tabs() + bifurcation_tabs(),
    }


def inject(page, text, block='stability'):
    html = page.read_text()
    start = f'<script type="application/json" id="{block}">'
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
        regions = json.dumps(regions_plot(), separators=(',', ':'), ensure_ascii=False)
        inject(args.deck, regions, 'regions')
        print(f'written into {args.deck}, with {len(regions) / 1e3:.0f} kB of JSON for the block id="regions"')
    for name, members in dropped.items():
        if members:
            es = ', '.join(f"{m['e']:g}" for m in members)
            print(f'{name}: dropped at e = {es}')
    print(f'{len(text) / 1e3:.0f} kB of JSON')


if __name__ == '__main__':
    main()
