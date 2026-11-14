"""Polylines of Broucke's families 7, 8 and 11 for the data-driven backdrops of the talk.

The members are read from broucke-input.tyd of the TyCHO Broucke example, whose SHA-256 is checked by
read_input() of examples/broucke/build.py. The pulsating positions are taken to the barycentric
inertial frame through the frame tree declared in declare_frames() of build.py.

The members of a family are ordered so that a staggered trace sweeps through the family once, i.e. the
branch FIRST_BRANCH from its largest e down to 0, then the other branch from 0 up. The member at e = 0
of the second branch is the orbit at e = 0 of the first, begun on the other side of the x axis, hence
its pulsating record, which would be drawn over the same curve, is left out.

Each record is marked with the key begin. A record with begin "golden" is begun at a fraction of the
length of its polyline from the golden-ratio sequence, the same fraction in both frames, so that the
starts of a drawing traced at once are spread evenly along it. A record with begin "ray" is begun
where the orbit crosses the ray from the secondary at the polar angle START_ANGLE of its family, so
that the members of a staggered drawing are begun one after another at one place on the slide, and
are traced there in the same direction. Every member has an inertial record
with begin "golden", and two pulsating records, one with each begin. The key thin is 1 on every other
member of the sweep of a family, counted from the member at e = 0, and 0 on the others, so that a
drawing can be thinned to half its members. The samples of a member are kept jointly in both frames,
at least one every MAX_STEP of true anomaly, and more wherever a stored sample is farther than
TOLERANCE from the chord between two kept samples in either frame. Each record is given a clock t by clock_of(), from 0 to 1
in proportion to the length along its polyline and eased over the fraction EASE of the length at each
end, hence every strand is traced in the same time at an even pace. The result is written next to this script to broucke-families.json, and to
broucke-families.js, i.e. the same JSON wrapped in Beeson.strands( and ); for a deck opened from the
disk.

Run it with the Python of the TyCHO checkout, from any folder:

    uv run --project /Users/claudiovestini/git/tycho/code python export_broucke_families.py
"""

import hashlib
import importlib.util
import itertools
import json
import pathlib
import sys

import numpy as np
import pytycho as ty
from pytycho._evaluate import Context, FrameTree
from pytycho._thin import _segment_distance

TYCHO = pathlib.Path("/Users/claudiovestini/git/tycho/code")
BROUCKE = TYCHO / "examples" / "broucke"
OUTPUT = pathlib.Path(__file__).resolve().parent / "broucke-families"
MEMBERS_PER_BRANCH = 12
# the largest distance of a stored sample from the chord drawn over it, nondimensional. 3e-4 is a sixth
# of a slide pixel at 520 px per unit, the scale of the inertial drawing on slide 2 of the deck, which
# is the largest scale at which a member is drawn
TOLERANCE = 3e-4
# the largest step of true anomaly between two kept samples, in rad. a strand is traced at a constant
# speed along each chord, hence the changes of speed of a trace are kept too brief to be seen
MAX_STEP = 2 * np.pi / 180
DIGITS = 5
# the digits of the clock t, one more than those of the positions, so that the clock is still
# increasing along the shortest chords of the longest strands
CLOCK_DIGITS = 6
GOLDEN = (np.sqrt(5.0) - 1.0) / 2.0
FIRST_BRANCH = "periapsis"
# the polar angle about the secondary, in deg, of the ray on which the pulsating records of a family
# are begun. on slides 3, 9 and 18 of the deck, the starts of consecutive members are then at most
# 23 px apart, and their headings at most 9 deg apart. families 7 and 8 are begun at the upper left
# of the drawing. a ray of family 11 between 130 and 170 deg misses the outer arc of the left lobe
# of its apoapsis members and crosses them where they are traced the other way, hence family 11 is
# begun at 175 deg, on the outer arc of the left lobe just above the x axis
START_ANGLE = {7: 160.0, 8: 160.0, 11: 175.0}
# the fraction of the trace of a strand over which its tip is sped up from rest, and as much at the end
# over which it is slowed to rest
EASE = 0.1
# the largest distance, nondimensional, between the two orbits at e = 0 of a family in the pulsating
# frame, for one of them to be left out as the same curve. a tenth of TOLERANCE, hence the two cannot
# be told apart in any drawing
TWIN_TOLERANCE = TOLERANCE / 10

FRAMES = {"pulsating": "rotating-pulsating", "inertial": "barycentric-inertial"}
# the records of a member, as pairs of a frame and a begin
KINDS = (("pulsating", "ray"), ("pulsating", "golden"), ("inertial", "golden"))


def load_build():
    """examples/broucke/build.py as a module, imported without writing bytecode into the checkout."""
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("broucke_build", BROUCKE / "build.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def evenly_spaced_members(eccentricities, count):
    """The indices of the members closest to count values of e evenly spaced over the branch."""
    targets = np.linspace(eccentricities.min(), eccentricities.max(), count)
    return sorted({int(np.argmin(np.abs(eccentricities - t))) for t in targets})


def ray_start(points, center, angle):
    """The index of the stored sample at the crossing of a closed orbit with a ray, farthest from its start.

    The ray is begun at center and pointed at the polar angle given, in rad. The index is the one of the
    sample nearest to the crossing, from 0 to len(points) - 2, since the last sample is the first.
    """
    direction = np.array([np.cos(angle), np.sin(angle)])
    side = (points - center) @ np.array([-direction[1], direction[0]])
    j = np.nonzero(side[:-1] * side[1:] < 0)[0]
    f = side[j] / (side[j] - side[j + 1])
    along = (points[j] + f[:, None] * (points[j + 1] - points[j]) - center) @ direction
    assert (along > 0).any(), "the orbit does not cross the ray"
    i = int(np.argmax(np.where(along > 0, along, -np.inf)))
    return int(j[i] + (f[i] > 0.5)) % (len(points) - 1)


def length_start(points, fraction):
    """The index of the stored sample of a closed orbit nearest to the fraction given of its length.

    The length is measured along the polyline through the stored samples from the first, and the
    index is from 0 to len(points) - 2, since the last sample is the first.
    """
    s = np.r_[0.0, np.cumsum(np.hypot(*np.diff(points, axis=0).T))]
    return int(np.argmin(np.abs(s[:-1] / s[-1] - fraction)))


def polyline_distance(a, b):
    """The largest distance of a point of a from the polyline through the points of b."""
    start, chord = b[:-1], np.diff(b, axis=0)
    squared = np.maximum(np.einsum("ij,ij->i", chord, chord), 1e-300)
    worst = 0.0
    for p in a:
        f = np.clip(np.einsum("ij,ij->i", p - start, chord) / squared, 0.0, 1.0)
        worst = max(worst, float(np.min(np.linalg.norm(start + f[:, None] * chord - p, axis=1))))
    return worst


def read_members(build, container, tree):
    """The chosen members of every branch, in the order of their records in the file.

    Each member is a dict of its family, branch, e, mu, theta0, the true
    anomaly ``theta`` of each stored sample in rad, ``frames``, its planar positions per frame,
    ``starts``, the index of the stored sample at which its record is begun per pair of a frame and a
    begin, ``twin``, true
    for the member at e = 0 of the second branch, and ``thin``, 1 on every other member of the sweep of
    its family from the member at e = 0 and 0 on the others. The stored samples run over one period from
    theta0 to theta0 + 2 pi, with the last equal to the first.
    """
    members = []
    for family, mu in build.FAMILIES:
        for branch, theta0 in build.BRANCHES:
            sid = f"family-{family}-{branch}"
            offsets = container.view(f"{sid}/offsets")
            # the positions in the container are planar, of shape (samples, 2)
            planar = np.asarray(container.view(f"{sid}/positions"))
            positions = np.hstack([planar, np.zeros((len(planar), 1))])
            channels = {n: container.view(f"{sid}/channels/{n}") for n in build.CHANNELS}
            eccentricities = np.asarray(container.view(f"{sid}/parameters/eccentricity"))
            chosen = evenly_spaced_members(eccentricities, MEMBERS_PER_BRANCH)
            for i in chosen:
                rows = slice(int(offsets[i]), int(offsets[i + 1]))
                member_channels = {n: np.asarray(v[rows]) for n, v in channels.items()}
                context = Context({"mu": mu}, member_channels.get, rows.stop - rows.start)
                frames = {
                    name: tree.transform(positions[rows], "rotating-pulsating", frame, context)[:, :2]
                    for name, frame in FRAMES.items()
                }
                theta = member_channels["true_anomaly"]
                # rolled() needs a closed orbit of one period of the primaries
                assert abs(theta[-1] - theta[0] - 2 * np.pi) < 1e-9, f"{sid} member {i} is not of period 2 pi"
                for name, p in frames.items():
                    assert np.linalg.norm(p[-1] - p[0]) < 1e-6, f"{sid} member {i} is not closed in {name}"
                members.append(
                    {
                        "family": int(family),
                        "branch": branch,
                        "e": float(eccentricities[i]),
                        "mu": mu,
                        "theta0": theta0,
                        "theta": theta,
                        "frames": frames,
                    }
                )
            print(f"family {family:>2} {branch:9}: e = {', '.join(f'{eccentricities[i]:.3f}' for i in chosen)}")
    families = [int(f) for f, _ in build.FAMILIES]
    members.sort(key=lambda m: (families.index(m["family"]), *sweep_key(m)))
    for member in members:
        member["twin"] = member["e"] == 0.0 and member["branch"] != FIRST_BRANCH
    # the twin is left out of the sweep, in which the member at e = 0 is the one of FIRST_BRANCH
    for family in families:
        sweep = [m for m in members if m["family"] == family and not m["twin"]]
        (zero,) = (i for i, m in enumerate(sweep) if m["e"] == 0.0)
        for i, member in enumerate(sweep):
            member["thin"] = int((i - zero) % 2 == 0)
    for twin in (m for m in members if m["twin"]):
        twin["thin"] = 0
    # the records of the k-th member begun at "golden" are begun at the fraction k GOLDEN, modulo 1, of
    # the length of its polyline in each frame, hence the starts of the members drawn together are
    # spread evenly along the drawing. starts spread evenly in true anomaly would be bunched along the
    # inertial frame, in which the orbit is scaled by the separation rho over the period, and the upper
    # half of a drawing traced at once would be filled ahead of the lower. k counts the members of thin
    # 1 first, in the order of the file, so that the members of a thinned drawing are a run of the
    # sequence and are spread as evenly as the whole family
    for k, member in enumerate(sorted(members, key=lambda m: m["thin"] != 1)):
        fraction = (k * GOLDEN) % 1.0
        member["starts"] = {
            **{(name, "golden"): length_start(p, fraction) for name, p in member["frames"].items()},
            ("pulsating", "ray"): ray_start(
                member["frames"]["pulsating"],
                np.array([1.0 - member["mu"], 0.0]),
                np.radians(START_ANGLE[member["family"]]),
            ),
        }
    for twin in (m for m in members if m["twin"]):
        (first,) = (m for m in members if m["family"] == twin["family"] and m["e"] == 0.0 and not m["twin"])
        a, b = (m["frames"]["pulsating"] for m in (twin, first))
        gap = max(polyline_distance(a, b), polyline_distance(b, a))
        assert gap < TWIN_TOLERANCE, f"the orbits at e = 0 of family {twin['family']} are {gap:.1e} apart"
        print(f"family {twin['family']:>2}: the orbits at e = 0 of both branches are {gap:.1e} apart in the pulsating frame")
    return members


def sweep_key(member):
    """The branch FIRST_BRANCH by decreasing e, then the other branch by increasing e."""
    first = member["branch"] == FIRST_BRANCH
    return (0, -member["e"]) if first else (1, member["e"])


def rolled(theta, k):
    """The order of the stored samples of a closed orbit begun at sample k, and the true anomaly in this order.

    The samples before k are moved to the end, with 2 pi added to their true anomaly, so that theta is
    still increasing and the last sample is still the first. Every frame can be rolled alone, since the
    inertial position at theta + 2 pi is the one at theta for a period of 2 pi.
    """
    m = len(theta)
    return np.r_[k : m - 1, 0 : k + 1], np.r_[theta[k : m - 1], theta[: k + 1] + 2 * np.pi]


def kept_samples(frames, theta, forced):
    """The increasing indices of the samples kept of one member, jointly in every frame of frames.

    The samples forced are kept, and one at least every MAX_STEP of theta, from the first to the last.
    Then, by the Douglas-Peucker algorithm in each frame, the farthest stored sample from the chord
    between two kept samples is kept while it is farther than TOLERANCE, until a pass over the frames
    keeps nothing new.
    """
    m = len(theta)
    grid = np.linspace(theta[0], theta[-1], int(np.ceil((theta[-1] - theta[0]) / MAX_STEP)) + 1)
    kept = set(np.clip(np.searchsorted(theta, grid), 0, m - 1).tolist()) | {0, m - 1} | set(forced)
    while True:
        added = set()
        anchors = sorted(kept)
        for p in frames:
            for a, b in itertools.pairwise(anchors):
                stack = [(a, b)]
                while stack:
                    i, j = stack.pop()
                    if j - i < 2:
                        continue
                    d = _segment_distance(p[i + 1 : j], p[i], p[j])
                    worst = int(np.argmax(d))
                    if d[worst] > TOLERANCE:
                        k = i + 1 + worst
                        added.add(k)
                        stack += [(i, k), (k, j)]
        if added <= kept:
            return np.array(sorted(kept))
        kept |= added


def clock_of(points):
    """The time of each point of a strand traced in a unit time, from 0 at the first point to 1 at the last.

    The tip is moved at a constant speed along the polyline, except over the fraction EASE of the time at
    each end, in which its speed is raised linearly from rest and lowered linearly to rest.
    """
    s = np.r_[0.0, np.cumsum(np.hypot(*np.diff(points, axis=0).T))]
    u = s / s[-1]
    top = 1.0 / (1.0 - EASE)
    eased = top * EASE / 2
    return np.where(
        u < eased,
        np.sqrt(2 * EASE * u / top),
        np.where(u > 1 - eased, 1 - np.sqrt(2 * EASE * np.clip(1 - u, 0, None) / top), u / top + EASE / 2),
    )


def records_of(members):
    """The records of each member for each pair of a frame and a begin of KINDS, in this order.

    The samples are kept by kept_samples(), with the starts of the records forced, and each record is
    begun at the start of its frame and begin. The pulsating records of a member marked as a twin are
    left out.
    """
    records = []
    for member in members:
        theta, starts = member["theta"], member["starts"]
        forced = {starts[kind] for kind in KINDS}
        kept = kept_samples(list(member["frames"].values()), theta, forced)
        for name, begin in KINDS:
            if name == "pulsating" and member["twin"]:
                continue
            p = member["frames"][name]
            order, theta_rolled = rolled(theta, starts[name, begin])
            mask = np.isin(order, kept)
            points = p[order][mask]
            t = np.round(clock_of(points), CLOCK_DIGITS)
            assert np.all(np.diff(t) >= 0) and t[0] == 0 and t[-1] == 1
            records.append(
                {
                    "family": member["family"],
                    "branch": member["branch"],
                    "frame": name,
                    "begin": begin,
                    "thin": member["thin"],
                    "e": round(member["e"], 6),
                    "mu": member["mu"],
                    "theta0": member["theta0"],
                    "bbox": [round(float(v), DIGITS) for v in (*points.min(axis=0), *points.max(axis=0))],
                    "t": t.tolist(),
                    "theta": np.round(theta_rolled[mask], DIGITS).tolist(),
                    "points": np.round(points, DIGITS).tolist(),
                }
            )
    return records


def bodies_of(members, tree):
    """The positions of the primary m1 and the secondary m2 at theta = 0, where rho = 1 - e, per member."""
    bodies = []
    for member in members:
        e = member["e"]
        at_periapsis = Context({"mu": member["mu"]}, {"true_anomaly": np.zeros(1), "rho": np.array([1.0 - e])}.get, 1)
        bodies.append(
            {
                "family": member["family"],
                "branch": member["branch"],
                "e": round(e, 6),
                "mu": member["mu"],
                **{
                    name: {
                        body: [round(float(v), DIGITS) for v in tree.body_position(body, frame, at_periapsis)[0, :2]]
                        for body in ("m1", "m2")
                    }
                    for name, frame in FRAMES.items()
                },
            }
        )
    return bodies


def readme():
    """The readme key of the written file."""
    second = next(b for b in ("periapsis", "apoapsis") if b != FIRST_BRANCH)
    return [
        "Members of Broucke's families 7, 8 and 11 of the planar ER3BP, as polylines for the backdrops of the talk.",
        "Each entry of 'families' is one member in one frame: family (7, 8 or 11), branch ('periapsis' for the "
        "members that start on the x axis at true anomaly theta0 = 0, 'apoapsis' for theta0 = pi), frame, begin "
        "('ray' or 'golden', the point at which the record is begun, described below), thin (1 or 0, described "
        "below), the eccentricity e of the primaries, the mass ratio mu, theta0 in rad, bbox as [xmin, ymin, xmax, "
        "ymax], t as the time of each point, theta as the true anomaly in rad of each point, and points as [x, y] "
        "over one period, from theta[0] to theta[0] + 2 pi, with the last point equal to the first.",
        "The time t runs from 0 at the first point to 1 at the last, in proportion to the length along the "
        f"polyline, except over the first and the last {EASE:g} of the time, in which the tip is sped up from rest "
        "and slowed to rest. Every strand is thus traced in the same time at an even pace.",
        "The members are ordered by family, and within a family so that a staggered trace sweeps through it "
        f"once, i.e. the {FIRST_BRANCH} branch from its largest e down to 0, then the {second} branch from 0 up. The "
        f"member at e = 0 of the {second} branch is the orbit at e = 0 of the {FIRST_BRANCH} branch, begun on the other "
        "side of the x axis, hence it does not have a pulsating record.",
        "A record with begin 'golden' is begun at a fraction of the length of its polyline, measured from the point "
        "at theta0, from the golden-ratio sequence over the members, with the same fraction in both frames, so that "
        "the starts of a drawing traced at once are spread evenly along it. The members with thin 1 take the first "
        "fractions of the sequence, and the others the next. A record with begin 'ray' is begun where the orbit "
        "crosses the ray from the secondary m2 at the polar angle "
        + ", ".join(f"{a:g} deg for family {f}" for f, a in list(START_ANGLE.items())[:-1])
        + ", and {1:g} deg for family {0}".format(*list(START_ANGLE.items())[-1])
        + ", at the crossing farthest from m2, so that the members of a staggered trace are begun one after another "
        "at one place and are traced there in the same direction. Every member has an inertial record with begin "
        "'golden', and two pulsating records, one with each begin. The two records of a member with begin 'golden' "
        "are begun at the same fraction of their lengths, hence at different samples. The records of a member hold the "
        "same samples, begun at different points, "
        "hence their lists theta hold the same values, rolled and shifted by 2 pi.",
        "The key thin is 1 on every other member of the order above within a family, counted from the member at "
        f"e = 0 of the {FIRST_BRANCH} branch, which has thin 1, and 0 on the other members. A drawing selected "
        "with thin=1 thus holds about half the members, spread evenly over the family. The member at e = 0 of the "
        f"{second} branch is left out of this count and has thin 0.",
        "Frame 'pulsating' is the rotating-pulsating frame (x, y), in which the primary m1 is fixed at (-mu, 0) and "
        "the secondary m2 at (1 - mu, 0). Frame 'inertial' is the barycentric inertial frame (xi, eta), i.e. the "
        "pulsating position scaled by the separation rho = (1 - e^2) / (1 + e cos theta) and rotated by theta about "
        "the barycenter, with the x axis of both frames on the line of apsides at theta = 0. Lengths are "
        "nondimensional, in units of the semi-major axis of the relative orbit of the primaries.",
        "Each entry of 'bodies' gives the positions of m1 and m2 at theta = 0 in both frames, for one member.",
        f"About {MEMBERS_PER_BRANCH} members a branch are chosen evenly spaced in e. The samples of a member are kept "
        f"jointly in both frames, at least one every {np.degrees(MAX_STEP):g} degrees of true anomaly, and more wherever "
        f"the computed orbit is farther than {TOLERANCE:g} from the chord, with coordinates rounded to {DIGITS} decimals.",
    ]


def written(document):
    """The document as a script for Beeson.strands, with one record per line."""
    lines = ["Beeson.strands({"]
    keys = list(document)
    for n, key in enumerate(keys):
        value, comma = document[key], "," if n < len(keys) - 1 else ""
        if isinstance(value, list) and value and isinstance(value[0], dict):
            rows = [json.dumps(v, separators=(",", ":")) for v in value]
            lines += [f'  "{key}": [', *[f"    {r}," for r in rows[:-1]], f"    {rows[-1]}", f"  ]{comma}"]
        else:
            lines.append(f'  "{key}": {json.dumps(value)}{comma}')
    return "\n".join([*lines, "});"]) + "\n"


def main():
    build = load_build()
    input_path = BROUCKE / "broucke-input.tyd"
    container = build.read_input(input_path)
    scene = ty.Scene(title="Broucke backdrops")
    build.declare_frames(scene)
    tree = FrameTree(scene._frames, scene._bodies)
    members = read_members(build, container, tree)

    document = {
        "readme": readme(),
        "source": {
            "container": str(input_path),
            "sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
            "script": str(pathlib.Path(__file__).resolve()),
        },
        "families": records_of(members),
        "bodies": bodies_of(members, tree),
    }
    OUTPUT.with_suffix(".json").write_text(json.dumps(document, separators=(",", ":")) + "\n")
    OUTPUT.with_suffix(".js").write_text(written(document))
    for path in (OUTPUT.with_suffix(".json"), OUTPUT.with_suffix(".js")):
        print(f"wrote {len(document['families'])} polylines to {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
