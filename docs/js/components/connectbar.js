/**
 * Connect bar — shared by every view. Renders the connect options + status
 * pill + board badge against the shared stream service, and keeps itself
 * in sync via stream.onStatus/onHello. Returns an unmount function.
 */
import { stream } from '../stream.js';
import { serialSupported, connectSerial } from '../transports/serial.js';
import { bleSupported, connectBle } from '../transports/ble.js';
import { connectDemo } from '../transports/demo.js';
import { connectManual } from '../transports/manual.js';

// idle/disconnected both read as "not connected"; "connecting…" is here for
// when a transport reports it, even though none currently does.
const STATE_LABELS = {
    idle: 'not connected',
    disconnected: 'not connected',
    connecting: 'connecting…',
};

export function mountConnectBar(container) {
    container.innerHTML = `
        <div class="connect-bar" aria-label="Connect">
            <div class="connect-head">
                <b>Connect</b>
                <small class="why">where the readings come from</small>
            </div>
            <div class="connect-options">
                <div class="connect-opt">
                    <button class="btn" data-t="serial" title="board plugged into this computer">USB cable</button>
                    <small class="why">board plugged into this computer</small>
                </div>
                <div class="connect-opt">
                    <button class="btn" data-t="ble" title="board on battery, nearby">Bluetooth</button>
                    <small class="why">board on battery, nearby</small>
                </div>
                <div class="connect-opt">
                    <button class="btn btn-ghost" data-t="demo" title="no hardware — a made-up wave, to see it move">Fake signal</button>
                    <small class="why">no hardware — a made-up wave, to see it move</small>
                </div>
                <div class="connect-opt">
                    <button class="btn btn-ghost" data-t="manual" title="no hardware — drag sliders instead of turning knobs">On-screen sliders</button>
                    <small class="why">no hardware — drag sliders instead of turning knobs</small>
                </div>
                <button class="btn btn-ghost" data-t="disconnect" hidden>Disconnect</button>
            </div>
            <span class="status-pill" data-state="idle">not connected</span>
            <span class="module-badge" hidden></span>
        </div>
        <p class="hint"></p>
    `;

    const btn = (t) => container.querySelector(`[data-t="${t}"]`);
    const pill = container.querySelector('.status-pill');
    const badge = container.querySelector('.module-badge');
    const hint = container.querySelector('.hint');

    const hints = [];
    if (!serialSupported()) { btn('serial').disabled = true; hints.push('Web Serial needs desktop Chrome or Edge.'); }
    if (!bleSupported()) { btn('ble').disabled = true; hints.push('Web Bluetooth needs Chrome/Edge (desktop) or Android Chrome — iOS Safari does not support it.'); }
    hint.textContent = hints.join(' ');

    function renderStatus(s) {
        pill.dataset.state = s.state;
        pill.textContent = s.state === 'error'
            ? `error · ${s.message || 'unknown'}`
            : s.state === 'connected'
                ? (s.label ? `connected · ${s.label}` : 'connected')
                : (STATE_LABELS[s.state] ?? s.state);
        const connected = s.state === 'connected';
        btn('disconnect').hidden = !connected;
        for (const t of ['serial', 'ble', 'demo', 'manual']) btn(t).hidden = connected;
        if (!connected) { badge.hidden = true; badge.textContent = ''; }
    }
    function renderHello(h) {
        if (!h || h.channels === 0) return;
        badge.hidden = false;
        badge.textContent = `board says: ${h.name} · ${h.channels} knobs`;
    }

    btn('serial').addEventListener('click', () => stream.connect(connectSerial));
    btn('ble').addEventListener('click', () => stream.connect(connectBle));
    btn('demo').addEventListener('click', () => stream.connect(connectDemo));
    btn('manual').addEventListener('click', () => stream.connect(connectManual));
    btn('disconnect').addEventListener('click', () => stream.disconnect());

    renderStatus(stream.status);
    renderHello(stream.hello);
    const offStatus = stream.onStatus(renderStatus);
    const offHello = stream.onHello(renderHello);

    return () => { offStatus(); offHello(); };
}
