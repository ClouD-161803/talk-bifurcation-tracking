"""Computes the Earth-Moon L1 Lyapunov family and its stability for the Lyapunov-to-halo slide.

The script imports pydylancore and the demonstration script lyapunov_family_stability_diagram.py
of dylan-core, and reuses its settings and functions. It continues the family with
generate_lyapunov_family(), takes the stability coefficients and indices of every member from
collect_family_stability(), and finds the Jacobi constant of the Lyapunov-to-halo bifurcation with
find_bifurcation_energy(). The drawn orbits are the members chosen as in draw_orbit_family(), each
integrated over one period with RK4 as there. Run it with the venv of DyLAN and the builds of
vestini/master on the path, as given in data/README.md:

    <python of DyLAN> data/lyapunov/lyapunov_family_dylan.py data/lyapunov/l1-lyapunov.json

It writes one JSON document, read by demos/stability/build.py and figures/draw_lyapunov_figures.py,
which do not import DyLAN. The fields are described under its key readme.
"""

import json
import pathlib
import subprocess
import sys

import numpy as np

import pydylancore

BINDING = pathlib.Path(pydylancore.__file__).resolve().parent
sys.path.insert(0, str(BINDING / "demonstration_scripts"))

import lyapunov_family_stability_diagram as demo  # noqa: E402

# the number of points kept on each drawn orbit, evenly spaced in the steps of the integrator
ORBIT_POINTS = 240

README = (
    "The Earth-Moon L1 Lyapunov family of the DyLAN demonstration script "
    "lyapunov_family_stability_diagram.py, continued in energy from the energy of L1 plus 0.01 in steps of 1e-4. "
    "Units are the nondimensional units of the CR3BP. jacobi_constant is C = -2 energy. a1 and a2 are "
    "Broucke's coefficients of the reduced characteristic polynomial, i.e. the reduced BrouckePoint of DyLAN, "
    "with the trivial pair at 1 divided out. k1 is the in-plane stability index and k2 the out-of-plane one, "
    "in the order of stability_indices of DyLAN, as in the demonstration script. region is the number of "
    "StabilityRegion of DyLAN, 4 for doubly positive hyperbolic and 6 for elliptic and positive hyperbolic. "
    "bifurcation is the member nearest the crossing of k2 = 2 and the Jacobi constant of the crossing, "
    "interpolated linearly in energy. orbits holds the drawn members, each as x, y, and z over one period "
    "in the rotating frame, with x measured from the barycenter."
)


def checkout_commits():
    """The branch and the commit of astrodynamics-core, dylan-core, and dylan in the worktree set."""
    commits = {}
    for name in ("ac", "dc", "d"):
        root = BINDING.parents[2] / name
        git = ["git", "-C", str(root), "rev-parse"]
        commits[name] = {
            "path": str(root),
            "branch": subprocess.run(git + ["--abbrev-ref", "HEAD"], capture_output=True, text=True).stdout.strip(),
            "commit": subprocess.run(git + ["HEAD"], capture_output=True, text=True).stdout.strip(),
        }
    return commits


def orbit_track(eom, member):
    """The states of a member over one period, as in draw_orbit_family() of the demonstration script."""
    integrator = pydylancore.integrators.RK4()
    integrator.set_eom(eom)
    integrator.set_time(0.0, member.period)
    integrator.evaluate(member.initial_state)
    states = np.asarray(integrator.get_states())
    keep = np.unique(np.linspace(0, len(states) - 1, ORBIT_POINTS).round().astype(int))
    return [[round(float(v), 7) for v in states[keep, axis]] for axis in range(3)]


def main():
    output = pathlib.Path(sys.argv[1])
    earth = pydylancore.Body("Earth")
    moon = pydylancore.Body("Moon")
    eom = pydylancore.eom.CR3BP(earth, moon)
    libration_point = pydylancore.enum.LibrationPoint.L1

    orbit = demo.generate_lyapunov_family(eom, libration_point)
    family, energies, alphas, betas, indices = demo.collect_family_stability(orbit, eom)
    bifurcation_energy = demo.find_bifurcation_energy(energies, indices[:, 1])
    if bifurcation_energy is None:
        raise RuntimeError("k2 does not cross 2 once along the family")
    bifurcation_index = int(np.argmin(np.abs(energies - bifurcation_energy)))

    members = []
    for i in range(len(family)):
        member = family[i]
        point = member.stability.reduced
        members.append({
            "index": i,
            "energy": float(member.energy),
            "jacobi_constant": float(-2.0 * member.energy),
            "period": float(member.period),
            "initial_state": [float(v) for v in member.initial_state],
            "a1": float(alphas[i]),
            "a2": float(betas[i]),
            "k1": float(indices[i, 0]),
            "k2": float(indices[i, 1]),
            "region": int(point.region),
            "region_name": point.region.name,
            "symplecticity_residual": float(point.symplecticity_residual),
        })

    drawn = np.linspace(0, len(family) - 1, demo.NUMBER_OF_ORBITS_TO_PLOT).round().astype(int)
    drawn = sorted({int(i) for i in drawn} | {bifurcation_index})
    orbits = [{"index": i, "jacobi_constant": members[i]["jacobi_constant"], "xyz": orbit_track(eom, family[i])} for i in drawn]

    equilibrium, _ = eom.find_equilibrium_point(libration_point)
    document = {
        "readme": README,
        "commits": checkout_commits(),
        "libration_point": [float(v) for v in np.asarray(equilibrium)[:3]],
        "number_of_members": len(members),
        "bifurcation": {"index": bifurcation_index, "jacobi_constant": float(-2.0 * bifurcation_energy)},
        "members": members,
        "orbits": orbits,
    }
    output.write_text(json.dumps(document, indent=1) + "\n")
    worst = max(m["symplecticity_residual"] for m in members)
    regions = sorted({m["region_name"] for m in members})
    print(f"{len(members)} members, C from {members[0]['jacobi_constant']:.6f} to {members[-1]['jacobi_constant']:.6f}, "
          f"bifurcation at C = {document['bifurcation']['jacobi_constant']:.6f} near member {bifurcation_index}, "
          f"largest symplecticity residual {worst:.2e}, regions {regions}, {len(orbits)} orbits drawn")


if __name__ == "__main__":
    main()
