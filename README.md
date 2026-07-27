# modulab

**Physical modules, live in the browser.** Plug a sensor module into a dev
board, open the page, connect — channels register themselves and stream into
live instruments. No install: the browser is the runtime (Web Serial + Web
Bluetooth).

**Live:** https://arathindustries.github.io/modulab/ — press **Demo signal**
to see it run with no hardware.

## What works today (v0.1 — raw instrument panel)

- **Connect USB** — desktop Chrome/Edge. Any board speaking the
  [wire protocol](PROTOCOL.md) at 9600 baud, including unmodified
  Powder Of Life sketches. DTR is asserted on open (native-USB boards send
  nothing without it — learned the hard way).
- **Connect Bluetooth** — Chrome/Edge desktop + Android Chrome (iOS Safari
  has no Web Bluetooth). Pairs with the modulab firmware below.
- **Demo signal** — synthetic module, exercises the full pipeline.
- Per-channel cards: live value, min/max, sample rate, 12-second strip chart,
  protocol console. Channels auto-register on first frame.

## Reference hardware module ("knob2")

Arduino **Nano 33 BLE / BLE Sense Rev2** + two B10K potentiometers.

> ⚠ **3.3 V only.** Pot outer legs → **3V3** and **GND**, wipers → **A0**/**A1**.
> The nRF52840's pins are not 5 V tolerant — 5 V wiring can permanently
> damage the board.

Flash `firmware/modulab_ble/modulab_ble.ino` (Arduino IDE: install the
*Arduino Mbed OS Nano Boards* core + *ArduinoBLE* library, board = Arduino
Nano 33 BLE). It streams over USB serial and BLE simultaneously. A bare board
with nothing wired also works for smoke tests — floating pins stream noise.

## Where this is going

The dashboard is the substrate. Roadmap: physics-lesson overlays that turn
knob motion into live engineering quantities (lever torque → beam reactions →
mechanics of materials), and richer module self-registration (hello frames
carrying per-channel kind/unit/range) so hardware picks its own lesson.

## Development

No build step — native ES modules. Serve `docs/` over HTTP (modules do not
load from `file://`):

```
cd docs
py -m http.server 8321    # then open http://localhost:8321/?demo=1
```

`?demo=1` auto-starts the synthetic module. Site deploys from `docs/` via
GitHub Pages.

## Provenance & license

Inspired by Andrew Frueh's
[Powder Of Life](https://github.com/andrewfrueh/PowderOfLife) and by porting
it to the Nano 33 BLE
([fork](https://github.com/ArathIndustries/PowderOfLife)). modulab is a
clean-room implementation — no PowderOfLife code, wire-compatible with its
serial frames. [MIT](LICENSE).
