# Connect your board

This page is for anyone hooking up real hardware — you'll go from a bare
board to watching your own knobs turn the scene on screen. **App:**
https://arathindustries.github.io/modulab/

## Try it without hardware (30 seconds)

Open the app in **desktop Chrome or Edge** → click **On-screen sliders**
(or **Fake signal**). The arm should move, and the blue cube should react
to gravity. If that works, the app works on your machine and everything
below is about your hardware.

## Path A — any Arduino-compatible board over USB (5 minutes)

Works with an Uno, classic Nano, clone, ESP32, anything with `Serial`.

1. Flash this sketch (Arduino IDE, any board):

```cpp
// modulab test streamer — two knobs at ~50 Hz, 9600 baud
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
4. Open the app in desktop Chrome/Edge → **Connect** panel → **USB cable**
   → pick your board's port. The upper-arm follows A0, the forearm follows
   A1.

Existing **Powder Of Life** sketches work unchanged (same wire format).

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
   `<0:512.0><1:334.0>` plus `<h:knob2:2>` every 5 seconds (the board
   introducing itself). **Close the monitor afterwards** — it holds the
   port.
7. ⚠ **Pots go to 3V3, never 5 V** — the nRF52840's pins are not 5 V tolerant.
   Outer legs → 3V3 and GND, wipers → A0 and A1. A bare board streams
   floating-pin noise, which is fine for a first test.
8. USB: app → **Connect** panel → **USB cable**. Bluetooth: **Bluetooth** →
   device `modulab-knob2` (desktop Chrome/Edge and **Android Chrome**;
   iPhones can't — iOS has no Web Bluetooth). Bonus test: open the app on
   an Android phone, no cable at all.

## What success looks like

- The status line reads `connected · …`, the readings (bottom-left) show
  moving numbers like `knob 0 · 512`, and the arm tracks your knobs with
  ~no lag.
- Drag to orbit the scene, wheel to zoom. The blue cube reacts to physics —
  knock it around with the arm (**Reset the cube** puts it back).
- Diagnostics live at `#/dashboard` (append it to the URL): raw values,
  sample rate, and a console showing the exact frames your board is
  sending.

## Calibrate: make the screen turn like the real lever

A fresh rig always looks a little wrong at first: each part starts at some
random angle and turns more or less than your hand does. That's not a
problem with the stream — the printed lever is pressed onto the pot shaft
at whatever angle it landed, and no two pots swing the same number of
degrees. Fix it once per rig, in the app, with the board connected:

1. Click **Calibrate knobs** (top-left, under Connect).
2. The panel shows **the on-screen part follows knob N** for the first
   part.
3. **Zero:** hold the real part at its resting angle — where it sits when
   nothing is turning it — then click **Zero**.
4. **Swing** (optional): turn the real part by the amount you want it to
   swing, then click **Set swing**.
5. Click **Next part** and repeat for the rest. **Finish** on the last part
   keeps everything you set.

Hold still for a second before each click — **Zero** and **Set swing** both
average a moment of the reading, so pot noise can't throw off the result.
Zero first, then swing — swing keeps the zero you set.

The result is saved with **your copy** of the scene (and goes out with
**Save to file**); **Undo all my edits** throws it away. In **Edit scene**,
a part's **What moves it** card has the same **Calibrate with the real
part** steps — use it for a part that **Calibrate knobs** doesn't walk you
through (one linked in a less direct way, for example).

## Next steps once it works

- Streaming from your own board already? You are one step from a custom
  module: [BUILD-A-MODULE.md → Build your own module](BUILD-A-MODULE.md#build-your-own-module)
  (the board introducing itself, more knobs, your own sensors).
- Want the arm to be YOUR mechanism instead? Scenes are editable JSON:
  [EDIT-THE-SCENE.md → Your first scene](EDIT-THE-SCENE.md#your-first-scene-10-minutes).

## If it doesn't work

- Browser must be desktop Chrome or Edge for the USB cable (Web Serial);
  Firefox and Safari don't support it.
- Nothing streams: is the Serial Monitor still open? Is the baud 9600?
- Values frozen at one number: check the wiring (wiper to A0/A1).
- Still stuck? Check Diagnostics (`#/dashboard`) — it shows the exact
  frames your board is sending.
- File an issue with your board name, browser, and a screenshot of
  Diagnostics: https://github.com/ArathIndustries/modulab/issues
