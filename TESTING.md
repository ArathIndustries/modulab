# Testing modulab with your hardware

modulab shows physical sensors live in a 3D physics scene in your browser —
no install. **App:** https://arathindustries.github.io/modulab/

## 0. Sanity check without hardware (30 seconds)

Open the app in **desktop Chrome or Edge** → click **Manual sliders** (or
**Demo signal**). The robot arm should move. If that works, the app works on
your machine and everything below is about your hardware.

## Path A — any Arduino-compatible board over USB (5 minutes)

Works with an Uno, classic Nano, clone, ESP32, anything with `Serial`.

1. Flash this sketch (Arduino IDE, any board):

```cpp
// modulab test streamer — two analog channels at ~50 Hz, 9600 baud
void setup() { Serial.begin(9600); }
void loop() {
  Serial.print("<0:"); Serial.print(analogRead(A0)); Serial.print(".0>");
  Serial.print("<1:"); Serial.print(analogRead(A1)); Serial.print(".0>");
  delay(20);
}
```

2. Optional but much more fun: wire two potentiometers — outer legs to
   **the board's logic voltage** (5 V on Uno/classic Nano, **3.3 V on any
   3.3 V board — never 5 V on those**) and GND, wipers to A0 and A1.
   With nothing wired, floating pins stream noise, which still proves the
   pipeline.
3. Close the Arduino Serial Monitor (only one program can hold the port).
4. Open the app in desktop Chrome/Edge → **Connect USB** → pick your board's
   port. The arm's shoulder follows A0, the forearm follows A1.

Existing **Powder Of Life** sketches work unchanged (same wire protocol).

## Path B — Arduino Nano 33 BLE / BLE Sense: USB + Bluetooth

The modulab firmware streams over USB serial and Bluetooth at the same time.

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) (2.x).
2. Tools → Board → Boards Manager → search **Mbed OS Nano** → install
   **Arduino Mbed OS Nano Boards** (several minutes, it's a full toolchain).
3. Sketch → Include Library → Manage Libraries → install **ArduinoBLE**.
4. Get the firmware: open
   [the raw sketch file](https://raw.githubusercontent.com/ArathIndustries/modulab/main/firmware/modulab_ble/modulab_ble.ino),
   select all, copy, and paste over a new blank sketch (it is a single file).
5. Tools → Board → Arduino Mbed OS Nano Boards → **Arduino Nano 33 BLE**;
   Tools → Port → your board. Upload (first compile is slow — minutes, normal).
   If the upload hangs or the port vanishes: **double-tap the reset button**
   (the LED starts pulsing = bootloader), pick the new port that appears,
   upload again.
6. Verify: Serial Monitor at **9600** shows a run-on stream like
   `<0:512.0><1:334.0>` plus `<h:knob2:2>` every 5 seconds. **Close the
   monitor afterwards** — it holds the port.
7. ⚠ **Pots go to 3V3, never 5 V** — the nRF52840's pins are not 5 V tolerant.
   Outer legs → 3V3 and GND, wipers → A0 and A1. A bare board streams
   floating-pin noise, which is fine for a first test.
8. USB: app → **Connect USB**. Bluetooth: **Connect Bluetooth** → device
   `modulab-knob2` (desktop Chrome/Edge and **Android Chrome**; iPhones
   can't — iOS has no Web Bluetooth). Bonus test: open the app on an Android
   phone, no cable at all.

## What success looks like

- Status pill reads `connected · …`, channel badges (bottom-left) show moving
  numbers, and the arm tracks your knobs with ~no lag.
- Drag to orbit the scene, wheel to zoom. The blue cube is physics — knock it
  around with the arm ("Reset" puts it back).
- Diagnostics live at `#/dashboard` (append it to the URL): raw values,
  sample rate, and a protocol console showing the exact frames your board
  is sending.

## Calibrate: make the screen turn like the real lever

A fresh rig always looks a little wrong: the arm starts at some random angle
and turns more or less than your hand does. That is not the stream — the
printed lever is press-fit onto the pot shaft at whatever angle it went on,
and no two pots sweep the same degrees. Fix it once per rig, in the app,
with the board streaming:

1. **Edit** (top right) → click the arm segment in the scene → under
   **Control** its knob card ends with *Match the real part*; **input now**
   moves with your pot.
2. Type the pose your real segment is in into **angle °** (0 = flat,
   pointing at the ramp; + = counter-clockwise; the forearm's angle is
   relative to the upper arm, so 90 = forearm straight up from it). The
   screen follows as you type. Click **Zero here** to lock that pose to
   where the pot is now.
3. Turn the real segment a quarter turn counter-clockwise *as you see it on
   screen* (or change the number/direction to what you actually did) and
   click **Set swing**. The screen now turns exactly as far as the real part.
4. Repeat for the forearm — its resting angle is relative to the upper arm, so
   hold it at rest *relative to the segment it rides on*.

Hold still for a second before each click — both buttons average the last
half-second of readings so pot noise cannot become the zero.
Zero first, then swing: swing keeps the zero. The result is saved with the
scene draft (and in **Export**); **Restore scene** throws it away.

## Next steps once it works

- Streaming from your own board already? You are one step from a custom
  module: [PROTOCOL.md → Build your own module](PROTOCOL.md#build-your-own-module)
  (hello frames, more channels, your own sensors).
- Want the arm to be YOUR mechanism instead? Scenes are editable JSON:
  [AUTHORING.md → Your first scene](AUTHORING.md#your-first-scene-10-minutes).

## If it doesn't work

- Browser must be desktop Chrome or Edge for USB (Web Serial); Firefox and
  Safari don't support it.
- Nothing streams: is the Serial Monitor still open? Is the baud 9600?
- Values frozen at one number: check pot wiring (wiper to A0/A1).
- File an issue with your board name, browser, and a screenshot of the
  Dashboard tab's protocol console:
  https://github.com/ArathIndustries/modulab/issues
