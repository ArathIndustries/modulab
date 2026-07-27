/**
 * Dashboard view — the raw instrument panel. Consumes the shared stream;
 * connecting here and navigating away keeps the link alive (the Twin view
 * reads the same stream).
 */
import { CONFIG } from '../config.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
import { createStripChart } from '../components/stripchart.js';

let active = null; // module-scoped so re-entering the view resets cleanly

export function renderDashboard(container) {
    if (active) { active.teardown(); active = null; }

    container.innerHTML = `
        <div class="view dashboard">
            <section id="connect-mount"></section>
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
            <span class="rate-label" id="rate-label" hidden></span>
        </div>
    `;

    const els = {
        grid: container.querySelector('#channel-grid'),
        empty: container.querySelector('#empty-state'),
        log: container.querySelector('#proto-log'),
        rate: container.querySelector('#rate-label'),
    };

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));

    const state = {
        channels: new Map(),
        frameTimes: [],
        logLines: [],
        uiTimer: null,
    };

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
            min: Infinity, max: -Infinity, count: 0, last: null, times: [],
        };
        state.channels.set(ch, entry);
        return entry;
    }

    const offSample = stream.onSample(({ ch, value, t }) => {
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
    });

    const offFrame = stream.onFrame((raw) => {
        state.logLines.push(raw);
        if (state.logLines.length > CONFIG.CONSOLE_MAX_FRAMES) state.logLines.shift();
    });

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

    active = {
        teardown() {
            offSample();
            offFrame();
            unmountBar();
            clearInterval(state.uiTimer);
            for (const c of state.channels.values()) c.chart.destroy();
        },
    };
}
