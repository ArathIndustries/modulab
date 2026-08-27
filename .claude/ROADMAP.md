# ROADMAP — modulab

Layering plan lives in EDIT-THE-SCENE.md (authoritative). Status 2026-07-27:

1. Engine runs scene documents — SHIPPED
2. Workspace (full-bleed viewport + HUD; tabs folded) — SHIPPED
3. Editing verbs (select/inspect/live-edit/drafts/export) — SHIPPED
4. Authoring verbs (add/delete/rename/reparent, driver CRUD, patches) —
   core SHIPPED; remaining: node-graph editing in-app, overlay editing
   in-app, external scene URLs
5. Lesson layer — slice 1+2 SHIPPED (vector/label/contacts/trail/graph +
   energy tokens); queued: torque arcs (needs `mass` on parts — schema
   decision), stress coloring, computed expressions, lesson presets as
   shareable scene documents

6. Newcomer pass (8/27) — SHIPPED A–E: one product tab, named parts,
   Calibrate knobs in the HUD, orientation panel, About rewrite. Open: F =
   CONTRIBUTING + code map + jargon scrub + .claude/CLAUDE.md fix.

## Cross-cutting, unscheduled

- HARDWARE VALIDATION: BLE rig live 8/27; calibration verbs shipped (Zero
  here / Set swing). Next: record Arath's measured sweep + direction, friend
  rig over serial, then feel-constant tuning (friction, lerp)
- hello v2: per-channel metadata (kind/unit/range) → auto module-to-scene
  binding
- Android phone BLE demo; more module archetypes (FSR, flex, encoder)
