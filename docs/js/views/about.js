/**
 * About view — what modulab is, what it needs, where the docs are.
 * Same descriptive register as the rest of the app: label -> value and
 * short bullets, not paragraphs.
 */
import { CONFIG } from '../config.js';

const DOCS = `${CONFIG.REPO_URL}/blob/main`;

export function renderAbout(container) {
    container.innerHTML = `
        <div class="view about">
            <h1>About modulab</h1>
            <p><strong>Physical modules, live in the browser.</strong> Plug sensors
            into a dev board, open the URL — the browser is the runtime (Web Serial +
            Web Bluetooth in, a 3D physics scene out). Scenes are JSON documents, not
            code. Live at <a href="https://arathindustries.github.io/modulab/" target="_blank" rel="noopener">arathindustries.github.io/modulab</a>.</p>

            <h2>The ladder</h2>
            <ul>
                <li><strong>See it</strong> — open the <a href="https://arathindustries.github.io/modulab/" target="_blank" rel="noopener">live app</a>, click Manual sliders or Demo signal.</li>
                <li><strong>Drive it</strong> — any Arduino-ish board over USB: <a href="${DOCS}/TESTING.md#path-a--any-arduino-compatible-board-over-usb-5-minutes" target="_blank" rel="noopener">TESTING.md → Path A</a>.</li>
                <li><strong>Build a module</strong> — any MCU that prints text: <a href="${DOCS}/PROTOCOL.md#build-your-own-module" target="_blank" rel="noopener">PROTOCOL.md → Build a module</a>.</li>
                <li><strong>Author a scene</strong> — edit the JSON directly: <a href="${DOCS}/AUTHORING.md#your-first-scene-10-minutes" target="_blank" rel="noopener">AUTHORING.md → Your first scene</a>.</li>
            </ul>

            <h2>Connecting</h2>
            <ul>
                <li><strong>USB serial</strong> — desktop Chrome or Edge only.</li>
                <li><strong>Bluetooth</strong> — Chrome/Edge desktop or Android Chrome; not iOS Safari.</li>
                <li><strong>Demo signal</strong> — no hardware, synthetic channels exercise the whole pipeline.</li>
                <li><strong>Manual sliders</strong> — drive every channel by hand; URL presets
                    <code>?manual=1&amp;ch0=200&amp;ch1=900</code>.</li>
            </ul>

            <h2>Hardware</h2>
            <ul>
                <li><strong>Reference module</strong> — Arduino Nano 33 BLE + two potentiometers on A0/A1.</li>
                <li><strong>Power</strong> — 3V3 only, never 5V (the nRF52840's pins are not 5V-tolerant).</li>
                <li><strong>Firmware</strong> — <code>firmware/modulab_ble/</code> in the repo.</li>
                <li><strong>Any other board</strong> — works if it prints <code>&lt;ch:value&gt;</code> frames
                    (see <a href="${DOCS}/PROTOCOL.md" target="_blank" rel="noopener">PROTOCOL.md</a>).</li>
            </ul>

            <h2>Calibrate knobs</h2>
            <p>A fresh rig never turns quite right: the printed lever is press-fit onto
            the pot shaft at whatever angle it went on, and no two pots sweep the same
            degrees. Once a board is connected a <strong>Calibrate knobs</strong> button
            appears under Connect and walks each knob-driven part in turn:</p>
            <ul>
                <li><strong>Zero</strong> — hold the real part at the pose shown · locks where it sits</li>
                <li><strong>Set swing</strong> — turn it 90° · locks how far it sweeps (optional)</li>
                <li><strong>Next</strong> — same for the next part · <strong>Done</strong></li>
            </ul>
            <p>Saved with the scene draft and in Export. The Edit drawer keeps the same
            two steps on each part's control card for authoring.</p>

            <h2>Diagnostics</h2>
            <p><a href="#/dashboard">#/dashboard</a> — raw channel values, sample rate,
            protocol console.</p>

            <h2>Provenance &amp; license</h2>
            <ul>
                <li>Inspired by Andrew Frueh's
                    <a href="https://github.com/andrewfrueh/PowderOfLife" target="_blank" rel="noopener">Powder Of Life</a> —
                    modulab is a clean-room reimplementation (MIT), wire-compatible with
                    its serial frames, no PowderOfLife code.</li>
                <li>The workspace renders Frueh's printable lever model with attribution
                    (<a href="${DOCS}/docs/models/README.md" target="_blank" rel="noopener">docs/models/README.md</a>) —
                    CERN-OHL-W / CC BY-SA upstream, not covered by modulab's MIT license.</li>
            </ul>

            <p><a href="${CONFIG.REPO_URL}" target="_blank" rel="noopener">Source on GitHub ↗</a></p>
        </div>
    `;
}
