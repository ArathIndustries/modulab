/**
 * Dashboard view — the raw instrument panel. Connect a transport, watch
 * channels register themselves and stream. This is the substrate the
 * physics-lesson overlays build on later.
 */
import { CONFIG } from '../config.js';
import { FrameParser } from '../protocol.js';
import { serialSupported, connectSerial } from '../transports/serial.js';
import { bleSupported, connectBle } from '../transports/ble.js';
import { connectDemo } from '../transports/demo.js';
import { createStripChart } from '../components/stripchart.js';

let active = null; // module-scoped so re-entering the view resets cleanly

export function renderDashboard(container) {
    if (active) { active.teardown(); active = null; }

    container.innerHTML = `
        <div class="view dashboard">
            <section class="connect-bar" aria-label="Connection">
                <button class="btn" id="btn-serial">Connect USB</button>
                <button class="btn" id="btn-ble">Connect Bluetooth</button>
                <button class="btn btn-ghost" id="btn-demo">Demo signal</button>
                <button class="btn btn-ghost" id="btn-disconnect" hidden>Disconnect</button>
                <span class="status-pill" id="status-pill" data-state="idle">idle</span>
                <span class="module-badge" id="module-badge" hidden></span>
                <span class="rate-label" id="rate-label" hidden></span>
            </section>
            <p class="hint" id="cap-hint"></p>
            <section class="channel-grid" id="channel-grid">
                <div class="empty-state" id="empty-state">
                    <p>No channels yet. Connect a module — every channel that
                    speaks announces itself here.</p>
                </div>
            </section>
            <details class="proto-console">
                <summary>Protocol console</summary>
                <pre id="proto-log" aria-live="off"></pre>
            </details>
        </div>
    `;

    const els = {
        serial: container.querySelector('#btn-serial'),
        ble: container.querySelector('#btn-ble'),
        demo: container.querySelector('#btn-demo'),
        disconnect: container.querySelector('#btn-disconnect'),
        pill: container.querySelector('#status-pill'),
        badge: container.querySelector('#module-badge'),
        rate: container.querySelector('#rate-label'),
        hint: container.querySelector('#cap-hint'),
        grid: container.querySelector('#channel-grid'),
        empty: container.querySelector('#empty-state'),
        log: container.querySelector('#proto-log'),
    };

    const hints = [];
    if (!serialSupported()) {
        els.serial.disabled = true;
        hints.push('Web Serial needs desktop Chrome or Edge.');
    }
    if (!bleSupported()) {
        els.ble.disabled = true;
        hints.push('Web Bluetooth needs Chrome/Edge (desktop) or Android Chrome — iOS Safari does not support it.');
    }
    els.hint.textContent = hints.join(' ');

    const state = {
        transport: null,
        channels: new Map(), // ch -> {chart, valueEl, minEl, maxEl, hzEl, min, max, count, times: []}
        frameTimes: [],
        logLines: [],
        uiTimer: null,
    };

    const parser = new FrameParser({
        onSample: handleSample,
        onHello: (h) => {
            els.badge.hidden = false;
            els.badge.textContent = `module: ${h.name} (${h.channels} ch)`;
        },
        onFrame: (raw) => {
            state.logLines.push(raw);
            if (state.logLines.length > CONFIG.CONSOLE_MAX_FRAMES) state.logLines.shift();
        },
    });

    function setStatus(s) {
        els.pill.dataset.state = s.state;
        els.pill.textContent = s.label ? `${s.state} · ${s.label}` : s.state;
        const connected = s.state === 'connected';
        els.disconnect.hidden = !connected;
        for (const b of [els.serial, els.ble, els.demo]) b.hidden = connected;
        if (s.state === 'error') els.pill.textContent = `error · ${s.message || 'unknown'}`;
    }

    function handleSample({ ch, value, t }) {
        let c = state.channels.get(ch);
        if (!c) c = createChannelCard(ch);
        c.count += 1;
        c.last = value;
        if (value < c.min) c.min = value;
        if (value > c.max) c.max = value;
        c.times.push(t);
        if (c.times.length > 64) c.times.shift();
        c.chart.push(t, value);
        state.frameTimes.push(t);
    }

    function createChannelCard(ch) {
        els.empty.hidden = true;
        const slot = (ch % 8) + 1; // color follows the channel identity, never rank
        const card = document.createElement('article');
        card.className = 'channel-card';
        card.innerHTML = `
            <header>
                <span class="series-chip" style="background: var(--series-${slot})"></span>
                <h2>CH ${ch}</h2>
                <span class="ch-hz"></span>
            </header>
            <div class="ch-value">—</div>
            <div class="ch-stats">
                <span>min <b class="ch-min">—</b></span>
                <span>max <b class="ch-max">—</b></span>
            </div>
            <div class="chart-holder"></div>
        `;
        els.grid.appendChild(card);
        const chart = createStripChart(card.querySelector('.chart-holder'), {
            colorVar: `--series-${slot}`,
        });
        const entry = {
            chart,
            valueEl: card.querySelector('.ch-value'),
            minEl: card.querySelector('.ch-min'),
            maxEl: card.querySelector('.ch-max'),
            hzEl: card.querySelector('.ch-hz'),
            min: Infinity,
            max: -Infinity,
            count: 0,
            last: null,
            times: [],
        };
        state.channels.set(ch, entry);
        return entry;
    }

    // Throttled DOM text updates — canvas redraws are rAF-driven separately
    state.uiTimer = setInterval(() => {
        const now = performance.now();
        for (const c of state.channels.values()) {
            if (c.last === null) continue;
            c.valueEl.textContent = c.last.toFixed(1);
            c.minEl.textContent = c.min.toFixed(0);
            c.maxEl.textContent = c.max.toFixed(0);
            const recent = c.times.filter((t) => now - t < 2000);
            c.hzEl.textContent = recent.length > 1 ? `${(recent.length / 2).toFixed(0)} Hz` : '';
        }
        state.frameTimes = state.frameTimes.filter((t) => now - t < 2000);
        els.rate.hidden = state.frameTimes.length === 0;
        els.rate.textContent = `${(state.frameTimes.length / 2).toFixed(0)} samples/s`;
        els.log.textContent = state.logLines.join('\n');
    }, 1000 / CONFIG.UI_TEXT_HZ);

    async function start(connectFn) {
        try {
            state.transport = await connectFn({
                onData: (text) => parser.feed(text),
                onStatus: setStatus,
            });
        } catch (err) {
            // User cancelling the port/device picker is normal flow, not an error
            if (err.name !== 'NotFoundError') {
                setStatus({ state: 'error', message: err.message });
            }
        }
    }

    els.serial.addEventListener('click', () => start(connectSerial));
    els.ble.addEventListener('click', () => start(connectBle));
    els.demo.addEventListener('click', () => start(connectDemo));
    els.disconnect.addEventListener('click', async () => {
        await state.transport?.disconnect();
        setStatus({ state: 'idle' });
    });

    active = {
        teardown() {
            state.transport?.disconnect?.();
            clearInterval(state.uiTimer);
            for (const c of state.channels.values()) c.chart.destroy();
        },
    };

    // Headless-verifiable + zero-hardware visitors: ?demo=1 auto-starts the stream
    if (new URLSearchParams(window.location.search).has('demo')) {
        start(connectDemo);
    }
}
