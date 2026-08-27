/**
 * Calibrate knobs — a guided front door onto driver calibration, so a visitor
 * with a real knob rig never has to open the Edit drawer. Walks the
 * knob-driven parts of the CURRENT patch one at a time: hold the real part
 * at the pose shown, Zero, optionally turn it and Set swing, Next.
 *
 * Same two-step protocol as the Edit drawer's per-card "Match the real
 * part" (docs/js/components/inspector.js calibrationRows) — same pure math
 * (docs/js/scene/calibrate.js) — this is just a guided path through it that
 * does not require selecting anything or opening the drawer.
 *
 * ctx contract: getDoc, getCurrentPatch, inputValue(ref), commit({rebuild}),
 * isConnected()
 */

import { zeroDriver, spanDriver } from '../scene/calibrate.js';

const SETTLE_POLLS = 5; // x 120 ms = the last ~0.6 s (same window as inspector.js)

function fmtDeg(v) {
    return Number((v ?? 0).toFixed(2));
}

/** rotationZ 0 -> flat, 90 -> straight up, -90 -> straight down, else no hint. */
function poseHint(rot) {
    const r = Math.round(rot);
    if (r === 0) return 'flat';
    if (r === 90) return 'straight up';
    if (r === -90) return 'straight down';
    return null;
}

function fmtRaw(k) {
    return `${(k * 1023).toFixed(0)} raw`;
}

export function mountMatchRig(hudContainer, ctx) {
    let destroyed = false;
    let panelOpen = false;
    let stepIndex = 0;
    const calState = new Map(); // target id -> { k0, rest, note }
    const inputHist = new Map(); // target id -> recent raw-fraction readings
    let live = null; // { targetId, ref, readingEl, zeroBtn, swingBtn } for the open step

    hudContainer.innerHTML = `
        <button class="btn btn-ghost btn-sm matchrig-btn" title="Line up the on-screen parts with the real ones">Calibrate knobs</button>
        <div class="matchrig-panel" hidden></div>
    `;
    const btn = hudContainer.querySelector('.matchrig-btn');
    const panel = hudContainer.querySelector('.matchrig-panel');

    /** The ch:-driven entries of the current patch — the parts this walks. */
    function getSteps() {
        const doc = ctx.getDoc();
        if (!doc) return [];
        const patch = ctx.getCurrentPatch();
        const list = doc.patches?.[patch] ?? [];
        return list.filter((d) => typeof d.input === 'string' && d.input.startsWith('ch:'));
    }

    /** Mean of the last ~0.6 s of readings, so one noisy sample cannot
     *  become the zero or the swing endpoint (mirrors inspector.js). */
    function settledInput(targetId, ref) {
        const h = inputHist.get(targetId);
        if (h?.length) return h.reduce((a, b) => a + b, 0) / h.length;
        return ctx.inputValue?.(ref) ?? null;
    }

    function closePanel() {
        panelOpen = false;
        if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
        panel.hidden = true;
        panel.innerHTML = '';
        live = null;
    }

    function openPanel() {
        const steps = getSteps();
        if (!steps.length) return;
        stepIndex = 0;
        panelOpen = true;
        panel.hidden = false;
        renderStep();
        if (!liveTimer) liveTimer = setInterval(pollLive, 120);
    }

    btn.addEventListener('click', () => {
        if (panelOpen) closePanel(); else openPanel();
    });

    function renderStep() {
        const steps = getSteps();
        if (!steps.length) { closePanel(); return; }
        if (stepIndex >= steps.length) stepIndex = steps.length - 1;
        const d = steps[stepIndex];
        const doc = ctx.getDoc();
        const obj = doc.objects?.find((o) => o.id === d.target);
        const restNow = () => obj?.rotationZ ?? 0; // read fresh at click time — angle ° may edit while open
        const rest = restNow();
        const patch = ctx.getCurrentPatch();
        const parentDriven = obj?.parent
            && (doc.patches?.[patch] ?? []).some((dd) => dd.target === obj.parent);

        const hint = poseHint(rest);
        const knob = d.input.startsWith('ch:') ? `knob ${d.input.slice(3)}` : d.input;
        const poseText = `${fmtDeg(rest)}°`
            + (hint ? ` (${hint})` : '')
            + (parentDriven ? `, measured from the ${obj.parent}` : '');

        const isLast = stepIndex === steps.length - 1;

        panel.innerHTML = `
            <div class="matchrig-head">
                <b>Calibrate knobs</b>
                <span class="matchrig-progress">${d.target} · ${stepIndex + 1} of ${steps.length}</span>
                <button class="matchrig-close" title="Close and keep what is calibrated">×</button>
            </div>
            <p class="matchrig-intro">The on-screen <b>${d.target}</b> follows <b>${knob}</b>. Two steps line it up with the real one.</p>
            <div class="matchrig-row">
                <span>step 1 · zero</span>
                <div class="matchrig-explain">Hold the real ${d.target} at <b>${poseText}</b>, then click Zero.
                    The on-screen part will sit where the real one is.</div>
            </div>
            <div class="matchrig-row"><span>${knob} reads</span><div class="matchrig-val matchrig-reading">—</div></div>
            <div class="matchrig-row matchrig-actions"><span></span><div><button class="ctl-cal-btn matchrig-zero">Zero</button></div></div>
            <div class="matchrig-row">
                <span>step 2 · swing</span>
                <div class="matchrig-explain">Turn the real ${d.target} by the amount below, then click Set swing.
                    The on-screen part will then turn exactly as far as the real one.
                    <span class="matchrig-optional">Optional — skip if it already tracks.</span></div>
            </div>
            <div class="matchrig-row">
                <span>turned</span>
                <div>
                    <input type="number" class="matchrig-deg" step="1" value="90"> °
                    <select class="matchrig-dir" title="direction as you see it on screen">
                        <option value="1" selected>↺ counter-clockwise</option>
                        <option value="-1">↻ clockwise</option>
                    </select>
                </div>
            </div>
            <div class="matchrig-row matchrig-actions"><span></span><div><button class="ctl-cal-btn matchrig-swing">Set swing</button></div></div>
            <div class="matchrig-row"><span>result</span><div class="matchrig-val matchrig-status">not zeroed yet</div></div>
            <div class="matchrig-row matchrig-actions matchrig-nav">
                <span></span>
                <div>
                    <span class="matchrig-nav-left">
                        <button class="ctl-cal-btn matchrig-skip">Skip this part</button>
                        <button class="ctl-cal-btn matchrig-next">${isLast ? 'Finish' : 'Next part →'}</button>
                    </span>
                    <button class="ctl-cal-btn matchrig-done" ${isLast ? 'hidden' : ''}>Finish</button>
                </div>
            </div>
        `;

        const readingEl = panel.querySelector('.matchrig-reading');
        const statusEl = panel.querySelector('.matchrig-status');
        const zeroBtn = panel.querySelector('.matchrig-zero');
        const swingBtn = panel.querySelector('.matchrig-swing');
        const degInput = panel.querySelector('.matchrig-deg');
        const dirSelect = panel.querySelector('.matchrig-dir');
        const skipBtn = panel.querySelector('.matchrig-skip');
        const nextBtn = panel.querySelector('.matchrig-next');
        const doneBtn = panel.querySelector('.matchrig-done');
        const closeBtn = panel.querySelector('.matchrig-close');

        const st = calState.get(d.target);
        statusEl.textContent = st?.note ?? 'not zeroed yet';

        function setStatus(text) {
            const s = calState.get(d.target) ?? {};
            s.note = text;
            calState.set(d.target, s);
            statusEl.textContent = text;
        }

        function paintReading() {
            const v = ctx.inputValue?.(d.input) ?? null;
            readingEl.textContent = v == null ? 'no signal' : fmtRaw(v);
            readingEl.classList.toggle('is-off', v == null);
            zeroBtn.disabled = v == null;
            swingBtn.disabled = v == null || !calState.has(d.target);
        }
        paintReading();

        zeroBtn.addEventListener('click', () => {
            const k = settledInput(d.target, d.input);
            if (k == null) return;
            const r = restNow();
            zeroDriver(d, k, r);
            calState.set(d.target, { ...(calState.get(d.target) ?? {}), k0: k, rest: r });
            setStatus(`zeroed at ${fmtRaw(k)}`);
            paintReading();
            ctx.commit({});
        });

        swingBtn.addEventListener('click', () => {
            const s = calState.get(d.target);
            const k1 = settledInput(d.target, d.input);
            if (!s || k1 == null) return;
            const turned = (Number.parseFloat(degInput.value) || 0) * Number(dirSelect.value);
            if (!turned) { setStatus('enter how many degrees you turned it'); return; }
            if (!spanDriver(d, s.k0, k1, turned, s.rest)) {
                setStatus('the knob barely moved · turn the real part further, then Set swing');
                return;
            }
            const amp = d.amplitude;
            setStatus(`swing set · one full knob turn = ${Math.abs(amp).toFixed(0)}°${amp < 0 ? ' · turns the other way' : ''}`);
            ctx.commit({});
        });

        function advance() {
            if (stepIndex >= getSteps().length - 1) { closePanel(); return; }
            stepIndex += 1;
            renderStep();
        }
        skipBtn.addEventListener('click', advance);
        nextBtn.addEventListener('click', advance);
        doneBtn.addEventListener('click', closePanel);
        closeBtn.addEventListener('click', closePanel);

        live = { targetId: d.target, ref: d.input, readingEl, zeroBtn, swingBtn };
    }

    // Live reading poll runs only while the panel is open.
    let liveTimer = null;
    function pollLive() {
        if (destroyed || !panelOpen || !live) return;
        const v = ctx.inputValue?.(live.ref) ?? null;
        if (v != null) {
            const h = inputHist.get(live.targetId) ?? [];
            h.push(v);
            if (h.length > SETTLE_POLLS) h.shift();
            inputHist.set(live.targetId, h);
        } else {
            inputHist.delete(live.targetId);
        }
        live.readingEl.textContent = v == null ? 'no signal' : fmtRaw(v);
        live.readingEl.classList.toggle('is-off', v == null);
        live.zeroBtn.disabled = v == null;
        live.swingBtn.disabled = v == null || !calState.has(live.targetId);
    }

    return {
        /** Recompute button visibility (connected + at least one ch:-driven
         *  part in the current patch); called on stream status change and
         *  after every buildScene(). */
        refresh() {
            if (destroyed) return;
            const show = Boolean(ctx.isConnected?.() && getSteps().length > 0);
            hudContainer.hidden = !show;
            if (!show) { closePanel(); return; }
            if (panelOpen) renderStep(); // the doc/patch may have changed under us
        },
        destroy() {
            destroyed = true;
            if (liveTimer) clearInterval(liveTimer);
            hudContainer.innerHTML = '';
        },
    };
}
