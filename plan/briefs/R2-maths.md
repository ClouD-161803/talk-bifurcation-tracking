# R2: the maths, the notation, and the numbers

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/R-COMMON.md` first. Your lens is every display, every inline symbol, and every number on the slides and in the notes.

## What to check

1. The notation: the registry `references/notation.md` of the `writing` skill at `/Users/claudiovestini/.config/princeton/claude-home/skills/writing/`, the `## Terms` sections of `plan/grill-record.md`, and the symbols listed under Rules in COMMON.md. Check that one symbol is used per object across the deck. The objects are the state, the constraint vector, the state transition matrix, the monodromy matrix, the tangent, the step, the segment count S, and the period 2πK. They are also the true anomaly θ, the mass ratio μ, the effective potential, the Jacobi constant C, the libration points as `\LL{n}`, the coefficients a1 and a2, and the indices k. Say where a symbol is used before it is defined, and where two symbols are used for one thing.
2. The style of `plan/thesis-style-guide.md` for every display: a lead-in sentence as one fragment, the display whole as the next, the interpreting sentence as the next, and a highlight fragment whose colored symbol was shown before. Say where a display is shown in parts, where a lead-in is missing, and where a highlight is put on a symbol that has not been shown.
3. The truth of every claim and the value of every number. Check each number against `data/`, `demos/corrector/CHECKS.md`, the README files of `demos/`, and `data/check-144.md`, e.g. the fold of family 11 at e = 0.45387, the flip at e = 0.29464, the multipliers on slide 14, and the perilune of the transfer. Derive a claim yourself where you can, e.g. det(M − I) = (2 − k1)(2 − k2) from the quartic at λ = 1, the flip at k = −2, and the pairs λ and 1/λ, and say which claims you could not check.
4. The rendering: in the PDF pages and the check PNGs, a display cut at the right edge, a symbol too small to read, or a macro that did not render, i.e. a raw `\LL` or `\class` in the text.

Do not judge the wording or the attention, which other reviewers do.

## The report

Write `plan/judges/deck/r2-maths.md` by R-COMMON.md. For a number, give your value and how you got it.
