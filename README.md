# modulab

**Physical modules, live in the browser.** Plug sensors into a dev board, open
a URL, and watch them drive a 3D physics scene — no install, the browser is
the runtime. Web Serial + Web Bluetooth in, scenes-as-data out.

**Live now:** https://arathindustries.github.io/modulab/

## Choose your path

| I want to… | You need | Time | Follow |
|---|---|---|---|
| **See it work** | any desktop Chrome/Edge | 30 s | open the [live app](https://arathindustries.github.io/modulab/), click **Manual sliders** (or **Demo signal**) |
| **Drive it with an Arduino I have** | any Arduino-ish board, USB | 5 min | [TESTING.md → Path A](TESTING.md#path-a--any-arduino-compatible-board-over-usb-5-minutes) |
| **Run the reference module (USB + Bluetooth)** | Arduino Nano 33 BLE | 15 min | [TESTING.md → Path B](TESTING.md#path-b--arduino-nano-33-ble--ble-sense-usb--bluetooth) |
| **Build my own module** | any MCU that prints text | 30 min | [PROTOCOL.md → Build a module](PROTOCOL.md#build-your-own-module) |
| **Make or modify a scene** | a text editor | 10 min | [AUTHORING.md → Your first scene](AUTHORING.md#your-first-scene-10-minutes) |
| **Work on the app itself** | git, local HTTP server | — | [Development](#development) below |

Each path ends by pointing at the next one — the ladder is the product:
*see it → drive it → build a module → author a scene.*

## What this is

A platform for connecting physical sensor modules to live 3D digital twins
with physics — and, on the roadmap, overlays that turn any scene into a
physics/statics/mechanics-of-materials lesson (force vectors, stress
gradients, live quantities rendered *inside* the environment). Scenes are
JSON documents (see [AUTHORING.md](AUTHORING.md)), inputs are interchangeable
(sliders, demo signal, USB serial, BLE), and the wire protocol is
deliberately trivial so any microcontroller can join.

Status: sandbox scene + engine live; serial/BLE hardware paths shipping their
first field tests; in-app scene editing is the next layer
([AUTHORING.md → layering plan](AUTHORING.md#layering-plan-each-step-ships-alone)).

## Development

No build step — native ES modules. Serve `docs/` over HTTP (modules do not
load from `file://`):

```
cd docs
py -m http.server 8321    # then open http://localhost:8321
```

Useful URL parameters: `?demo=1` (synthetic module), `?manual=1&ch0=350&ch1=650`
(sliders with preset values), `?scene=<id>` (load `docs/scenes/<id>.json`),
`&patch=lerp@ch:0` (Twin view node presets).

Repo layout (folder = deployment concern):

| Folder | What it is |
|---|---|
| `docs/` | the web app — GitHub Pages serves this directory |
| `docs/js/scene/` | the scenes-as-data engine |
| `docs/scenes/` | scene documents (JSON, schema in AUTHORING.md) |
| `docs/models/` | 3D assets (provenance + licenses in its README) |
| `docs/vendor/` | vendored third-party libs (three.js, cannon-es, addons) |
| `firmware/` | Arduino sketches for hardware modules |

Docs map: [TESTING.md](TESTING.md) hardware walkthroughs ·
[PROTOCOL.md](PROTOCOL.md) wire format + module building ·
[AUTHORING.md](AUTHORING.md) scene schema + authoring · this file routes.

## Provenance & license

Inspired by Andrew Frueh's
[Powder Of Life](https://github.com/andrewfrueh/PowderOfLife) and by porting
it to the Nano 33 BLE
([fork](https://github.com/ArathIndustries/PowderOfLife)). modulab is a
clean-room implementation — no PowderOfLife code, wire-compatible with its
serial frames; the sandbox scene is a decoded transcription of his Unity
digital-twin demo, and the Twin view renders his printable lever model with
attribution ([docs/models/README.md](docs/models/README.md)). Code is
[MIT](LICENSE); the lever model keeps its upstream license.
