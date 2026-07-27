/*
  modulab firmware — "knob2" module (2 potentiometers)
  Board: Arduino Nano 33 BLE / Nano 33 BLE Sense Rev2 (nRF52840, mbed core)

  Streams two analog channels over BOTH transports simultaneously:
    - USB serial, 9600 baud
    - BLE notify characteristic (same text frames)

  Wire protocol v1 (see PROTOCOL.md at repo root):
    <h:knob2:2>   hello — module name : channel count (repeats every 5 s)
    <0:512.0>     channel frame — channel int : value float, 0-1023 raw ADC

  WIRING — 3.3 V ONLY. nRF52840 pins are NOT 5 V tolerant:
    each pot: outer legs -> 3V3 and GND, wiper -> A0 (ch 0) / A1 (ch 1).
    A bare board with nothing wired also works for smoke tests — the
    floating pins stream noise, which is still valid protocol traffic.
*/

#include <ArduinoBLE.h>

const char* MODULE_NAME = "knob2";
const int CHANNEL_PINS[] = { A0, A1 };
const int NUM_CHANNELS = 2;

const unsigned long FRAME_MS = 20;   // 50 Hz sample stream
const unsigned long HELLO_MS = 5000; // re-announce for late-attaching clients

// UUIDs are the contract with the web client — must match docs/js/config.js
BLEService modulabService("6d0d0001-a11b-4c28-b8e5-0d0d1ab5e001");
BLECharacteristic frameChar("6d0d0002-a11b-4c28-b8e5-0d0d1ab5e002",
                            BLERead | BLENotify, 64);

unsigned long lastFrame = 0;
unsigned long lastHello = 0;

void sendFrame(const char* s) {
  Serial.print(s);
  if (BLE.connected()) {
    frameChar.writeValue((const uint8_t*)s, strlen(s));
  }
}

void setup() {
  Serial.begin(9600);
  // Deliberately NO `while (!Serial)`: the module must stream over BLE
  // with no USB host attached.

  if (!BLE.begin()) {
    // Radio init failed — keep serial alive and say so, don't hang silent.
    while (true) {
      Serial.print("<err:ble-init-failed>");
      delay(2000);
    }
  }
  BLE.setLocalName("modulab-knob2");
  BLE.setAdvertisedService(modulabService);
  modulabService.addCharacteristic(frameChar);
  BLE.addService(modulabService);
  BLE.advertise();
}

void loop() {
  BLE.poll();
  unsigned long now = millis();

  if (now - lastHello >= HELLO_MS) {
    lastHello = now;
    char hello[32];
    snprintf(hello, sizeof(hello), "<h:%s:%d>", MODULE_NAME, NUM_CHANNELS);
    sendFrame(hello);
  }

  if (now - lastFrame >= FRAME_MS) {
    lastFrame = now;
    char frame[64];
    int n = 0;
    for (int ch = 0; ch < NUM_CHANNELS && n < (int)sizeof(frame) - 12; ch++) {
      int raw = analogRead(CHANNEL_PINS[ch]);
      n += snprintf(frame + n, sizeof(frame) - n, "<%d:%d.0>", ch, raw);
    }
    sendFrame(frame);
  }
}
