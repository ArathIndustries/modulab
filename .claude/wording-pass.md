# Wording pass — every word a person sees (F)

Rules: (1) the name says what it is; a visible line under it says what it
does — no hover-only help; (2) one vocabulary everywhere — app, docs, code
comments. Strike or edit any line; then it gets built exactly as written.

## Vocabulary (used identically in app + docs)

| word | means |
|---|---|
| **part** | one thing in the scene (upper-arm, forearm, cube, floor, ramp) |
| **knob** | one physical input channel from the board (knob 0, knob 1) — a pot, or any sensor |
| **link** | what moves a part: "knob 0 moves the upper-arm" (was: driver / control / patch) |
| **resting angle** | where a part sits when nothing moves it (was: angle °, rotationZ, rest) |
| **starting angle** | the link's angle when the knob reads 0 (was: baseline) |
| **swing** | degrees the part turns for one full knob turn (was: amplitude) |
| **scene** | the whole setup: parts, links, camera, gravity — one JSON file |
| **your copy** | the scene with your edits, saved in this browser (was: draft) |

## Top bar

| now | proposed | line under / hover |
|---|---|---|
| Workspace | Workspace | — |
| About | About | — |
| ↗ (GitHub) | ↗ | "source on GitHub" |
| ☾ / ☀ | same | "dark / light" |
| ? | ? | "how the screen is laid out" |

## HUD top-left — Connect

| now | proposed | visible line |
|---|---|---|
| (no heading) | **Connect** | "where the readings come from" |
| Connect USB | **USB cable** | "board plugged into this computer" |
| Connect Bluetooth | **Bluetooth** | "board on battery, nearby" |
| Demo signal | **Fake signal** | "no hardware — a made-up wave, to see it move" |
| Manual sliders | **On-screen sliders** | "no hardware — drag sliders instead of turning knobs" |
| idle / connecting / connected · usb | **not connected** / **connecting…** / **connected · USB cable** | — |
| module: knob2 (2 ch) | **board says: knob2 · 2 knobs** | — |
| Calibrate knobs | Calibrate knobs | "line up the on-screen parts with the real ones" |

## HUD top-right — Scene

| now | proposed | visible line |
|---|---|---|
| PoL Lever Arm * | **Lever arm** · *your copy* | — |
| Reset | **Reset the cube** | "put the cube back at its start" |
| Edit | **Edit scene** | "change parts, links, and the world" |
| Move / Rotate | **Move** / **Turn** | "drag the arrows" / "drag the ring" |
| Restore scene | **Undo all my edits** | "back to the scene as shipped" |
| This scene has been updated — you're viewing your edited copy. / Load update (discard my edits) / Keep mine | **The shipped scene changed. You are looking at your copy.** / **Use the new scene** / **Keep my copy** | — |

## HUD bottom-left — Readings

| now | proposed |
|---|---|
| CH 0 · 512 | **knob 0 · 512** (raw, 0–1023) |
| upper-arm 0° | **upper-arm · 0°** |
| (no heading) | tiny heading **readings** with line "raw knob values · part angles, live" |

## HUD bottom-right — Camera

| now | proposed |
|---|---|
| drag · orbit  wheel · zoom  right-drag · pan | **camera** — drag to orbit · wheel to zoom · right-drag to slide |

## Edit drawer

| now | proposed | visible line |
|---|---|---|
| Inspector | **Edit scene** | "click a part in the scene or the list to change it" |
| edited (chip) | **your copy** | — |
| New | **New empty scene** | — |
| Save file | **Save to file** | "download this scene as JSON" |
| Open | **Open file** | "load a scene JSON" |
| Undo all | **Undo all my edits** | — |
| Scene (h4) | **Parts** | "everything in the scene · click one to change it" |
| role chips: scenery / physics / knob-driven / anchor / part | **fixed** / **falls & collides** / **moves with knob N** / **pivot (invisible)** / **not linked yet** | — |
| Add dropdown: Box — falls & collides / Box — fixed in place / Anchor — invisible pivot point / Part — lever model | **block that falls** / **block that stays put** / **pivot (invisible)** / **lever** | — |
| + Add | **Add** | — |
| Select something — click it in the scene or in the list above — to see and change what it is and what moves it. | **Nothing selected.** Click a part in the scene or in the list above. | — |
| (selected) upper-arm | **upper-arm** — *lever · moves with knob 0 · attached to anchor* | one summary line, always visible |
| Delete | **Delete** | "removes this part and anything attached to it" |
| name | **name** | — |
| position | **position** | "x · y · z — or drag the arrows" |
| angle ° | **resting angle** | "where it sits when nothing moves it — or drag the ring" |
| size | **size** | "width · height · depth" |
| mass | **weight** | "heavier is harder to push" |
| attached to | **attached to** | "moves along with this part" |
| appearance | **color** | — |
| Control (h4) | **What moves it** | "links from knobs to this part" |
| Nothing controls this object. | **Nothing moves this part yet.** | — |
| Angles in degrees. Swing = how far a full knob turn moves it. | (dropped — each field explains itself) | — |
| Knob 0 ▾ turns this object | **knob 0 ▾ moves this part** | — |
| Disconnect | **Unlink** | — |
| starting angle ° | **starting angle** | "where it points when the knob reads 0" |
| swing ° | **swing** | "degrees for one full knob turn · negative = the other way" |
| response: instant / snappy / smooth / floaty | **follow** : instant / quick / smooth / lazy | "how fast it follows the knob" |
| flip direction | **turn the other way** | — |
| Match the real part | **Calibrate with the real part** | same two steps as the HUD panel, same words |
| + Connect a knob to this object | **+ Link a knob** | — |

## Words to remove from the app entirely
driver · patch · preset · baseline · amplitude · lerp · invert · node · channel/CH · inspector · sandbox · draft · object · scenery · kinematic · dynamic · static · transport · hello

## Repo docs (same vocabulary)
- README ladder stays; every rung's first line says who it is for
- TESTING.md → **CONNECT.md** ("connect your board") · PROTOCOL.md → **BUILD-A-MODULE.md** · AUTHORING.md → **EDIT-THE-SCENE.md** (inspector + JSON side by side, one section per field above)
- new **GLOSSARY** section at the top of README = the vocabulary table
- firmware header: "to add a sensor change CHANNEL_PINS — nothing else"
- code comments: jargon lines rewritten (Seed-B, IA workshop, rulings); `.claude/CLAUDE.md` template filled in
