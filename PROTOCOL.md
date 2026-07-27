# modulab wire protocol

Text frames over any byte transport (USB serial at 9600 baud, BLE notify
characteristic). A frame is `<` + body + `>`; anything outside a frame is
ignored, so streams survive noise and mid-frame connection joins. Frames may be
split across packets/notifications — parsers must buffer.

## v0 — channel frames (PowderOfLife-compatible)

```
<ch:value>        ch = int >= 0, value = float
<0:512.0000><1:377.0000>
```

Identical to the serial output of Powder Of Life's Arduino SerialNode
(open `<`, pair split `:`, close `>`), so existing PoL sketches stream into
modulab unchanged. Values are whatever the sensor produces; the reference
knob module sends raw 10-bit ADC counts (0–1023).

## v1 — module hello

```
<h:name:count>    name = module identifier, count = channel count
<h:knob2:2>
```

Sent on startup and every 5 s (late-attaching clients still learn the module
name). This is the seed of module self-registration: later revisions will
extend hello with per-channel metadata (kind, unit, range) so the client can
load the right lesson overlay automatically. Parsers MUST ignore frame bodies
they do not recognize — that is the compatibility contract.

## Error frames

```
<err:reason>      e.g. <err:ble-init-failed>
```

## BLE contract

| Item | Value |
|---|---|
| Service UUID | `6d0d0001-a11b-4c28-b8e5-0d0d1ab5e001` |
| Frame characteristic (read/notify, 64 B) | `6d0d0002-a11b-4c28-b8e5-0d0d1ab5e002` |
| Advertised name | `modulab-knob2` |

Each notification carries one or more complete-or-partial frames; the client
feeds raw bytes to the same parser as serial. Worst-case knob2 frame pair
(`<0:1023.0><1:1023.0>`, 20 bytes) fits the default BLE 4.x MTU.
