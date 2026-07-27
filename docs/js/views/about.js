/**
 * About view — what modulab is, what it needs, where it is going.
 */
import { CONFIG } from '../config.js';

export function renderAbout(container) {
    container.innerHTML = `
        <div class="view about">
            <h1>About modulab</h1>
            <p><strong>Physical modules, live in the browser.</strong> Plug a sensor
            module into a dev board, open this page, connect — every channel the
            hardware announces shows up and streams. No install: the browser is
            the runtime.</p>

            <h2>Connecting</h2>
            <ul>
                <li><strong>USB serial</strong> — desktop Chrome/Edge. Works with any board
                    speaking the wire protocol at 9600 baud, including existing
                    PowderOfLife sketches.</li>
                <li><strong>Bluetooth</strong> — Chrome/Edge desktop and Android Chrome
                    (iOS Safari does not support Web Bluetooth). Needs the modulab
                    firmware on a BLE-capable board such as the Arduino Nano 33 BLE.</li>
                <li><strong>Demo signal</strong> — no hardware at all; synthetic channels
                    exercise the whole pipeline.</li>
                <li><strong>Manual sliders</strong> — drive every channel by hand from an
                    on-screen panel (add channels as needed). Same wire protocol as real
                    firmware, so anything built against it works unchanged when hardware
                    replaces the sliders. URL presets: <code>?manual=1&amp;ch0=200&amp;ch1=900</code>.</li>
            </ul>

            <h2>Hardware</h2>
            <p>Reference module: Arduino Nano 33 BLE + two potentiometers.
            <strong>Wire pots to 3V3, never 5&nbsp;V</strong> — the nRF52840's pins are not
            5&nbsp;V tolerant. Firmware lives in <code>firmware/modulab_ble/</code> in the repo.</p>

            <h2>Where this is going</h2>
            <p>The dashboard is the substrate. Next layers: physics-lesson overlays
            (lever torque, beam reactions, then mechanics of materials) that turn a
            physical knob into live engineering quantities, and module
            self-registration so each hardware module declares what it is and the
            right lesson loads itself.</p>

            <h2>Provenance</h2>
            <p>Inspired by Andrew Frueh's
            <a href="https://github.com/andrewfrueh/PowderOfLife" target="_blank" rel="noopener">Powder Of Life</a>
            and lessons learned porting it to the Nano 33 BLE. modulab is a
            clean-room implementation — no PowderOfLife code — that stays
            wire-compatible with its serial frames. Code is MIT licensed. The
            Twin view renders Frueh's actual printable 60&nbsp;mm potentiometer
            lever model, used with attribution under its upstream license
            (see <code>models/README.md</code>).</p>

            <p><a href="${CONFIG.REPO_URL}" target="_blank" rel="noopener">Source on GitHub ↗</a></p>
        </div>
    `;
}
