# VizClix — landing page prototype

Aerial photography and film for real estate. A new business stream of
[Polycrayons](https://www.polycrayons.com).

Live preview: https://vijay-protos.github.io/vizclix/

## What this is
A working front-end prototype. The signature moment is a real-time 3D drone
(Three.js) flown by a single scroll-driven timeline: it flies the property in
the opening sequence, then escorts the reader down the page and lands at the
enquiry form.

## Status
Prototype. Business facts on the page are marked `[ to confirm ]` and the
enquiry form is not wired to a backend. Project imagery is Polycrayons studio
work, shown until VizClix shoots are delivered.

## Running locally
    python3 -m http.server 8765
    open http://localhost:8765/

ES modules need HTTP; opening the file directly will not work.

## Layout
    index.html          markup and copy
    css/site.css        tokens and layout
    js/main.js          scroll timeline, loader, motion preference
    js/scene.js         3D world, camera rig, section stations
    js/drone.js         procedural drone model
    vendor/three/       Three.js r186 runtime (MIT)
    assets/work/        project imagery
    assets/video/       horizon footage (see Credits)

## Motion
The page respects `prefers-reduced-motion` and falls back to a static layout.
A visitor can override it from the hero prompt or the footer switch.

## Credits

`assets/video/skyline-dusk.mp4` — trimmed and re-encoded from "Drone Footage of
Buildings at Night" by ArtHouse Studio, via Pexels. Free for commercial use
under the Pexels licence; attribution is not required but is given here.
https://www.pexels.com/video/drone-footage-of-buildings-at-night-8494852/

`assets/feed/*.mp4` — stock placeholders from Mixkit (Mixkit Stock Video Free Licence),
shown in the drone's camera feed until VizClix footage replaces them.

`assets/city/thane-district.json` — building footprints, roads and lakes of Thane West from
OpenStreetMap (© OpenStreetMap contributors, ODbL), built by `tools/district.py`. Heights are
mapped where OSM has them and estimated from footprint size where it does not.

Three.js r186 — MIT licence.

Project imagery under `assets/work/` is Polycrayons studio work.
