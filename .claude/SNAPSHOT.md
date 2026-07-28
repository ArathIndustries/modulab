# SNAPSHOT — modulab

Updated: 2026-07-27 22:09 (session 04590297)

## Where we are

LIVE at https://arathindustries.github.io/modulab/ (GitHub Pages, main/docs).
The Sandbox IS the product (ruling 7/27): full-bleed engine viewport + HUD;
Dashboard/Twin tabs are legacy, capabilities folded in or superseded.

- **Scenes-as-data**: `docs/scenes/*.json` (schema v0, AUTHORING.md); engine
  `docs/js/scene/engine.js` instantiates objects/bodies/models/nodes/drivers/
  patches/overlays; warn-never-die.
- **Editor** (authoring layers 3+4 shipped): raycast select + gizmos
  (Move/W, Rotate/E), undo (Ctrl+Z, 60 snapshots), inspector v3 drawer
  (selection-scoped, sentence-language: "Knob 0 turns this object",
  rest/swing/response/flip), add/delete/rename/reparent, driver CRUD,
  per-scene localStorage drafts WITH baseline tracking (update notice +
  Restore scene button), export/import, Blank bench (?scene=blank) + New.
- **Overlays (lesson layer)**: vector, label (+{speed}{height}{ke}{pe}),
  contacts (solver impulses), trail, graph (pivot sparklines: deg/omega/
  speed/ref). pol-lever-arm carries θ₀+ω₀ (shoulder), θ₁ (elbow), toy
  weight/velocity/contacts/trail/energy.
- **Transports**: USB serial (DTR asserted), BLE, demo, manual sliders —
  one shared stream, protocol v0 (PoL-compatible) + v1 hello (PROTOCOL.md).
- **Firmware**: `firmware/modulab_ble/` dual-transport (USB+BLE, 50 Hz),
  compile-verified; CHANNEL_PINS self-documents adding IO pins (6-ch BLE cap).
- **Docs**: README = intent router; TESTING.md paths 0/A/B; PROTOCOL.md
  module-building walkthrough; AUTHORING.md schema + layering plan.

## NOT yet true

- **NO hardware has ever touched this stack** — bare-board USB+BLE smoke
  (Arath) and friend's-rig serial test are the oldest open items.
- Node graph not editable in-app; overlays not editable in-app; torque
  arcs need a mass field on parts; feel constants (n/1023 scale, cannon
  friction) unvalidated against real knobs.

## Standing design rules (Arath, 7/27)

Sentence-first UI language; panels scope to selection; roles not types
(scenery/physics/knob-driven/anchor + scene-matched color dots); overlays
render IN the world, never as space-stealing panels; first read must work
without interaction (hover = reinforcement only).
