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
    index.html          markup, and the copy used when built without the CMS
    tools/cms/build.mjs fills the page from the CMS at build time
    css/site.css        tokens and layout
    js/main.js          scroll timeline, loader, motion preference
    js/scene.js         3D world, camera rig, section stations
    js/drone.js         procedural drone model
    vendor/three/       Three.js r186 runtime (MIT), minified with esbuild 0.28.2
    assets/work/        project imagery
    assets/feed/        drone camera-feed clips (stock placeholders)
    assets/city/        Thane West district from OpenStreetMap
    vendor/lenis/       Lenis 1.3.26 smooth scrolling (MIT)

## Content
Every word, list and image is edited in the Polycrayons admin (polycrayons.com/admin,
site **VizClix** in the sidebar selector, then **VizClix Page**). Publishing there
triggers `.github/workflows/pages.yml`, which runs the build and publishes to Pages.

    PAYLOAD_URL=https://polycrayons.com npm run build   # writes _site/

`tools/cms/build.mjs` fills `index.html` with the published content and downloads
its media into `_site/assets/cms/`, so visitors never load from the CMS. It stops
if an element it expects is missing, and if the CMS cannot be reached the last
good site stays up. Without `PAYLOAD_URL` it publishes `index.html` as written, so
the site does not depend on the CMS; change the structure in `index.html`, the
words in the admin.

## Motion
The page respects `prefers-reduced-motion` and falls back to a static layout.
A visitor can override it from the hero prompt or the footer switch.

## Credits

`assets/feed/*.mp4` — stock placeholders from Mixkit (Mixkit Stock Video Free Licence),
shown in the drone's camera feed until VizClix footage replaces them.

`assets/film/` — the sections 1-5 background: one shot cut and graded in After Effects
(`tools/film/build.jsx`) from Mixkit stock clips 41375, 42041 and 42342 (Mixkit Stock Video
Free Licence) and the Polycrayons render of Mahavir Springs, exported as WebP frames and scrubbed
by scroll. The stock clips are placeholders for VizClix's own footage.

`assets/city/thane-district.json` — building footprints, roads and lakes of Thane West from
OpenStreetMap (© OpenStreetMap contributors, ODbL), built by `tools/district.py`. Heights are
mapped where OSM has them and estimated from footprint size where it does not.

Three.js r186 — MIT licence (vendored minified: `npx esbuild@0.28.2 <file> --minify --format=esm`, then point
three.module.min.js at three.core.min.js). Lenis 1.3.26 — MIT licence (vendor/lenis/LICENSE).

Project imagery under `assets/work/` is Polycrayons studio work.

Client logos under `assets/clients/` are the trademarks of their owners, taken from the
client list on polycrayons.com/about and recoloured to the site palette. They are shown as
Polycrayons' clients, not as VizClix clients.
