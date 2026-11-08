"""A script that embeds a tycho scene in the deck of the bifurcation talk as a viewer element.

The scene is read from a scene document NAME.tys and from the data container NAME.tyd next to it.
The kiosk <tycho-viewer> element written by build_embed of pytycho is put in place of whatever lies
between the two marker comments

    <!-- tycho-viewer start, LABEL, written by embed_scene.py -->
    <!-- tycho-viewer end, LABEL -->

of the deck. Without --controls the viewer is a kiosk, which hides every control and plays from the
initial state of the scene. With --controls the viewer shows its tabs, sliders, switches, and
transport, for a scene that the presenter works by hand, and it starts paused. Such a viewer is
also lean, i.e. the Add panel group, the icons of the panel heads, the frame and rate readouts, the
View group, and Export are hidden, so that only the controls of the scene are seen. With --panels
as well, the viewer is lean="panels", which keeps the Add panel group and the icons of the panel
heads, for a scene in which the presenter adds panels by hand. A variable is started at a value
other than its default with --set VARIABLE=VALUE. With --style, the viewer is
placed in slide pixels, and without it the viewer takes the zone of the slide layout. With
--keep-theme, the viewer keeps its dark theme when the deck is switched to light mode, for a scene
whose white marks would not be seen on a light background. With --show VARIABLE..., only the controls
of those variables and the transport are shown, and --show alone keeps the transport only, so that a
slide offers only the controls spoken on it, while the page of the scene keeps them all. The six viewers of the deck are written by

    uv run --project /Users/claudiovestini/git/tycho/code python \
        /Users/claudiovestini/git/talks/bifurcation-tracking/tools/deck/embed_scene.py \
        /Users/claudiovestini/git/talks/bifurcation-tracking/index.html \
        /Users/claudiovestini/git/tycho/code/examples/broucke/broucke.tys "the Broucke page" \
        --style "left: 120px; top: 190px; width: 1680px; height: 640px"

    uv run --project /Users/claudiovestini/git/tycho/code python \
        /Users/claudiovestini/git/talks/bifurcation-tracking/tools/deck/embed_scene.py \
        /Users/claudiovestini/git/talks/bifurcation-tracking/index.html \
        /Users/claudiovestini/git/talks/bifurcation-tracking/demos/frames/frames.tys "the frames scene" \
        --controls --panels

    uv run --project /Users/claudiovestini/git/tycho/code python \
        /Users/claudiovestini/git/talks/bifurcation-tracking/tools/deck/embed_scene.py \
        /Users/claudiovestini/git/talks/bifurcation-tracking/index.html \
        /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/correction.tys \
        "the correction scene, slide 10" --controls --keep-theme \
        --style "left: 1150px; top: 110px; width: 730px; height: 880px" \
        --set case=lyapunov --set system=cr3bp --set targeting=half --set S=1 --set guess=near --set others=false \
        --show targeting

    uv run --project /Users/claudiovestini/git/tycho/code python \
        /Users/claudiovestini/git/talks/bifurcation-tracking/tools/deck/embed_scene.py \
        /Users/claudiovestini/git/talks/bifurcation-tracking/index.html \
        /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/correction.tys \
        "the correction scene, slide 11" --controls --keep-theme \
        --style "left: 1150px; top: 110px; width: 730px; height: 880px" \
        --set case=lyapunov --set system=cr3bp --set targeting=full --set S=16 --set guess=farther \
        --set ghosts=false --set others=false --show others

    uv run --project /Users/claudiovestini/git/tycho/code python \
        /Users/claudiovestini/git/talks/bifurcation-tracking/tools/deck/embed_scene.py \
        /Users/claudiovestini/git/talks/bifurcation-tracking/index.html \
        /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/continuation.tys \
        "the continuation scene, slide 12" --controls --keep-theme \
        --style "left: 1150px; top: 110px; width: 730px; height: 880px" \
        --set family=lyapunov --set step=medium --set pens=natural --show family

    uv run --project /Users/claudiovestini/git/tycho/code python \
        /Users/claudiovestini/git/talks/bifurcation-tracking/tools/deck/embed_scene.py \
        /Users/claudiovestini/git/talks/bifurcation-tracking/index.html \
        /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/continuation.tys \
        "the continuation scene, slide 13" --controls --keep-theme \
        --style "left: 1150px; top: 110px; width: 730px; height: 880px" \
        --set family=family11 --set step=medium --set pens=both --show

The Broucke page is placed below the h2 of its slide and above the caption. Each viewer of slides 10
to 13 is placed beside the text column of its slide, in a box larger than the zone of the layout,
which is too small for the controls and two panels side by side. The values set on slide 10 are the
defaults of the scene, and they are set again so that the slide keeps its state if a rebuild of the
scene changes a default.
"""

import argparse
import json
from pathlib import Path

import pytycho as ty


def value_of(text: str, variable: dict) -> object:
    """The value of a --set for a variable of the scene, checked against the kind of the variable."""
    kind = variable["kind"]
    if kind == "toggle":
        if text not in ("true", "false"):
            raise SystemExit(f"a toggle is set to true or false, not {text!r}")
        return text == "true"
    if kind == "choice":
        if text not in variable["values"]:
            raise SystemExit(f"a choice is set to one of {variable['values']}, not {text!r}")
        return text
    return float(text)


def main() -> None:
    parser = argparse.ArgumentParser(description="Embeds a tycho scene in the deck as a viewer element.")
    parser.add_argument("deck", type=Path)
    parser.add_argument("scene", type=Path, help="the scene document, with its .tyd next to it")
    parser.add_argument("label", help="the label in the two marker comments")
    parser.add_argument("--style", help="the style attribute of the viewer, in slide pixels")
    parser.add_argument("--set", action="append", default=[], metavar="VARIABLE=VALUE")
    parser.add_argument("--controls", action="store_true", help="show the controls, for a scene the presenter works by hand")
    parser.add_argument("--panels", action="store_true", help="with --controls, keep the Add panel group and the icons of the panel heads")
    parser.add_argument("--show", nargs="*", metavar="VARIABLE", help="with --controls, show the controls of these variables only")
    parser.add_argument("--keep-theme", action="store_true", help="keep the dark theme of the viewer when the deck is switched to light mode")
    args = parser.parse_args()
    if args.panels and not args.controls:
        parser.error("--panels is given only with --controls, since a kiosk viewer does not show the Add panel group")

    # without --set, the text of the scene is embedded as it was written
    text = args.scene.read_text(encoding="utf-8")
    document: dict = json.loads(text)
    for item in args.set:
        name, _, value = item.partition("=")
        if name not in document["variables"]:
            raise SystemExit(f"{args.scene} does not have a variable {name!r}")
        document["initial"].setdefault("variables", {})[name] = value_of(value, document["variables"][name])
    if args.show is not None:
        for name in args.show:
            if name not in document["variables"]:
                raise SystemExit(f"{args.scene} does not have a variable {name!r}")
        document["controls"] = [c for c in document["controls"] if c["kind"] == "transport" or c.get("variable") in args.show]
    container = args.scene.with_suffix(".tyd").read_bytes()
    scene = document if args.set or args.show is not None else text
    lean = "panels" if args.panels else args.controls
    element = ty.build_embed(
        scene, container, theme="dark", kiosk=not args.controls, lean=lean, class_="zone", style=args.style, data_keep_theme=args.keep_theme
    )

    start = f"<!-- tycho-viewer start, {args.label}, written by embed_scene.py -->"
    end = f"<!-- tycho-viewer end, {args.label} -->"
    page = args.deck.read_text(encoding="utf-8")
    if page.count(start) != 1 or page.count(end) != 1:
        raise SystemExit(f"the deck does not have the marker comments of {args.label!r} once each")
    head, rest = page.split(start, 1)
    _, tail = rest.split(end, 1)
    args.deck.write_text(f"{head}{start}\n{element}\n{end}{tail}", encoding="utf-8")
    print(f"wrote {len(element)} characters of viewer for {args.label} into {args.deck}")


if __name__ == "__main__":
    main()
