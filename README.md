# modulab

**Physical knobs, live in the browser.** Plug a board into your computer,
open a URL, and watch your knobs drive a 3D scene — no install, the browser
is the runtime.

**Live now:** https://arathindustries.github.io/modulab/

## Words used here

modulab, the app and these docs, use one set of words for the same things:

| word | means |
|---|---|
| **part** | one thing in the scene (upper-arm, forearm, cube, floor, ramp) |
| **knob** | one physical input from the board (knob 0, knob 1) — a pot, or any sensor |
| **link** | what moves a part: "knob 0 moves the upper-arm" |
| **resting angle** | where a part sits when nothing moves it |
| **starting angle** | the link's angle when the knob reads 0 |
| **swing** | degrees the part turns for one full knob turn |
| **scene** | the whole setup: parts, links, camera, gravity — one JSON file |
| **your copy** | the scene with your edits, saved in this browser |

## Choose your path

| I want to… | You need | Time | Follow |
|---|---|---|---|
| **Never touched it — just see it move** | any desktop Chrome/Edge | 30 s | open the [live app](https://arathindustries.github.io/modulab/), click **On-screen sliders** (or **Fake signal**) |
| **I have an Arduino — drive it with my own board** | any Arduino-ish board, USB | 5 min | [CONNECT.md → Path A](CONNECT.md#path-a--any-arduino-compatible-board-over-usb-5-minutes) |
| **I want the reference board (USB + Bluetooth)** | Arduino Nano 33 BLE | 15 min | [CONNECT.md → Path B](CONNECT.md#path-b--arduino-nano-33-ble--ble-sense-usb--bluetooth) |
| **My knob doesn't line up with the screen** | a streaming board | 2 min | [CONNECT.md → Calibrate](CONNECT.md#calibrate-make-the-screen-turn-like-the-real-lever) |
| **I want to build my own module** | any MCU that prints text | 30 min | [BUILD-A-MODULE.md → Build your own module](BUILD-A-MODULE.md#build-your-own-module) |
| **I want to make or change the scene** | a text editor | 10 min | [EDIT-THE-SCENE.md → Your first scene](EDIT-THE-SCENE.md#your-first-scene-10-minutes) |
| **I want to work on the app itself** | git, local HTTP server | — | [Working on the code](#working-on-the-code) below |

Each path ends by pointing at the next one — the ladder is the product:
*see it → drive it → build a module → edit the scene.*

## What this is

A way to wire physical knobs to a live 3D scene with real physics — and, on
the roadmap, overlays that turn any scene into a physics or statics lesson
(force arrows, live numbers, drawn right inside the scene). A scene is a
JSON document (see [EDIT-THE-SCENE.md](EDIT-THE-SCENE.md)), and how the
knobs get to the app doesn't matter to the scene — on-screen sliders, a
fake signal, a USB cable, or Bluetooth are all interchangeable. The wire
format is deliberately simple so any microcontroller can join.

Status: the scene renders live; USB and Bluetooth hardware paths are out for
their first field tests; editing the scene in the app is the next layer
([EDIT-THE-SCENE.md → layering plan](EDIT-THE-SCENE.md#layering-plan-each-step-ships-alone)).

## Working on the code

No build step — native ES modules. Serve `docs/` over HTTP (modules do not
load from `file://`):

```
cd docs
py -m http.server 8321    # then open http://localhost:8321
```

Useful URL parameters: `?demo=1` (fake signal), `?manual=1&ch0=350&ch1=650`
(on-screen sliders with starting values), `?scene=<id>` (load
`docs/scenes/<id>.json`). Diagnostics (raw values, sample rate, a console of
every frame) live at `#/dashboard`.

Tests: `node --test tests/calibrate.test.mjs` — the calibration math (Zero /
Set swing), the only piece with a real test suite so far.

Repo layout (folder = deployment concern):

| Folder | What it is |
|---|---|
| `docs/` | the web app — GitHub Pages serves this directory |
| `docs/js/scene/` | the scenes-as-data engine |
| `docs/scenes/` | scene documents (JSON, schema in EDIT-THE-SCENE.md) |
| `docs/models/` | 3D assets (provenance + licenses in its README) |
| `docs/vendor/` | vendored third-party libs (three.js, cannon-es, addons) |
| `firmware/` | Arduino sketches for hardware modules |

How the code fits together, one knob reading's trip from board to screen:

1. **USB cable / Bluetooth** carries the raw bytes — `docs/js/transports/`
2. **Parser** turns bytes into frames — `docs/js/protocol.js`
3. **Stream** — one connection, many listeners — `docs/js/stream.js`
4. **Workspace** — the view that owns the viewport and the HUD —
   `docs/js/views/sandbox.js`
5. **Scene engine** reads the scene JSON and builds the 3D world —
   `docs/js/scene/engine.js`
6. Every frame, **links** turn each part by its knob's reading
7. Calibration math (Zero / Set swing) lives in `docs/js/scene/calibrate.js`

Docs map: [CONNECT.md](CONNECT.md) hardware walkthroughs ·
[BUILD-A-MODULE.md](BUILD-A-MODULE.md) wire format + module building ·
[EDIT-THE-SCENE.md](EDIT-THE-SCENE.md) scene schema + editing · this file
routes.

## Provenance & license

Inspired by Andrew Frueh's
[Powder Of Life](https://github.com/andrewfrueh/PowderOfLife) and by porting
it to the Nano 33 BLE
([fork](https://github.com/ArathIndustries/PowderOfLife)). modulab is a
clean-room implementation — no PowderOfLife code, wire-compatible with its
serial frames; the shipped scene is a decoded transcription of his Unity
digital-twin demo, and the workspace renders his printable lever model with
attribution ([docs/models/README.md](docs/models/README.md)). Code is
[MIT](LICENSE); the lever model keeps its upstream license.
