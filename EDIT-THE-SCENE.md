# Edit the scene

This page is for anyone who wants to change what's in the scene, or build
a new one — the parts, what moves them, and the world around them. It
doubles as the field reference for **Edit scene** in the app: every value
you see there, and the JSON key behind it.

Ruling 2026-07-27: modulab's destination is editing power — building,
wiring, and sharing scenes inside the app itself. The enabling decision is
that a scene is **data, not code**: a JSON document the engine reads. Edit
scene, when it's finished, is a UI for this same document; the built-in
scene is just the first one saved (`scenes/pol-lever-arm.json`).

## Your first scene (10 minutes)

Prerequisites: a clone of this repo, any text editor, and a local server
(`cd docs && py -m http.server 8321`). No build step, no tooling.

1. **Copy the reference scene:** duplicate `docs/scenes/pol-lever-arm.json`
   as `docs/scenes/my-scene.json` and change `meta.id` to `"my-scene"`.
2. **Load it:** open `http://localhost:8321/?manual=1&scene=my-scene#/sandbox`.
   ✓ *Verify:* the scene name (top right) shows your scene; the on-screen
   sliders move the arm.
3. **Change one number:** set the ramp's resting angle (`rotationZ`) to
   `30`, make the cube's `size` bigger, or a link's swing (`amplitude`) to
   `120`. Refresh.
   ✓ *Verify:* the scene changed accordingly — that's editing.
4. **Break something on purpose:** misspell a field, or point a link at a
   part that doesn't exist. Refresh with the browser console open.
   ✓ *Verify:* the scene still loads, and the console explains what it
   ignored (`[scene:my-scene] …`) — a scene warns, it never dies.
5. **Make it yours:** add a second cube, or point knob 1's link at the
   upper-arm instead of the forearm. The full field reference is below;
   every field the reference scene uses is documented.

Sharing today means sending your JSON (or a pull request adding it to
`docs/scenes/`); loading someone else's scene from a URL, and editing scenes
fully inside the app, are the next layers (see the layering plan at the
bottom).

**Next rung:** want your own hardware driving your own scene? A knob
reference is just `ch:N` — [BUILD-A-MODULE.md → Build your own module](BUILD-A-MODULE.md#build-your-own-module).

## Parts

A part is one thing in the scene — a block, a pivot, or a lever shape built
from a 3D model.

| what it is | JSON `type` | how it behaves | JSON `body` |
|---|---|---|---|
| a block that stays put | `box` | fixed — never moves | `static` |
| a block that falls | `box` | falls and collides — has weight | `dynamic` |
| a pivot (invisible) | `group` | just a point other parts attach to | *(none)* |
| a lever (3D shape) | `model` | moves exactly where a link points it, and can push falling parts | `kinematic` |

Fields on a part's card in **Edit scene**:

| plain name | what it does | where in Edit scene | JSON key | example |
|---|---|---|---|---|
| name | names the part | part card → name | `id` | `"upper-arm"` |
| position | where it sits (x · y · z) — or drag the arrows | part card → position | `position` | `[0, 0, 0]` |
| resting angle | where it sits when nothing moves it — or drag the ring | part card → resting angle | `rotationZ` | `0` |
| size | width · height · depth | part card → size | `size` | `[6, 0.7, 3]` |
| weight | heavier is harder to push | part card → weight | `mass` | `1` |
| attached to | moves along with this part | part card → attached to | `parent` | `"upper-arm"` |
| color | its appearance | part card → color | `material` (points into `materials`, e.g. `"arm"` → `"#eb6834"`) | `"arm"` |

## What moves a part (links)

A link is what turns a part when a knob turns: "knob 0 moves the
upper-arm." A knob-driven part has a **What moves it** card in Edit scene.

| plain name | what it does | where in Edit scene | JSON key | example |
|---|---|---|---|---|
| the knob | which knob moves this part | What moves it card → knob dropdown | `input` | `"ch:0"` |
| starting angle | where it points when the knob reads 0 | What moves it card → starting angle | `baseline` | `125` |
| swing | degrees for one full knob turn — negative = the other way | What moves it card → swing | `amplitude` | `250` |
| follow | how fast it follows the knob: instant / quick / smooth / lazy | What moves it card → follow | `lerp` | `0.2` |
| turn the other way | flips the direction | What moves it card → toggle | `invert` | `true` |

**Unlink** removes this card; **+ Link a knob** adds one. In the shipped
scene, knob 0 moves the upper-arm and knob 1 moves the forearm,
independently — no part is moved by more than one knob.

## Calibrating

A part's **What moves it** card ends with **Calibrate with the real
part** — the same two steps as the HUD's **Calibrate knobs** panel, for one
part at a time:

1. **Zero:** hold the real part at its resting angle, click **Zero**.
2. **Swing** (optional): turn the real part by the amount you want it to
   swing, click **Set swing**.

**Zero** sets the starting angle so the current knob reading matches the
part's resting angle. **Set swing** measures a second point and sets the
swing — its sign records which way you turned it, so **turn the other
way** stops applying; direction is folded into the swing instead. The math
behind both is small and tested: `docs/js/scene/calibrate.js`,
`tests/calibrate.test.mjs` (`node --test tests/calibrate.test.mjs`).

## The world (gravity, camera, floor)

Fields that describe the whole scene, not one part:

| plain name | what it does | JSON key | example |
|---|---|---|---|
| gravity | how hard, and which way, things fall | `environment.gravity` | `[0, -9.82, 0]` |
| camera | where the view starts | `environment.camera` | `{ "position": [1.58,0,11.15], "target": [1.58,0,0], "fov": 60 }` |
| floor | the ground — a part like any other, fixed in place | `body: "static"` on a `box` part | `"static"` |

## Saving and sharing

| plain name | what it does |
|---|---|
| your copy | the scene with your edits, saved in this browser |
| Save to file | download this scene as JSON |
| Open file | load a scene JSON |
| Undo all my edits | back to the scene as shipped |

If the shipped scene changes after you've made your copy, the app tells
you: **The shipped scene changed. You are looking at your copy.** — **Use
the new scene** replaces your copy with the update; **Keep my copy**
dismisses the notice and keeps your edits.

## Design rules

1. **Everything the scene shows comes from the document.** No scene-specific
   code in the app — if the reference arm needs something the schema can't
   say yet, the schema grows.
2. **A link's input is a reference, not a wire to hardware.** `"ch:N"` means
   "knob N, 0–1"; `"node:<id>"` means "the result of an entry in the
   optional `nodes` list" (see Advanced, below). Which knobs sit behind
   those references — on-screen sliders, a fake signal, USB, Bluetooth — is
   outside the document; that is why they're interchangeable.
3. **Angles in degrees, positions in scene units** (1 unit = 10 mm at the
   reference lever's 0.1 scale), colors as hex strings. Human-editable
   first.
4. **Forward references are invalid.** `parent` and any `nodes` entry's
   inputs may only point at things declared earlier in their list —
   declaration order is evaluation order, so cycles can't exist.
5. **Unknown fields are ignored, missing fields default.** A scene keeps
   loading across engine versions; the engine warns, it never dies, on
   extras.

## Document shape

```jsonc
{
  "meta": { "id": "pol-lever-arm", "name": "PoL Lever Arm", "schema": 0 },

  "environment": {
    "gravity": [0, -9.82, 0],
    "camera": { "position": [1.58, 0, 11.15], "target": [1.58, 0, 0], "fov": 60 },
    "grid": true                    // ground grid + axes at lowest static top
  },

  "materials": {                    // referenced by parts; PBR params
    "world": { "color": "#3a4150", "roughness": 0.85 },
    "arm":   { "color": "#eb6834", "roughness": 0.45, "metalness": 0.05 },
    "cube":  { "color": "#3987e5", "roughness": 0.4 }
  },

  "models": {                       // mesh assets; scale maps native units -> scene units
    "lever60": { "url": "models/potentiometer-lever-60mm.obj", "scale": 0.1, "rotationX": 90 }
  },

  "objects": [                      // ordered; parent must appear earlier
    { "id": "floor", "type": "box", "size": [25.15, 1, 4],
      "position": [-6.6, -3.91, 0], "material": "world", "body": "static" },

    { "id": "cube", "type": "box", "size": [2.9346, 2.9346, 2.9346],
      "position": [13.86, 7.09, 0], "material": "cube",
      "body": "dynamic", "mass": 1, "plane2d": true, "resettable": true },

    { "id": "anchor", "type": "group", "position": [-8, 0, 0], "rotationZ": 180 },

    { "id": "upper-arm", "type": "model", "model": "lever60", "material": "arm",
      "parent": "anchor", "position": [0, 0, 0], "rotationZ": 0,
      "body": "kinematic", "collider": { "size": [6, 0.7, 3], "offset": [-3, 0, 0] } }
  ],

  "nodes": [                        // OPTIONAL — mixes more than one knob for a part
                                    // (the shipped scene has none: each knob turns its own part)
    { "id": "gen1", "kind": "const", "value": 1 },
    { "id": "mixAdd", "kind": "mix", "mode": "add", "a": "node:gen1", "b": "ch:0" },
    { "id": "mixSub", "kind": "mix", "mode": "subtract", "a": "ch:1", "aAmp": -1, "b": "node:mixAdd" }
  ],

  "patches": {                      // named link sets; the app can offer a picker between them
    "independent": [
      { "target": "upper-arm", "property": "rotationZ", "input": "ch:0",
        "baseline": 125, "amplitude": 250, "invert": true, "lerp": 0.2 },
      { "target": "forearm", "property": "rotationZ", "input": "ch:1",
        "baseline": 125, "amplitude": -250, "lerp": 0.2 }
    ]
    // more named sets here would show a picker in the HUD (per visit, not remembered)
  },
  "defaultPatch": "independent"
}
```

The shipped scene (`docs/scenes/pol-lever-arm.json`): both arms rest at
`0`, each link's starting angle is `125`, the upper-arm's swing is `250`
(with `"invert": true`) and the forearm's is `-250`.

### How a link computes an angle

Every tick, a link sets its part's `rotationZ` to
`baseline + amplitude * (invert ? -in : in)`, smoothed by `lerp`
(0 = snap, 0.2 ≈ the shipped feel). v0 only drives `rotationZ`; the schema
grows to `position*/scale*/material.*` when a scene needs them — rule 1.

### Advanced: mixing knobs together (`nodes`)

Optional, and unused by the shipped scene — skip this unless you want one
part driven by more than one knob. A `nodes` entry does one small piece of
math; a link's `input` can point at one with `"node:<id>"` instead of
`"ch:N"`.

`const` (a fixed `value`) · `mix` (`mode`: add / subtract / multiply, with
per-input `aAmp`/`bAmp`) · `lerp` (a `speed`) · `invert`. Same
forward-reference rule as links.

### Overlays (lesson layer, slice 1)

In-scene analysis, declared by the document and drawn inside the world:

```jsonc
"overlays": [
  { "type": "vector", "attach": "cube", "quantity": "weight",   "scale": 0.28, "color": "#e66767" },
  { "type": "vector", "attach": "cube", "quantity": "velocity", "scale": 0.35, "color": "#199e70" },
  { "type": "label",  "attach": "upper-arm", "text": "θ₀ {deg}°", "offset": [0, 1.4, 0] }
]
```

`vector` draws a live arrow on a part — quantities v0: `velocity` (a
falls-and-collides part's speed), `weight` (mass·g, down), `gravity`
(unit). `label` floats a text sprite with live tokens: `{deg}` (attach's
resting angle), `{speed}`, `{height}` (above `gridY`), `{ke}` (½mv²),
`{pe}` (mgh), `{value}` (a `ref` knob/mix reading).

Slice 2 adds solver-sourced overlays:

```jsonc
{ "type": "contacts", "attach": "cube", "scale": 0.03, "color": "#c98500", "max": 6 },
{ "type": "trail",    "attach": "cube", "seconds": 3,  "color": "#9085e9" }
```

`contacts` draws a normal-force arrow at every solver contact on the part —
the floor visibly pushes back, sized by the actual constraint impulse.
`trail` traces the part's recent path (projectile arcs when the arm launches
the cube).

```jsonc
{ "type": "graph", "attach": "upper-arm", "quantity": "deg", "label": "θ₀",
  "seconds": 6, "color": "#3987e5", "offset": [0, 2.1, 0] }
```

`graph` is a live sparkline sprite riding its part — a running readout of
its own data. Quantities: `deg` (angle), `omega` (angular velocity °/s),
`speed`, `ref` (any knob/mix reading). 20 Hz sampling over a `seconds`
window; the header shows the exact current value. Queued next: torque
arcs (needs part `mass`), stress coloring, computed expressions. This
section is where force diagrams and lesson quantities accumulate — always
as document data, never as UI chrome.

## Provenance of v0's shape

Everything here is the generalization of what the decoded Unity scene
actually required: parented transforms with resting rotations (the arm),
fixed and falling bodies with a 2D constraint (floor/ramp/cube), fixed-but-
movable colliders on linked parts, the original mixing chains with
per-input weights, and the original starting-angle / swing / direction
math (now this schema's `baseline` / `amplitude` / `invert`), plus a
constant generator. Nothing speculative was added.

## Layering plan (each step ships alone)

1. **Engine runs documents** — `js/scene/engine.js`; `?scene=<id>` loads
   `scenes/<id>.json`. Acceptance: pol-lever-arm.json renders the same as
   the old built-in scene it replaced. ← this burst
2. **Workspace panels** — instruments and knob-mixing controls dock beside
   the viewport; tabs retire when parity lands. ← starts this burst
3. **Editing verbs** — click a part → Edit scene shows its entry; change
   values live; export/import JSON; your copy saved in this browser.
   ← shipped
4. **Editing verbs, part two** — add/delete/reparent parts, add/edit/remove
   links, save named link sets. Still code-side: mixing-entry editing,
   renames, loading someone else's scene from a URL. ← core shipped
5. **Lesson layer** — overlay definitions (computed quantities, annotations)
   turn any scene into a physics/statics/mechanics-of-materials exercise.
   ← slice 1 shipped (vectors + labels); next: force-at-contact, torque
   arcs, stress coloring, computed expressions.
