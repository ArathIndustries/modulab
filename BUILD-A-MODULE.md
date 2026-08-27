# Build a module

This page is for anyone who wants their own sensor board driving the
scene. Follow the walkthrough below to get one working knob into the app;
the frame reference beneath it documents the exact wire format your board
needs to speak.

Any byte connection works — USB serial at 9600 baud, or a BLE notify
message. If your goal is a working module, start with the walkthrough.

## Build your own module

Any microcontroller that can print text can be a modulab module.
Prerequisite: your board streams *something* into the app already
([CONNECT.md](CONNECT.md) Path A proves that in 5 minutes).

1. **Decide your knobs.** Each sensor value gets an integer knob number
   (0, 1, 2, …). Values are floats; the built-in scenes expect the 0–1023
   range (a raw 10-bit reading), so scale to that until scene-side ranges
   land.
2. **Stream frames** — one `<knob:value>` per sensor, ~20–50 Hz, no
   separators needed:
   `Serial.print("<0:"); Serial.print(myValue); Serial.print(".0>");`
   ✓ *Verify:* Serial Monitor at 9600 shows a run-on stream of frames.
3. **Introduce yourself** — every ~5 s send `<h:mymodule:3>` (name, knob
   count) so the app can show your board's name.
   ✓ *Verify:* the Connect panel reads **board says: mymodule · 3 knobs**.
4. **Watch it arrive** — app → **USB cable** → Diagnostics (`#/dashboard`)
   shows your exact frames; every knob you send gets a live reading
   automatically. Nothing to register, nothing to configure.
   ✗ *Nothing arrives?* Close the Serial Monitor (it holds the port); check
   baud 9600; confirm frames have both `<` and `>`.
5. **Going wireless (optional):** notify the same frame bytes on the BLE
   characteristic below — `firmware/modulab_ble/modulab_ble.ino` is the
   working reference for USB and Bluetooth at once.

**Next rung:** make a scene that uses your module's knobs —
[EDIT-THE-SCENE.md → Your first scene](EDIT-THE-SCENE.md#your-first-scene-10-minutes).

## Frame reference

A frame is `<` + body + `>`; anything outside a frame is
ignored, so streams survive noise and mid-frame connection joins. Frames may
be split across packets/notifications — parsers must buffer.

### v0 — knob frames (PowderOfLife-compatible)

```
<n:value>         n = knob number (integer >= 0), value = float
<0:512.0000><1:377.0000>
```

Same shape as Powder Of Life's Arduino SerialNode output (open `<`, pair
split `:`, close `>`), so existing PoL sketches stream into modulab
unchanged. Values are whatever the sensor produces; the reference knob
module sends raw 10-bit readings (0–1023).

### v1 — the board introduces itself

```
<h:name:count>    name = board's name, count = how many knobs
<h:knob2:2>
```

Sent when the board starts, and every 5 s after (so an app that connects
late still learns the board's name). This is the seed of the board naming
itself automatically — later versions will add per-knob detail (kind,
unit, range) so the app can pick the right scene on its own. A parser must
ignore anything it doesn't recognize — that's the compatibility rule.

### Error frames

```
<err:reason>      e.g. <err:ble-init-failed>
```

### BLE contract

| Item | Value |
|---|---|
| Service UUID | `6d0d0001-a11b-4c28-b8e5-0d0d1ab5e001` |
| Frame characteristic (read/notify, 64 B) | `6d0d0002-a11b-4c28-b8e5-0d0d1ab5e002` |
| Advertised name | `modulab-knob2` |

Each notification carries one or more complete-or-partial frames; the app
feeds raw bytes to the same parser as USB serial. A worst-case knob2 frame
pair (`<0:1023.0><1:1023.0>`, 20 bytes) fits the default BLE 4.x message
size limit (MTU).
