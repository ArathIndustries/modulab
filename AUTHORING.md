# modulab scenes-as-data — schema v0

Ruling 2026-07-27: modulab's destination is **authoring power** — building,
wiring, and sharing experiments inside the tool. The enabling decision is that
a scene is **data, not code**: a JSON document the engine instantiates. The
editor, when it comes, is a UI that edits this document; the hardcoded sandbox
becomes merely the first saved scene (`scenes/pol-lever-arm.json`).

## Design rules

1. **Everything the viewport shows comes from the document.** No scene-specific
   code paths. If the PoL arm needs something the schema can't say, the schema
   grows — the engine never special-cases a scene.
2. **Inputs are references, never wires to hardware.** A driver or node input
   is `"ch:N"` (module channel, normalized 0–1) or `"node:<id>"`. Which
   transport feeds the channels is outside the document — that is why sliders
   today and the BLE board tomorrow are interchangeable.
3. **Angles in degrees, positions in scene units (1 u = 10 mm at the reference
   lever's 0.1 scale), colors as hex strings.** Human-editable first.
4. **Forward references are invalid.** `parent` and node inputs may only point
   at things declared earlier in their array — insertion order is evaluation
   order, cycles are unrepresentable (same rule as the node graph engine).
5. **Unknown fields are ignored, missing fields default.** Documents stay
   loadable across engine versions; the engine warns, never dies, on extras.

## Document shape

```jsonc
{
  "meta": { "id": "pol-lever-arm", "name": "PoL Lever Arm", "schema": 0 },

  "environment": {
    "gravity": [0, -9.82, 0],
    "camera": { "position": [1.58, 0, 11.15], "target": [1.58, 0, 0], "fov": 60 },
    "grid": true                    // ground grid + axes at lowest static top
  },

  "materials": {                    // referenced by objects; PBR params
    "world": { "color": "#3a4150", "roughness": 0.85 },
    "arm":   { "color": "#eb6834", "roughness": 0.45, "metalness": 0.05 },
    "toy":   { "color": "#3987e5", "roughness": 0.4 }
  },

  "models": {                       // mesh assets; scale maps native units -> scene units
    "lever60": { "url": "models/potentiometer-lever-60mm.obj", "scale": 0.1, "rotationX": 90 }
  },

  "objects": [                      // ordered; parent must appear earlier
    { "id": "floor", "type": "box", "size": [25.15, 1, 4],
      "position": [-6.6, -3.91, 0], "material": "world", "body": "static" },

    { "id": "toy", "type": "box", "size": [2.9346, 2.9346, 2.9346],
      "position": [13.86, 7.09, 0], "material": "toy",
      "body": "dynamic", "mass": 1, "plane2d": true, "resettable": true },

    { "id": "root", "type": "group", "position": [-8, 0, 0], "rotationZ": 180 },

    { "id": "seg0", "type": "model", "model": "lever60", "material": "arm",
      "parent": "root", "position": [0, 0, 0], "rotationZ": 60,
      "body": "kinematic", "collider": { "size": [6, 0.7, 3], "offset": [-3, 0, 0] } }
  ],

  "nodes": [                        // data node graph, normalized 0-1 domain
    { "id": "gen1", "kind": "const", "value": 1 },
    { "id": "mixAdd", "kind": "mix", "mode": "add", "a": "node:gen1", "b": "ch:0" },
    { "id": "mixSub", "kind": "mix", "mode": "subtract", "a": "ch:1", "aAmp": -1, "b": "node:mixAdd" }
  ],

  "patches": {                      // named driver sets; UI toggles between them
    "independent": [
      { "target": "seg0", "property": "rotationZ", "input": "ch:0",
        "baseline": 60, "amplitude": 250, "invert": true, "lerp": 0.2 },
      { "target": "seg1", "property": "rotationZ", "input": "ch:1",
        "baseline": -30, "amplitude": -250, "lerp": 0.2 }
    ],
    "pol-original": [ /* drivers reading node:mixSub — the decoded patch */ ]
  },
  "defaultPatch": "independent"
}
```

### Object types (v0)

| type | renders as | body options |
|---|---|---|
| `box` | BoxGeometry + material | `static`, `dynamic` (mass, plane2d, resettable) |
| `group` | empty transform node | none (articulation joints) |
| `model` | mesh asset instance | `kinematic` (box collider, offset) |

### Node kinds (v0)

`const` (value) · `mix` (mode add/subtract/multiply, per-input `aAmp`/`bAmp`) ·
`lerp` (speed) · `invert`. Same reference rules as drivers.

### Drivers

`target.property` is set every tick to
`baseline + amplitude * (invert ? -in : in)`, smoothed by `lerp`
(0 = snap, 0.2 ≈ the PoL feel). v0 property: `rotationZ`; the schema grows to
`position*/scale*/material.*` when a scene needs them — rule 1.

## Provenance of v0's shape

Everything here is the generalization of what the decoded Unity scene actually
required: parented transforms with baseline rotations (the arm), static/dynamic
bodies with 2D constraint (floor/ramp/toy), kinematic colliders on driven parts,
MixNode chains with per-input amplitudes, TransformDriver baseline+amplitude+
invert semantics, and a constant generator. Nothing speculative was added.

## Layering plan (each step ships alone)

1. **Engine runs documents** — `js/scene/engine.js`; `?scene=<id>` loads
   `scenes/<id>.json`. Acceptance: pol-lever-arm.json renders equivalent to the
   retired hardcoded sandbox. ← this burst
2. **Workspace panels** — instruments (from Dashboard) and node patching (from
   Twin) dock beside the viewport; tabs retire when parity lands. ← starts this burst
3. **Editing verbs** — select object → inspector shows its document entry;
   change values live; export/import JSON; localStorage drafts.
4. **Authoring verbs** — add/delete objects and nodes, rebind driver inputs,
   save named patches; share via URL. "A tiny domain-specific Unity."
5. **Lesson layer** — overlay definitions (computed quantities, annotations)
   join the document, turning any scene into a physics/statics/MoM exercise.
