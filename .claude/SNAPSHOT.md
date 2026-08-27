# SNAPSHOT — modulab

Updated: 2026-08-27 (work-laptop session; calibration)

## Where we are

LIVE at https://arathindustries.github.io/modulab/ (GitHub Pages, main/docs).
The Workspace (route `sandbox`) IS the product: full-bleed engine viewport +
HUD. Nav = Workspace · About. Twin view deleted 8/27; Dashboard is off the
nav, reachable at #/dashboard as Diagnostics.

- **Scenes-as-data**: `docs/scenes/*.json` (schema v0, AUTHORING.md); engine
  `docs/js/scene/engine.js` instantiates objects/bodies/models/nodes/drivers/
  patches/overlays; warn-never-die.
- **Editor** (authoring layers 3+4 shipped): raycast select + gizmos
  (Move/W, Rotate/E), undo (Ctrl+Z, 60 snapshots), inspector v3 drawer
  (selection-scoped, sentence-language: "Knob 0 turns this object",
  rest/swing/response/flip), add/delete/rename/reparent, driver CRUD,
  per-scene localStorage drafts WITH baseline tracking (update notice +
  Restore scene button), export/import, Blank bench (?scene=blank) + New.
- **Calibration** (8/27, first hardware-driven feature): every driver card
  ends with *Match the real part* — **Zero here** (one point: baseline so
  the live input = the object's resting rotationZ) then **Set swing** (two
  points: amplitude = turned° / Δk, sign folded in, invert dropped, zero
  kept). Pure math `docs/js/scene/calibrate.js` + `tests/calibrate.test.mjs`
  (node --test); engine exposes `inputValue(ref)`. Ordinary driver edits →
  draft/export, firmware untouched. A knob-driven object FOLLOWS an edit
  to its angle ° while an input is live (auto re-zero, `followRest`) —
  fix for the 8/27 rig session where the elbow zeroed against a stale rest.
  Preset choice no longer persisted across loads; node-driven objects say
  so on their card. Rig result 8/27: both arms zeroed flat, tracking right.
  pol-original preset + its nodes REMOVED from the shipped scene (one
  setup, so no preset radios in the HUD). NEXT: bake Arath's exported
  calibration into pol-lever-arm.json; newcomer orientation of the GUI
  (inventory in progress — nobody fresh can tell what the controls are).
- **Overlays (lesson layer)**: vector, label (+{speed}{height}{ke}{pe}),
  contacts (solver impulses), trail, graph (pivot sparklines: deg/omega/
  speed/ref). pol-lever-arm carries θ₀+ω₀ (upper-arm), θ₁ (forearm), cube
  weight/velocity/contacts/trail/energy.
- **Transports**: USB serial (DTR asserted), BLE, demo, manual sliders —
  one shared stream, protocol v0 (PoL-compatible) + v1 hello (PROTOCOL.md).
- **Firmware**: `firmware/modulab_ble/` dual-transport (USB+BLE, 50 Hz),
  compile-verified; CHANNEL_PINS self-documents adding IO pins (6-ch BLE cap).
- **Docs**: README = intent router; TESTING.md paths 0/A/B; PROTOCOL.md
  module-building walkthrough; AUTHORING.md schema + layering plan.

## NOT yet true

- Hardware: Arath's knob rig streams over BLE (8/27) and showed the
  expected mis-sync (random start angle, wrong sweep) — calibration was
  built for it; first measured sweep/direction numbers not yet recorded.
  Friend's-rig serial test still open.
- Node graph not editable in-app; overlays not editable in-app; torque
  arcs need a mass field on parts; feel constants (n/1023 scale, cannon
  friction) unvalidated against real knobs; manual sliders still default to
  511.5 (parks the arm at −65°, not rest).

## Standing design rules (Arath, 7/27)

Sentence-first UI language; panels scope to selection; roles not types
(scenery/physics/knob-driven/anchor + scene-matched color dots); overlays
render IN the world, never as space-stealing panels; first read must work
without interaction (hover = reinforcement only).
