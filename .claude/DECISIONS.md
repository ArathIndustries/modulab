
## 2026-07-26/27 — founding decisions (session 04590297)
- Sandbox IS the product; overlays render in-world, never as panels (Arath)
- Scenes are data (JSON schema v0); engine never special-cases a scene
- Document = single source of truth; drafts record their baseline
- Joints independent by default; PoL cross-coupled patch kept as preset
- UI language: sentences + roles, not schema terms; selection-scoped panels
- Clean-room MIT; wire-compatible with PowderOfLife; model asset attributed

## 2026-08-27 — calibration (work-laptop session)
- Calibration lives in the scene document (driver baseline/amplitude), never
  in firmware: the board stays dumb and raw stays raw
- Zero = the object's resting rotationZ (the pose the scene draws with no
  input); two-point swing folds direction into amplitude's sign and drops
  `invert` (flip stays as a manual knob for un-calibrated drivers)
- Direction convention for "turned °": counter-clockwise on screen is +
  (scene +Z, viewed from the default camera)
- While an input is live, editing a driven object's angle ° re-zeros its
  drivers so the part follows the edit (rest is the zero reference, so an
  edit to it that the knob overrides is a trap, not a feature)
- Motion-preset choice is per visit, not persisted: a fresh load always
  starts on the scene default (independent). The remembered pol-original
  preset silently broke elbow calibration on the first rig
