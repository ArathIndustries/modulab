/**
 * Connect bar — shared by every view. Renders transport buttons + status
 * pill + module badge against the shared stream service, and keeps itself
 * in sync via stream.onStatus/onHello. Returns an unmount function.
 */
import { stream } from '../stream.js';
import { serialSupported, connectSerial } from '../transports/serial.js';
import { bleSupported, connectBle } from '../transports/ble.js';
import { connectDemo } from '../transports/demo.js';

export function mountConnectBar(container) {
    container.innerHTML = `
        <div class="connect-bar" aria-label="Connection">
            <button class="btn" data-t="serial">Connect USB</button>
            <button class="btn" data-t="ble">Connect Bluetooth</button>
            <button class="btn btn-ghost" data-t="demo">Demo signal</button>
            <button class="btn btn-ghost" data-t="disconnect" hidden>Disconnect</button>
            <span class="status-pill" data-state="idle">idle</span>
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
            : (s.label ? `${s.state} · ${s.label}` : s.state);
        const connected = s.state === 'connected';
        btn('disconnect').hidden = !connected;
        for (const t of ['serial', 'ble', 'demo']) btn(t).hidden = connected;
        if (!connected) { badge.hidden = true; badge.textContent = ''; }
    }
    function renderHello(h) {
        if (!h || h.channels === 0) return;
        badge.hidden = false;
        badge.textContent = `module: ${h.name} (${h.channels} ch)`;
    }

    btn('serial').addEventListener('click', () => stream.connect(connectSerial));
    btn('ble').addEventListener('click', () => stream.connect(connectBle));
    btn('demo').addEventListener('click', () => stream.connect(connectDemo));
    btn('disconnect').addEventListener('click', () => stream.disconnect());

    renderStatus(stream.status);
    renderHello(stream.hello);
    const offStatus = stream.onStatus(renderStatus);
    const offHello = stream.onHello(renderHello);

    return () => { offStatus(); offHello(); };
}
