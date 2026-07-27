/**
 * Live strip chart — canvas, single series, dataviz-spec conformant:
 * 2px line in the channel's series color, recessive grid, no legend
 * (single series — the card header names it), crosshair + tooltip on hover,
 * text in text tokens only.
 */
import { CONFIG } from '../config.js';

const PAD = { top: 8, right: 8, bottom: 18, left: 42 };

export function createStripChart(container, { colorVar = '--series-1', yMin = 0, yMax = 1023 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stripchart';
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.hidden = true;
    container.appendChild(canvas);
    container.appendChild(tooltip);

    const ctx = canvas.getContext('2d');
    const windowMs = CONFIG.CHART_SECONDS * 1000;
    const samples = []; // {t, v} — pruned to the visible window
    let domain = { min: yMin, max: yMax };
    let dirty = true;
    let hoverX = null;
    let raf = null;
    let destroyed = false;

    const ro = new ResizeObserver(() => { sizeCanvas(); dirty = true; });
    ro.observe(container);
    sizeCanvas();

    function sizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth || 300;
        const h = 160;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function cssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function push(t, v) {
        samples.push({ t, v });
        if (v < domain.min) domain.min = Math.floor(v);
        if (v > domain.max) domain.max = Math.ceil(v);
        const cutoff = t - windowMs - 500;
        while (samples.length && samples[0].t < cutoff) samples.shift();
        dirty = true;
    }

    function xFor(t, now, w) {
        return PAD.left + ((t - (now - windowMs)) / windowMs) * (w - PAD.left - PAD.right);
    }
    function yFor(v, h) {
        const f = (v - domain.min) / (domain.max - domain.min || 1);
        return PAD.top + (1 - f) * (h - PAD.top - PAD.bottom);
    }

    function draw() {
        if (destroyed) return;
        raf = requestAnimationFrame(draw);
        if (!dirty && hoverX === null) return;
        dirty = false;

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const now = performance.now();
        ctx.clearRect(0, 0, w, h);

        // Recessive grid: 4 horizontal lines + y labels in muted ink
        ctx.strokeStyle = cssVar('--chart-grid');
        ctx.fillStyle = cssVar('--text-muted');
        ctx.font = '10px ui-monospace, monospace';
        ctx.lineWidth = 1;
        const ticks = 4;
        for (let i = 0; i <= ticks; i++) {
            const val = domain.min + ((domain.max - domain.min) * i) / ticks;
            const y = yFor(val, h);
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(w - PAD.right, y);
            ctx.stroke();
            ctx.fillText(String(Math.round(val)), 4, y + 3);
        }
        ctx.fillText(`-${CONFIG.CHART_SECONDS}s`, PAD.left, h - 5);
        ctx.fillText('now', w - PAD.right - 22, h - 5);

        if (samples.length > 1) {
            ctx.strokeStyle = cssVar(colorVar);
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let started = false;
            for (const s of samples) {
                const x = xFor(s.t, now, w);
                if (x < PAD.left - 2) continue;
                const y = yFor(s.v, h);
                if (!started) { ctx.moveTo(x, y); started = true; }
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Hover layer: crosshair + nearest-sample tooltip
        if (hoverX !== null && samples.length) {
            let nearest = null;
            let best = Infinity;
            for (const s of samples) {
                const d = Math.abs(xFor(s.t, now, w) - hoverX);
                if (d < best) { best = d; nearest = s; }
            }
            if (nearest && best < 40) {
                const x = xFor(nearest.t, now, w);
                const y = yFor(nearest.v, h);
                ctx.strokeStyle = cssVar('--text-muted');
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(x, PAD.top);
                ctx.lineTo(x, h - PAD.bottom);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = cssVar(colorVar);
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();

                tooltip.hidden = false;
                tooltip.textContent =
                    `${nearest.v.toFixed(1)}  ·  ${((now - nearest.t) / 1000).toFixed(1)}s ago`;
                tooltip.style.left = `${Math.min(x + 10, w - 130)}px`;
                tooltip.style.top = `${Math.max(y - 30, 2)}px`;
            } else {
                tooltip.hidden = true;
            }
        } else {
            tooltip.hidden = true;
        }
    }

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        hoverX = e.clientX - rect.left;
        dirty = true;
    });
    canvas.addEventListener('pointerleave', () => { hoverX = null; dirty = true; });

    raf = requestAnimationFrame(draw);

    return {
        push,
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            ro.disconnect();
        },
    };
}
