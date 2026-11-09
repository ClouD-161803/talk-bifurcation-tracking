"""A NumPy differential corrector of periodic orbits in the planar CR3BP and ER3BP, which keeps every iterate.

The model is the planar elliptic restricted three-body problem in the rotating-pulsating frame, with
the true anomaly theta as the independent variable, in Szebehely's form: the whole gradient of the
effective potential is divided by 1 + e cos(theta), hence the libration points stay fixed. At e = 0
the model is the planar CR3BP, in which theta is the time. The primary and the secondary lie at
x = -mu and x = 1 - mu, respectively, and every length is in DU.

The state (x, y, x', y') is integrated together with the state transition matrix and, on request,
with its sensitivity to the eccentricity, by an adaptive Dormand-Prince 5(4) integrator vectorized
over a batch of arcs, so that the segments of multiple shooting share one integration. The corrector
solves F(X) = 0 by Newton's method, taking the full step at every iterate, and records the
nodes, the arcs, and the norm of F at every iterate. The continuation functions step a family of
symmetric orbits in the Jacobi constant or in the eccentricity, by natural-parameter or
pseudo-arclength continuation, and record the predictor and every corrector iterate of each step.

This module imports only NumPy. Its orbits are checked against DyLAN in check_dylan.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# the Dormand-Prince 5(4) tableau
_C = np.array([0.0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1.0, 1.0])
_A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0.0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
]
_B5 = np.array([35 / 384, 0.0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0.0])
_B4 = np.array([5179 / 57600, 0.0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40])

TOLERANCE = 1e-12
# a propagation stops when the third body comes this close to the primary or the secondary, in DU
COLLISION = 1e-3
# or this far from the barycenter, in DU, which only a diverging iterate reaches
ESCAPE = 4.0


class PropagationError(RuntimeError):
    """A propagation that collided, escaped, or ran out of steps. When the samples were recorded, the
    elapsed anomalies ``taus`` (m,) and the samples (B, m, 4) up to the failure are kept on it."""

    def __init__(self, message: str, taus: np.ndarray | None = None, samples: np.ndarray | None = None) -> None:
        super().__init__(message)
        self.taus, self.samples = taus, samples


@dataclass(frozen=True)
class Model:
    """The planar ER3BP at the mass ratio mu and the eccentricity e, which is the planar CR3BP at e = 0."""

    mu: float
    e: float = 0.0

    def gradient(self, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """The two components of the gradient at (x, y) of the pseudo-potential (x^2 + y^2)/2 + (1 - mu)/r1 + mu/r2."""
        mu = self.mu
        d1, d2 = x + mu, x - 1.0 + mu
        r13 = (d1 * d1 + y * y) ** 1.5
        r23 = (d2 * d2 + y * y) ** 1.5
        return x - (1.0 - mu) * d1 / r13 - mu * d2 / r23, y - (1.0 - mu) * y / r13 - mu * y / r23

    def jacobi(self, state: np.ndarray) -> np.ndarray:
        """The Jacobi constant C = -2E of the states (..., 4), which is conserved only at e = 0."""
        x, y, vx, vy = np.moveaxis(np.asarray(state, dtype=float), -1, 0)
        mu = self.mu
        rho1 = np.hypot(x + mu, y)
        rho2 = np.hypot(x - 1.0 + mu, y)
        return x * x + y * y + 2.0 * (1.0 - mu) / rho1 + 2.0 * mu / rho2 - vx * vx - vy * vy

    def field(self, theta: np.ndarray, state: np.ndarray) -> np.ndarray:
        """The vector field at the states (B, 4) and the anomalies (B,)."""
        out = np.empty_like(state)
        ox, oy = self.gradient(state[:, 0], state[:, 1])
        w = 1.0 / (1.0 + self.e * np.cos(theta))
        out[:, 0] = state[:, 2]
        out[:, 1] = state[:, 3]
        out[:, 2] = 2.0 * state[:, 3] + w * ox
        out[:, 3] = -2.0 * state[:, 2] + w * oy
        return out

    def rhs(self, theta: np.ndarray, Y: np.ndarray, stm: bool, sens: bool) -> np.ndarray:
        """The derivative in the anomaly of a batch Y (B, n), which holds the state, the STM in row-major
        order when ``stm`` is set, and the sensitivity of the state to e when ``sens`` is set."""
        mu = self.mu
        x, y, vx, vy = Y[:, 0], Y[:, 1], Y[:, 2], Y[:, 3]
        d1, d2 = x + mu, x - 1.0 + mu
        r1s, r2s = d1 * d1 + y * y, d2 * d2 + y * y
        r13, r23 = r1s * np.sqrt(r1s), r2s * np.sqrt(r2s)
        cos = np.cos(theta)
        w = 1.0 / (1.0 + self.e * cos)
        ox = x - (1.0 - mu) * d1 / r13 - mu * d2 / r23
        oy = y - (1.0 - mu) * y / r13 - mu * y / r23
        out = np.empty_like(Y)
        out[:, 0] = vx
        out[:, 1] = vy
        out[:, 2] = 2.0 * vy + w * ox
        out[:, 3] = -2.0 * vx + w * oy
        if not (stm or sens):
            return out
        r15, r25 = r13 * r1s, r23 * r2s
        a = (1.0 - mu) / r13 + mu / r23
        oxx = w * (1.0 - a + 3.0 * (1.0 - mu) * d1 * d1 / r15 + 3.0 * mu * d2 * d2 / r25)
        oyy = w * (1.0 - a + 3.0 * (1.0 - mu) * y * y / r15 + 3.0 * mu * y * y / r25)
        oxy = w * (3.0 * (1.0 - mu) * d1 * y / r15 + 3.0 * mu * d2 * y / r25)
        if stm:
            P = Y[:, 4:20].reshape(-1, 4, 4)
            D = out[:, 4:20].reshape(-1, 4, 4)
            D[:, 0] = P[:, 2]
            D[:, 1] = P[:, 3]
            D[:, 2] = oxx[:, None] * P[:, 0] + oxy[:, None] * P[:, 1] + 2.0 * P[:, 3]
            D[:, 3] = oxy[:, None] * P[:, 0] + oyy[:, None] * P[:, 1] - 2.0 * P[:, 2]
        if sens:
            s = Y[:, -4:]
            # dw is the derivative of w in the eccentricity
            dw = -cos * w * w
            out[:, -4] = s[:, 2]
            out[:, -3] = s[:, 3]
            out[:, -2] = oxx * s[:, 0] + oxy * s[:, 1] + 2.0 * s[:, 3] + dw * ox
            out[:, -1] = oxy * s[:, 0] + oyy * s[:, 1] - 2.0 * s[:, 2] + dw * oy
        return out


@dataclass
class Arcs:
    """The end of a batch of propagations, with the samples of each arc when they were recorded."""

    end: np.ndarray  # (B, 4)
    stm: np.ndarray | None  # (B, 4, 4)
    sens: np.ndarray | None  # (B, 4), the derivative of the end state in the eccentricity
    taus: np.ndarray | None = None  # (m,), the elapsed anomaly at each sample, shared by the batch
    samples: np.ndarray | None = None  # (B, m, 4)


def _combine(weights, ks: list[np.ndarray]) -> np.ndarray:
    out = np.zeros_like(ks[0])
    for b, k in zip(weights, ks, strict=False):
        if b != 0.0:
            out += b * k
    return out


def propagate(
    model: Model,
    theta0: np.ndarray,
    states: np.ndarray,
    span: float,
    *,
    stm: bool = True,
    sens: bool = False,
    record: bool = False,
    tol: float = TOLERANCE,
    max_steps: int = 20_000,
) -> Arcs:
    """Propagates the states (B, 4) from the anomalies theta0 (B,) over one common span of anomaly.

    The batch shares one step, which is controlled on the state of every arc with a relative and an
    absolute tolerance of ``tol``. Raises :class:`PropagationError` when an arc comes within
    COLLISION of the primary or the secondary, passes ESCAPE, or when the step count passes
    ``max_steps``.
    """
    states = np.atleast_2d(np.asarray(states, dtype=float))
    B = len(states)
    theta0 = np.broadcast_to(np.asarray(theta0, dtype=float), (B,)).copy()
    parts = [states]
    if stm:
        parts.append(np.tile(np.eye(4).ravel(), (B, 1)))
    if sens:
        parts.append(np.zeros((B, 4)))
    Y = np.hstack(parts)
    tau, h = 0.0, 1e-3 * math.copysign(1.0, span) if span != 0 else 0.0
    taus, samples = [0.0], [Y[:, :4].copy()]
    k1 = model.rhs(theta0, Y, stm, sens)
    steps = 0

    def fail(message: str) -> PropagationError:
        if not record:
            return PropagationError(message)
        return PropagationError(message, np.array(taus), np.stack(samples, axis=1))

    while abs(tau) < abs(span) * (1 - 1e-15) and span != 0:
        if abs(tau + h) > abs(span):
            h = span - tau
        ks = [k1]
        for i in range(1, 7):
            Yi = Y + h * _combine(_A[i], ks)
            ks.append(model.rhs(theta0 + tau + _C[i] * h, Yi, stm, sens))
        Y5 = Y + h * _combine(_B5, ks)
        err5 = h * _combine(_B5 - _B4, ks)
        scale = tol + tol * np.maximum(np.abs(Y[:, :4]), np.abs(Y5[:, :4]))
        err = float(np.max(np.abs(err5[:, :4]) / scale))
        if not np.isfinite(err):
            raise fail("the integration produced a state that is not finite")
        if err <= 1.0:
            tau += h
            Y = Y5
            k1 = ks[6]
            r1 = np.hypot(Y[:, 0] + model.mu, Y[:, 1])
            r2 = np.hypot(Y[:, 0] - 1.0 + model.mu, Y[:, 1])
            if record:
                taus.append(tau)
                samples.append(Y[:, :4].copy())
            if np.any(np.minimum(r1, r2) < COLLISION):
                raise fail("an arc collided with the primary or the secondary")
            if np.any(np.hypot(Y[:, 0], Y[:, 1]) > ESCAPE):
                raise fail("an arc escaped")
        factor = 0.9 * err**-0.2 if err > 0 else 5.0
        h *= min(5.0, max(0.2, factor))
        steps += 1
        if steps > max_steps:
            raise fail("the integration ran out of steps")
    out = Arcs(
        end=Y[:, :4].copy(),
        stm=Y[:, 4:20].reshape(B, 4, 4).copy() if stm else None,
        sens=Y[:, -4:].copy() if sens else None,
    )
    if record:
        out.taus = np.array(taus)
        out.samples = np.stack(samples, axis=1)
    return out


# multiple shooting


@dataclass(frozen=True)
class Targeting:
    """What the corrector solves, for one model and one initial anomaly.

    With ``kind`` "half", the corrector targets a symmetric orbit, whose arc starts on the x-axis
    with x' = 0 and must end on it with x' = 0 after half a period. With "full", the arc must end at
    its initial state after the whole period. In the CR3BP the period is free and x0 is fixed at
    ``fixed_x0``, and in the ER3BP the period is pinned at 2 pi K and x0 is free.
    """

    model: Model
    kind: str
    period: float  # the full period, which is the first guess when the period is free
    theta0: float = 0.0
    period_free: bool = False
    fixed_x0: float | None = None

    @property
    def arc(self) -> float:
        """The span of the targeted arc, half the period or the whole of it."""
        return self.period / 2 if self.kind == "half" else self.period

    def node0_free(self) -> list[int]:
        """The components of the first node that are free variables."""
        fixed = set()
        if self.kind == "half":
            fixed |= {1, 2}
        elif self.period_free:
            # a phase condition, y0 = 0, since an autonomous orbit can start anywhere along itself
            fixed |= {1}
        if self.fixed_x0 is not None:
            fixed |= {0}
        return [i for i in range(4) if i not in fixed]


@dataclass
class Iterate:
    """One Newton iterate of multiple shooting."""

    nodes: np.ndarray  # (S, 4), the start of each segment
    arc: float  # the span of the targeted arc
    ends: np.ndarray  # (S, 4), the end of each segment
    taus: np.ndarray  # (m,), the elapsed anomaly at the samples of a segment
    samples: np.ndarray  # (S, m, 4)
    F: np.ndarray
    norm: float


@dataclass
class Run:
    """The record of one correction, i.e. its iterates and whether the last one converged. When a
    propagation failed, the last iterate holds the arcs up to the failure and an infinite norm."""

    targeting: Targeting
    segments: int
    iterates: list[Iterate] = field(default_factory=list)
    converged: bool = False
    failure: str | None = None


def _pack(t: Targeting, nodes: np.ndarray, arc: float) -> np.ndarray:
    parts = [nodes[0, t.node0_free()], nodes[1:].ravel()]
    if t.period_free:
        parts.append([arc])
    return np.concatenate(parts)


def _unpack(t: Targeting, X: np.ndarray, template: np.ndarray, arc: float) -> tuple[np.ndarray, float]:
    S = len(template)
    free = t.node0_free()
    nodes = template.copy()
    nodes[0, free] = X[: len(free)]
    nodes[1:] = X[len(free) : len(free) + 4 * (S - 1)].reshape(S - 1, 4)
    if t.period_free:
        arc = float(X[-1])
    return nodes, arc


def _evaluate(t: Targeting, nodes: np.ndarray, arc: float, *, jacobian: bool, record: bool) -> tuple[np.ndarray, np.ndarray | None, Arcs]:
    """F and its Jacobian in the packed free variables, for the nodes (S, 4) of an arc of span ``arc``."""
    S = len(nodes)
    dt = arc / S
    thetas = t.theta0 + dt * np.arange(S)
    arcs = propagate(t.model, thetas, nodes, dt, stm=jacobian, record=record)
    ends = arcs.end
    rows = [ends[i] - nodes[i + 1] for i in range(S - 1)]
    rows.append(ends[-1, [1, 2]] if t.kind == "half" else ends[-1] - nodes[0])
    F = np.concatenate(rows)
    if not jacobian:
        return F, None, arcs
    free = t.node0_free()
    J = np.zeros((len(F), len(free) + 4 * (S - 1) + (1 if t.period_free else 0)))
    f_end = t.model.field(thetas + dt, ends)
    row = 0
    for i in range(S):
        last = i == S - 1
        sel = [1, 2] if (last and t.kind == "half") else [0, 1, 2, 3]
        Phi = arcs.stm[i][sel]
        if i == 0:
            J[row : row + len(sel), : len(free)] = Phi[:, free]
        else:
            c = len(free) + 4 * (i - 1)
            J[row : row + len(sel), c : c + 4] = Phi
        if not last:
            c = len(free) + 4 * i
            J[row : row + 4, c : c + 4] -= np.eye(4)
        elif t.kind == "full":
            J[row : row + 4, : len(free)] -= np.eye(4)[:, free]
        if t.period_free:
            # each segment lasts arc / S, and the CR3BP is autonomous, hence d end_i / d arc = f(end_i) / S
            J[row : row + len(sel), -1] = f_end[i][sel] / S
        row += len(sel)
    return F, J, arcs


def _jacobi_gradient(model: Model, s: np.ndarray) -> np.ndarray:
    ox, oy = model.gradient(np.array([s[0]]), np.array([s[1]]))
    return np.array([2.0 * ox[0], 2.0 * oy[0], -2.0 * s[2], -2.0 * s[3]])


def correct(
    t: Targeting,
    nodes: np.ndarray,
    *,
    arc: float | None = None,
    tol: float = 1e-11,
    max_iterations: int = 12,
    give_up: float = 10.0,
) -> Run:
    """Corrects the first-guess nodes (S, 4) by multiple shooting, and records every iterate.

    The Newton step solves DF dX = -F in the least-squares sense, which is the Newton step of a
    square system and the minimum-norm step otherwise, and the full step is taken. The run
    converges when the norm of F is below ``tol``. It fails when the norm passes ``give_up``, when
    a propagation fails, or after ``max_iterations``.
    """
    nodes = np.array(nodes, dtype=float)
    S = len(nodes)
    arc = t.arc if arc is None else arc
    if t.fixed_x0 is not None:
        nodes[0, 0] = t.fixed_x0
    if t.kind == "half":
        nodes[0, 1] = nodes[0, 2] = 0.0
    elif t.period_free:
        nodes[0, 1] = 0.0
    run = Run(targeting=t, segments=S)
    for _ in range(max_iterations + 1):
        try:
            F, J, arcs = _evaluate(t, nodes, arc, jacobian=True, record=True)
        except PropagationError as exc:
            run.failure = str(exc)
            if exc.samples is not None:
                # the failed iterate, with its arcs up to the failure and an infinite norm
                run.iterates.append(Iterate(nodes.copy(), arc, exc.samples[:, -1], exc.taus, exc.samples, np.full(1, np.inf), math.inf))
            return run
        it = Iterate(nodes.copy(), arc, arcs.end, arcs.taus, arcs.samples, F, float(np.linalg.norm(F)))
        run.iterates.append(it)
        if it.norm < tol:
            run.converged = True
            return run
        if it.norm > give_up or len(run.iterates) > max_iterations:
            run.failure = "the norm of F grew past the limit" if it.norm > give_up else "the iteration limit was reached"
            return run
        dX = np.linalg.lstsq(J, -F, rcond=None)[0]
        nodes, arc = _unpack(t, _pack(t, nodes, arc) + dX, nodes, arc)
    run.failure = "the iteration limit was reached"
    return run


def orbit(model: Model, theta0: float, state: np.ndarray, span: float) -> tuple[np.ndarray, np.ndarray]:
    """The elapsed anomalies (m,) and the states (m, 4) of one propagation from ``state`` at ``theta0``."""
    arcs = propagate(model, np.array([theta0]), np.asarray(state, dtype=float)[None], span, stm=False, record=True)
    return arcs.taus, arcs.samples[0]


def libration_l1(mu: float) -> float:
    """The abscissa of the collinear point L1, between the primary and the secondary."""
    x = 1.0 - mu - (mu / 3.0) ** (1.0 / 3.0)
    for _ in range(50):
        d1, d2 = x + mu, x - 1.0 + mu
        f = x - (1.0 - mu) / d1**2 + mu / d2**2
        x -= f / (1.0 + 2.0 * (1.0 - mu) / d1**3 - 2.0 * mu / d2**3)
    return x


def linear_lyapunov(mu: float, amplitude: float) -> np.ndarray:
    """The first guess (x0, y'0, T/2) of the L1 Lyapunov orbit that crosses the x-axis at L1 - ``amplitude``,
    from the linearized equations at L1."""
    xl = libration_l1(mu)
    c2 = (1.0 - mu) / abs(xl + mu) ** 3 + mu / abs(xl - 1.0 + mu) ** 3
    nu = math.sqrt((2.0 - c2 + math.sqrt(9.0 * c2 * c2 - 8.0 * c2)) / 2.0)
    kappa = (nu * nu + 1.0 + 2.0 * c2) / (2.0 * nu)
    return np.array([xl - amplitude, kappa * nu * amplitude, math.pi / nu])


# continuation


@dataclass
class Step:
    """One continuation step, i.e. the predictor, every corrector iterate, and the member it found."""

    start: np.ndarray  # Y_k, the last member
    tangent: np.ndarray | None  # tau_k, for pseudo-arclength continuation
    predictor: np.ndarray
    iterates: list[np.ndarray]  # the corrector iterates, the predictor first
    norms: list[float]
    converged: bool
    member: np.ndarray | None
    size: float  # the step size of this attempt


@dataclass
class Family:
    """A continuation run, i.e. its steps and the members it found, the seed first. A failed step is
    kept in ``steps``, followed by its retry at half the size."""

    parameter: str
    method: str
    members: list[np.ndarray] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    stopped: str = ""


def symmetric_F(model: Model, theta0: float, Y: np.ndarray, parameter: str, period: float | None) -> tuple[np.ndarray, np.ndarray]:
    """F and its Jacobian DF in Y, for a symmetric orbit that leaves the x-axis at a right angle.

    With ``parameter`` "jacobi", Y = (x0, y'0, T/2, C) in the CR3BP, and F holds y and x' at T/2
    and the Jacobi constant of the start minus C. With "e", Y = (x0, y'0, e) in the ER3BP at the
    pinned ``period``, and F holds y and x' at half the period.
    """
    if parameter == "jacobi":
        x0, vy0, half, C = Y
        s = np.array([x0, 0.0, 0.0, vy0])
        arcs = propagate(model, np.array([theta0]), s[None], half, stm=True)
        end, Phi = arcs.end[0], arcs.stm[0]
        f = model.field(np.array([theta0 + half]), arcs.end)[0]
        g = _jacobi_gradient(model, s)
        F = np.array([end[1], end[2], model.jacobi(s) - C])
        DF = np.array([[Phi[1, 0], Phi[1, 3], f[1], 0.0], [Phi[2, 0], Phi[2, 3], f[2], 0.0], [g[0], g[3], 0.0, -1.0]])
        return F, DF
    x0, vy0, e = Y
    s = np.array([x0, 0.0, 0.0, vy0])
    arcs = propagate(Model(model.mu, e), np.array([theta0]), s[None], period / 2, stm=True, sens=True)
    end, Phi, se = arcs.end[0], arcs.stm[0], arcs.sens[0]
    F = np.array([end[1], end[2]])
    DF = np.array([[Phi[1, 0], Phi[1, 3], se[1]], [Phi[2, 0], Phi[2, 3], se[2]]])
    return F, DF


def newton(fun, Y: np.ndarray, extra=None, tol: float = 1e-11, max_iterations: int = 10, give_up: float = 0.5):
    """Newton's method on ``fun(Y) = (F, DF)``, with an optional extra equation ``extra(Y) = (g, dg)``.

    Returns the iterates (the start first), the norm of the residual at each, and whether the last
    one converged.
    """
    iterates, norms = [Y.copy()], []
    for _ in range(max_iterations + 1):
        try:
            F, DF = fun(Y)
        except PropagationError:
            return iterates, norms, False
        if extra is not None:
            g, dg = extra(Y)
            F, DF = np.append(F, g), np.vstack([DF, dg])
        norms.append(float(np.linalg.norm(F)))
        if norms[-1] < tol:
            return iterates, norms, True
        if norms[-1] > give_up or len(norms) > max_iterations:
            return iterates, norms, False
        Y = Y + np.linalg.lstsq(DF, -F, rcond=None)[0]
        iterates.append(Y.copy())
    return iterates, norms, False


def continue_family(
    model: Model,
    seed: np.ndarray,
    *,
    parameter: str,
    method: str,
    step: float,
    steps: int,
    theta0: float = 0.0,
    period: float | None = None,
    weights: np.ndarray | None = None,
    direction: float = 1.0,
    min_step: float | None = None,
    end: float | None = None,
    stop=None,
    max_jump: float | None = None,
    give_up: float = 5.0,
) -> Family:
    """Continues a family of symmetric orbits from the converged ``seed``, a Y of :func:`symmetric_F`.

    The parameter p is the last entry of Y. With ``method`` "natural", each step adds
    ``direction * h`` to p and corrects X at the new p. With "arclength", each step goes a distance
    h along the unit tangent tau_k of the family and corrects on the hyperplane
    tau_k^T W (Y - Y_k) = h, where the weights W of the norm default to one on every entry of Y.
    The size h starts at ``step``, is halved after a failed corrector, and doubles back toward
    ``step`` after each success. A corrector also fails when its member lies farther from the
    predictor than ``max_jump`` times the W-length of the step, or for a natural step, farther from
    the tangent line of the family at Y_k, which keeps the run on its branch.
    A natural step does not pass p = ``end``. The run stops after ``steps`` members, at ``end``,
    when h falls below ``min_step`` (a sixty-fourth of ``step`` by default), or when ``stop(Y)``
    returns a reason.
    """
    W = np.ones(len(seed)) if weights is None else np.asarray(weights, dtype=float)
    min_step = step / 64 if min_step is None else min_step
    fam = Family(parameter=parameter, method=method, members=[seed.copy()])

    def fun(Yv):
        return symmetric_F(model, theta0, Yv, parameter, period)

    previous = None
    Y = seed.copy()
    h = step
    while len(fam.members) <= steps:
        tau = None
        if method == "natural":
            pred = Y.copy()
            pred[-1] += direction * (h if end is None else min(h, abs(end - Y[-1])))
            row = np.zeros(len(Y))
            row[-1] = 1.0
            length = abs(pred[-1] - Y[-1]) * math.sqrt(W[-1])

            def pin(Yv, p=pred[-1], row=row):
                return Yv[-1] - p, row

            constraint = pin
        else:
            # the tangent spans the null space of DF, and keeps the orientation of the previous one
            tau = np.linalg.svd(fun(Y)[1])[2][-1]
            if previous is None:
                tau = tau * math.copysign(1.0, direction * tau[-1])
            elif tau @ (W * previous) < 0:
                tau = -tau
            tau = tau / math.sqrt(tau @ (W * tau))
            pred = Y + h * tau
            length = h

            Yk = Y.copy()

            def plane(Yv, tau=tau, Yk=Yk, h=h):
                return tau @ (W * (Yv - Yk)) - h, W * tau

            constraint = plane

        iterates, norms, ok = newton(fun, pred, extra=constraint, give_up=give_up)
        member = iterates[-1].copy() if ok else None
        if member is not None and max_jump is not None:
            # a natural member is compared with the tangent line at Y_k, which the predictor ignores
            ref = pred
            if tau is None:
                line = np.linalg.svd(fun(Y)[1])[2][-1]
                ref = Y + line * (pred[-1] - Y[-1]) / line[-1] if abs(line[-1]) > 1e-12 else Y + np.inf
            d = member - ref
            if math.sqrt(d @ (W * d)) > max_jump * length:
                ok, member = False, None
        fam.steps.append(Step(Y.copy(), tau, pred, iterates, norms, ok, member, h))
        if member is None:
            h /= 2
            if h < min_step:
                fam.stopped = "the step fell below the minimum"
                break
            continue
        previous = tau
        Y = member
        fam.members.append(Y.copy())
        h = min(step, 2 * h)
        reason = "the end was reached" if end is not None and method == "natural" and abs(end - Y[-1]) < 1e-12 else ""
        reason = reason or (stop(Y) if stop is not None else "")
        if reason:
            fam.stopped = reason
            break
    return fam
