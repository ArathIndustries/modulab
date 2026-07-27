# modulab wire protocol

Text frames over any byte transport (USB serial at 9600 baud, BLE notify
characteristic). The full frame reference is below; if your goal is a working
custom module, start with the walkthrough.

## Build your own module

Any microcontroller that can print text can be a modulab module.
Prerequisite: your board streams *something* into the app already
([TESTING.md](TESTING.md) Path A proves that in 5 minutes).

1. **Decide your channels.** Each sensor value gets an integer channel
   (0, 1, 2, …). Values are floats; the built-in scenes expect the 0–1023
   range (raw 10-bit ADC), so scale to that until scene-side ranges land.
2. **Stream frames** — one `<channel:value>` per sensor, ~20–50 Hz, no
   separators needed:
   `Serial.print("<0:"); Serial.print(myValue); Serial.print(".0>");`
   ✓ *Verify:* Serial Monitor at 9600 shows a run-on stream of frames.
3. **Announce yourself** — every ~5 s send a hello so the app can name you:
   `<h:mymodule:3>` (name, channel count).
   ✓ *Verify:* the app's module badge reads `module: mymodule (3 ch)`.
4. **Watch it arrive** — app → **Connect USB** → the Dashboard tab's protocol
   console shows your exact frames; every channel you send gets a live card
   automatically. Nothing to register, nothing to configure.
   ✗ *Nothing arrives?* Close the Serial Monitor (it holds the port); check
   baud 9600; confirm frames have both `<` and `>`.
5. **Going wireless (optional):** notify the same frame bytes on the BLE
   characteristic below — `firmware/modulab_ble/modulab_ble.ino` is the
   working reference for both transports at once.

**Next rung:** make a scene that uses your module's channels —
[AUTHORING.md → Your first scene](AUTHORING.md#your-first-scene-10-minutes).

## Frame reference

A frame is `<` + body + `>`; anything outside a frame is
ignored, so streams survive noise and mid-frame connection joins. Frames may be
split across packets/notifications — parsers must buffer.

### v0 — channel frames (PowderOfLife-compatible)

```
<ch:value>        ch = int >= 0, value = float
<0:512.0000><1:377.0000>
```

Identical to the serial output of Powder Of Life's Arduino SerialNode
(open `<`, pair split `:`, close `>`), so existing PoL sketches stream into
modulab unchanged. Values are whatever the sensor produces; the reference
knob module sends raw 10-bit ADC counts (0–1023).

### v1 — module hello

```
<h:name:count>    name = module identifier, count = channel count
<h:knob2:2>
```

Sent on startup and every 5 s (late-attaching clients still learn the module
name). This is the seed of module self-registration: later revisions will
extend hello with per-channel metadata (kind, unit, range) so the client can
load the right lesson overlay automatically. Parsers MUST ignore frame bodies
they do not recognize — that is the compatibility contract.

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

Each notification carries one or more complete-or-partial frames; the client
feeds raw bytes to the same parser as serial. Worst-case knob2 frame pair
(`<0:1023.0><1:1023.0>`, 20 bytes) fits the default BLE 4.x MTU.
