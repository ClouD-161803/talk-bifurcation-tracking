"""Continuation of Broucke's family 11 at periapsis in eccentricity with PyDyLAN, and the stability of a member."""

import math

import numpy as np
import pydylancore as dc

el = dc.enum.StateElements
earth, moon = dc.Body("Earth"), dc.Body("Moon")
moon.mass = earth.mass  # mu = 0.5
seed = np.array([-0.07084826, 0.0, 0.0, 0.0, 0.82832745, 0.0])  # Broucke's circular member at e = 0

# period 2 pi in true anomaly, 1 revolution of the primary and the secondary and 1 of the spacecraft, from periapsis
orbit = dc.periodic_orbit.EllipticPeriodicOrbit(dc.eom.ER3BP(earth, moon, 0.46), seed, 2 * math.pi, 1, 1, 0.0)
orbit.set_differential_corrector_information(
    np.array([el.x, el.vy]), np.array([el.x, el.z, el.vy, el.vz]), np.zeros(6), 6, 50, 1.0, 1e-10, False
)
orbit.integration_tolerance = 1e-12

info = orbit.get_continuation_parameters()
# the reproduction used natural_parameter, so that the members fall on Broucke's tabulated e
info.continuation_method = dc.enum.ContinuationMethod.pseudo_arc_length
info.step_size = 0.005
orbit.set_continuation_information(info, 10)  # at most 10 steps, cut short for the slide
orbit.set_record_family(True)
orbit.solve_for_orbit()

family = orbit.get_orbit_family()
last = len(family) - 1
eom = dc.eom.ER3BP(earth, moon, family[last].parameter_value)
stability = family.compute_member_stability(last, eom, integration_tolerance=1e-12)
point = stability.horizontal
print(family[last].parameter_value, point.first_coefficient, point.second_coefficient, point.region)
