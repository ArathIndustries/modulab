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
   port. The arm's shoulder follows A0, the elbow follows A1.

Existing **Powder Of Life** sketches work unchanged (same wire protocol).

## Path B — Arduino Nano 33 BLE / BLE Sense: USB + Bluetooth

1. Arduino IDE → Boards Manager → install **Arduino Mbed OS Nano Boards**;
   Library Manager → install **ArduinoBLE**.
2. Flash [`firmware/modulab_ble/modulab_ble.ino`](firmware/modulab_ble/modulab_ble.ino)
   (board: Arduino Nano 33 BLE).
3. ⚠ **Pots go to 3V3, never 5 V** — the nRF52840's pins are not 5 V tolerant.
4. USB: as Path A. Bluetooth: **Connect Bluetooth** → device `modulab-knob2`
   (works on desktop Chrome/Edge and **Android Chrome**; iPhones can't —
   iOS has no Web Bluetooth).

## What success looks like

- Status pill reads `connected · …`, channel badges (bottom-left) show moving
  numbers, and the arm tracks your knobs with ~no lag.
- Drag to orbit the scene, wheel to zoom. The blue cube is physics — knock it
  around with the arm ("Reset" puts it back).
- The **Dashboard** tab is the diagnostic view: raw values, sample rate, and a
  protocol console showing the exact frames your board is sending.

## If it doesn't work

- Browser must be desktop Chrome or Edge for USB (Web Serial); Firefox and
  Safari don't support it.
- Nothing streams: is the Serial Monitor still open? Is the baud 9600?
- Values frozen at one number: check pot wiring (wiper to A0/A1).
- File an issue with your board name, browser, and a screenshot of the
  Dashboard tab's protocol console:
  https://github.com/ArathIndustries/modulab/issues
