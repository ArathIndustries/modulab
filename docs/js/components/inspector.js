/**
 * Edit-scene drawer:
 *
 *   EVERYTHING BELOW THE PARTS LIST IS SCOPED TO THE SELECTION.
 *   No selection -> just the parts list and a hint. Select a part ->
 *   its properties + "What moves it": only the links that move THAT
 *   part, phrased as sentences ("knob 0 moves this part"), with
 *   plain-word fields (starting angle / swing / follow / turn the other way).
 *
 *   There is no global link list — only the links for the selected part
 *   show here. Patch save lives in the HUD next to the patch radios
 *   (it's a scene-level action, not a per-part action).
 *
 * ctx contract: getDoc, getSelected, setSelected, isDraft, exportDoc,
 * importDoc, revertDraft, getCurrentPatch, commit({rebuild}),
 * liveTransform(id), inputValue(ref)
 */

import { zeroDriver, spanDriver } from '../scene/calibrate.js';

// Tree rows describe each part's role, with a dot color that matches what
// it looks like in the scene. The "moves with knob N" word is computed
// per-part below, since it names the actual knob driving that part.
function roleOf(o, doc) {
    if (o.type === 'group') {
        return { word: 'pivot (invisible)', className: 'anchor',
            tip: 'Invisible attachment point — a mount or a pivot for other parts.' };
    }
    if (o.body === 'dynamic') {
        return { word: 'falls & collides', className: 'physics',
            tip: 'Falls and collides — gravity, the arm, and other parts can push it.' };
    }
    if (o.body === 'static') {
        return { word: 'fixed', className: 'scenery',
            tip: 'Solid and fixed in place — the world\'s furniture. Nothing moves it.' };
    }
    let driverEntry = null;
    for (const list of Object.values(doc.patches ?? {})) {
        const d = list.find((dd) => dd.target === o.id);
        if (d) { driverEntry = d; break; }
    }
    if (driverEntry) {
        const word = driverEntry.input?.startsWith('ch:') ? `moves with knob ${driverEntry.input.slice(3)}`
            : driverEntry.input?.startsWith('node:') ? `moves with mix ${driverEntry.input.slice(5)}`
                : 'moves with an input';
        return { word, className: 'knobdriven',
            tip: 'Moved by a knob — select it and see What moves it below.' };
    }
    return { word: 'not linked yet', className: 'part',
        tip: 'A part with nothing linked yet — link a knob under What moves it.' };
}

/** kind word for the selected-part summary line. */
function kindOf(o) {
    if (o.type === 'group') return 'pivot';
    if (o.type === 'model') return 'lever';
    if (o.body === 'dynamic') return 'block that falls';
    if (o.body === 'static') return 'block that stays put';
    return o.type ?? 'part';
}

/** One always-visible summary line under the selected part's name:
 *  <kind> · moves with knob N | not linked yet · attached to <parent> | (the world) */
function summaryLine(obj, mine) {
    const kind = kindOf(obj);
    let link = 'not linked yet';
    if (mine.length) {
        const d = mine[0];
        if (d.input?.startsWith('ch:')) link = `moves with knob ${d.input.slice(3)}`;
        else if (d.input?.startsWith('node:')) link = `moves with mix ${d.input.slice(5)}`;
        else link = 'moves with an input';
    }
    const parent = obj.parent ? `attached to ${obj.parent}` : '(the world)';
    return `${kind} · ${link} · ${parent}`;
}

const RESPONSE_PRESETS = [
    { value: 0, label: 'instant' },
    { value: 0.5, label: 'quick' },
    { value: 0.2, label: 'smooth' },
    { value: 0.06, label: 'lazy' },
];

export function mountInspector(container, ctx) {
    let destroyed = false;
    const transformRefs = { id: null, pos: [], rot: null };

    // --- tiny builders ---------------------------------------------------------

    function numberInput(value, step, onInput, tooltip) {
        const el = document.createElement('input');
        el.type = 'number';
        el.step = step;
        if (tooltip) el.title = tooltip;
        el.value = Number.isFinite(value) ? value : 0;
        el.addEventListener('input', () => {
            const v = Number.parseFloat(el.value);
            if (Number.isFinite(v)) onInput(v);
        });
        return el;
    }

    /** A property row: label (+ optional tooltip) on the left, a visible
     *  "why" line under the label when the spec calls for one, inputs on
     *  the right. */
    function fieldRow(label, tooltip, why, ...inputs) {
        const row = document.createElement('label');
        row.className = 'insp-row';
        const labelWrap = document.createElement('span');
        labelWrap.className = 'insp-row-label';
        const labelText = document.createElement('span');
        labelText.textContent = label;
        if (tooltip) labelText.title = tooltip;
        labelWrap.appendChild(labelText);
        if (why) {
            const w = document.createElement('small');
            w.className = 'why';
            w.textContent = why;
            labelWrap.appendChild(w);
        }
        row.appendChild(labelWrap);
        const holder = document.createElement('div');
        holder.className = 'insp-inputs';
        for (const i of inputs) holder.appendChild(i);
        row.appendChild(holder);
        return row;
    }

    function selectInput(options, current, onChange, tooltip) {
        const sel = document.createElement('select');
        if (tooltip) sel.title = tooltip;
        for (const { value, label } of options) {
            const opt = document.createElement('option');
            opt.value = String(value);
            opt.textContent = label ?? String(value);
            if (String(value) === String(current)) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', () => onChange(sel.value));
        return sel;
    }

    function h4(text, tooltip) {
        const el = document.createElement('h4');
        el.textContent = text;
        if (tooltip) el.title = tooltip;
        return el;
    }

    /** A section heading with a visible line under it. */
    function sectionHead(text, why) {
        const wrap = document.createElement('div');
        wrap.className = 'insp-section-head';
        wrap.appendChild(h4(text));
        if (why) {
            const w = document.createElement('small');
            w.className = 'why';
            w.textContent = why;
            wrap.appendChild(w);
        }
        return wrap;
    }

    // --- calibration: make the real part and the screen agree -----------------
    // Step 2 measures from the zero point step 1 took; that transient state
    // is keyed by the link itself, so a doc swap (undo, import, revert)
    // simply restarts the two steps. The math is pure and tested:
    // docs/js/scene/calibrate.js.
    const calState = new WeakMap();
    const liveEls = new Set();
    const baselineEls = new Map(); // link -> its 'starting angle' input (refreshed by followRest)
    const inputHist = new WeakMap(); // link -> last few polled readings (ADC noise averages out)
    const SETTLE_POLLS = 5; // x 120 ms = the last ~0.6 s
    const liveTimer = setInterval(() => {
        for (const l of liveEls) {
            const v = ctx.inputValue?.(l.ref) ?? null;
            if (v != null) {
                const h = inputHist.get(l.d) ?? [];
                h.push(v);
                if (h.length > SETTLE_POLLS) h.shift();
                inputHist.set(l.d, h);
            } else {
                inputHist.delete(l.d);
            }
            l.el.textContent = v == null ? 'nothing yet — connect a knob' : fmtInput(l.ref, v);
            l.el.classList.toggle('is-off', v == null);
            l.zeroBtn.disabled = v == null;
            l.swingBtn.disabled = v == null || !calState.has(l.d);
        }
    }, 120);

    /** A knob-linked part FOLLOWS an edit to its resting angle: while an
     *  input is live the link owns the part every frame, so without this
     *  the edit is invisible until Zero here. Re-zero every link on the
     *  part so the input where it is now maps to the new rest; a pending
     *  calibration moves its zero point along. */
    function followRest(obj) {
        const doc = ctx.getDoc();
        const rest = obj.rotationZ ?? 0;
        for (const d of doc.patches?.[ctx.getCurrentPatch()] ?? []) {
            if (d.target !== obj.id) continue;
            const k = ctx.inputValue?.(d.input) ?? null;
            if (k == null) continue;
            zeroDriver(d, k, rest);
            const s = calState.get(d);
            if (s) { s.k0 = k; s.rest = rest; }
            const el = baselineEls.get(d);
            if (el && document.activeElement !== el) el.value = d.baseline;
        }
    }

    /** The input's settled value for a calibration click: the mean of the
     *  last ~0.6 s of readings, so one noisy sample cannot become the zero
     *  (each ADC count is amplitude/1023 degrees — 0.24° on the stock arm). */
    function settledInput(d) {
        const h = inputHist.get(d);
        if (h?.length) return h.reduce((a, b) => a + b, 0) / h.length;
        return ctx.inputValue?.(d.input) ?? null;
    }

    function fmtInput(ref, v) {
        return ref.startsWith('ch:') ? `${(v * 1023).toFixed(0)} raw` : v.toFixed(3);
    }

    function button(text, tooltip) {
        const el = document.createElement('button');
        el.className = 'ctl-cal-btn';
        el.textContent = text;
        el.title = tooltip;
        return el;
    }

    /** fieldRow without the <label> — for rows that hold buttons. */
    function plainRow(label, tooltip, ...inputs) {
        const row = document.createElement('div');
        row.className = 'insp-row';
        const span = document.createElement('span');
        span.textContent = label;
        if (tooltip) span.title = tooltip;
        row.appendChild(span);
        const holder = document.createElement('div');
        holder.className = 'insp-inputs';
        for (const i of inputs) holder.appendChild(i);
        row.appendChild(holder);
        return row;
    }

    function calibrationRows(d, obj) {
        const wrap = document.createElement('div');
        wrap.className = 'ctl-cal';
        const restNow = () => obj.rotationZ ?? 0; // read when clicked: resting angle may have been edited since render
        const rest = restNow();
        const st = calState.get(d);

        const cap = document.createElement('div');
        cap.className = 'ctl-cal-cap';
        cap.textContent = 'Calibrate with the real part';
        cap.title = 'Measure starting angle and swing from the real knob instead of typing them. Zero first, then swing — swing keeps the zero.';
        wrap.appendChild(cap);

        const live = document.createElement('b');
        live.className = 'ctl-cal-live';
        live.textContent = '—';
        wrap.appendChild(plainRow('input now', 'what the input driving this part reads right now', live));
        if (!d.input.startsWith('ch:')) {
            const p = document.createElement('p');
            p.className = 'hint ctl-cal-note';
            p.textContent = 'This part follows a combined input, not one knob. A zero here only holds while the other inputs stay put. For a real knob, pick knob N in the sentence above (or the independent choice in the HUD).';
            wrap.appendChild(p);
        }

        const zeroBtn = button('Zero here',
            `Hold the real part at its resting angle (${rest}°, the resting angle above), then click: starting angle is set so the screen matches.`);
        zeroBtn.addEventListener('click', () => {
            const k = settledInput(d);
            if (k == null) return;
            zeroDriver(d, k, restNow());
            calState.set(d, { k0: k, rest: restNow(), note: `Zeroed at ${fmtInput(d.input, k)}. Now turn the real part and set the swing.` });
            ctx.commit({});
            render();
        });
        wrap.appendChild(plainRow('1 · zero', `real part resting at ${rest}°, then`, zeroBtn));

        const amount = numberInput(90, 1, () => {}, 'how far you turned the real part, in degrees');
        amount.className = 'ctl-cal-deg';
        const dir = selectInput([
            { value: 1, label: '↺ counter-clockwise' },
            { value: -1, label: '↻ clockwise' },
        ], 1, () => {}, 'direction as you see it on screen');
        const swingBtn = button('Set swing',
            'Turn the real part by the amount shown, then click: swing is measured from how far the input moved. Turning the other way is no longer needed after this.');
        swingBtn.disabled = !st;
        swingBtn.addEventListener('click', () => {
            const s = calState.get(d);
            const k1 = settledInput(d);
            if (!s || k1 == null) return;
            const turned = (Number.parseFloat(amount.value) || 0) * Number(dir.value);
            if (!turned) {
                s.note = 'Enter how far you turned the real part first.';
                render();
                return;
            }
            if (!spanDriver(d, s.k0, k1, turned, s.rest)) {
                s.note = 'The input barely moved since zero — turn the real part further, then try again.';
                render();
                return;
            }
            s.note = `Swing set: a full input sweep turns it ${Math.abs(d.amplitude).toFixed(0)}° `
                + `${d.amplitude < 0 ? 'clockwise' : 'counter-clockwise'}. Zero kept.`;
            ctx.commit({});
            render();
        });
        wrap.appendChild(plainRow('2 · swing', 'then turn the real part by this much and', amount, dir, swingBtn));

        if (st?.note) {
            const note = document.createElement('p');
            note.className = 'hint ctl-cal-note';
            note.textContent = st.note;
            wrap.appendChild(note);
        }
        liveEls.add({ d, ref: d.input, el: live, zeroBtn, swingBtn });
        return wrap;
    }

    // --- authoring verbs -------------------------------------------------------

    function uniqueId(doc, base) {
        let n = 1;
        while (doc.objects.some((o) => o.id === `${base}${n}`)) n += 1;
        return `${base}${n}`;
    }

    function addObject(kind) {
        const doc = ctx.getDoc();
        doc.objects ??= [];
        const firstMat = Object.keys(doc.materials ?? {})[0];
        let obj;
        if (kind === 'group') {
            obj = { id: uniqueId(doc, 'anchor'), type: 'group', position: [0, 2, 0] };
        } else if (kind === 'model') {
            const model = Object.keys(doc.models ?? {})[0];
            obj = {
                id: uniqueId(doc, 'part'), type: 'model', model,
                material: firstMat, position: [0, 2, 0],
                body: 'kinematic', collider: { size: [2, 1, 1], offset: [0, 0, 0] },
            };
        } else {
            obj = {
                id: uniqueId(doc, 'box'), type: 'box', size: [2, 2, 2],
                material: firstMat, position: [0, 4, 0],
                body: kind === 'box-dynamic' ? 'dynamic' : 'static',
            };
            if (kind === 'box-dynamic') Object.assign(obj, { mass: 1, plane2d: true, resettable: true });
        }
        doc.objects.push(obj);
        ctx.setSelected(obj.id);
        ctx.commit({ rebuild: true });
    }

    /** Rename a part and cascade to every reference in the document. */
    function renameObject(oldId, newId) {
        const doc = ctx.getDoc();
        newId = newId.trim();
        if (!newId || newId === oldId) return false;
        if (doc.objects.some((o) => o.id === newId)) {
            alert(`There is already a part named '${newId}'.`);
            return false;
        }
        for (const o of doc.objects) {
            if (o.id === oldId) o.id = newId;
            if (o.parent === oldId) o.parent = newId;
        }
        for (const p of Object.keys(doc.patches ?? {})) {
            for (const d of doc.patches[p]) if (d.target === oldId) d.target = newId;
        }
        for (const ov of doc.overlays ?? []) if (ov.attach === oldId) ov.attach = newId;
        ctx.setSelected(newId);
        ctx.commit({ rebuild: true });
        return true;
    }

    function deleteObject(id) {
        const doc = ctx.getDoc();
        const dead = new Set([id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const o of doc.objects) {
                if (!dead.has(o.id) && o.parent && dead.has(o.parent)) {
                    dead.add(o.id);
                    grew = true;
                }
            }
        }
        doc.objects = doc.objects.filter((o) => !dead.has(o.id));
        for (const p of Object.keys(doc.patches ?? {})) {
            doc.patches[p] = doc.patches[p].filter((d) => !dead.has(d.target));
        }
        if (doc.overlays) doc.overlays = doc.overlays.filter((ov) => !dead.has(ov.attach));
        ctx.setSelected(null);
        ctx.commit({ rebuild: true });
    }

    // --- render ---------------------------------------------------------------

    function render() {
        liveEls.clear();
        baselineEls.clear();
        if (destroyed) return;
        const doc = ctx.getDoc();
        if (!doc) { container.innerHTML = '<p class="hint">No scene loaded.</p>'; return; }
        const selected = ctx.getSelected();
        const scrollTop = container.scrollTop;
        container.innerHTML = '';
        transformRefs.id = null;
        transformRefs.pos = [];
        transformRefs.rot = null;

        // header ----------------------------------------------------------------
        const head = document.createElement('div');
        head.className = 'insp-head';
        head.innerHTML = `
            <div class="insp-head-title">
                <b>Edit scene</b>
                <small class="why">click a part in the scene or the list to change it</small>
            </div>
            <span class="draft-chip" ${ctx.isDraft() ? '' : 'hidden'}>your copy</span>
            <span class="insp-head-btns">
                <button data-a="new" title="Start from the blank bench scene">New empty scene</button>
                <button data-a="export" title="download this scene as JSON">Save to file</button>
                <button data-a="import" title="load a scene JSON">Open file</button>
                <button data-a="revert" title="Throw away your edits, restore the original scene" ${ctx.isDraft() ? '' : 'hidden'}>Undo all my edits</button>
            </span>
            <input type="file" accept=".json,application/json" hidden>
        `;
        const fileInput = head.querySelector('input[type=file]');
        head.querySelector('[data-a="new"]').addEventListener('click', () => {
            const q = new URLSearchParams(window.location.search);
            q.set('scene', 'blank');
            q.set('edit', '1');
            window.location.search = q.toString();
        });
        head.querySelector('[data-a="export"]').addEventListener('click', ctx.exportDoc);
        head.querySelector('[data-a="import"]').addEventListener('click', () => fileInput.click());
        head.querySelector('[data-a="revert"]').addEventListener('click', () => {
            if (confirm('Throw away every edit and restore the original scene?')) ctx.revertDraft();
        });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                ctx.importDoc(JSON.parse(await file.text()));
            } catch (err) {
                alert(`That file isn't a scene document: ${err.message}`);
            }
        });
        container.appendChild(head);

        // parts list ---------------------------------------------------------------
        container.appendChild(sectionHead('Parts', 'everything in the scene · click one to change it'));
        const tree = document.createElement('ul');
        tree.className = 'insp-tree';
        const byId = new Map((doc.objects ?? []).map((x) => [x.id, x]));
        const depthOf = (o) => {
            let d = 0;
            let cur = o;
            while (cur.parent && byId.has(cur.parent)) { d += 1; cur = byId.get(cur.parent); }
            return d;
        };
        for (const o of doc.objects ?? []) {
            const li = document.createElement('li');
            li.style.paddingLeft = `${0.4 + depthOf(o) * 0.9}rem`;
            const role = roleOf(o, doc);
            li.title = role.tip;
            li.innerHTML = `<b>${o.id}</b><span class="t-chip"><i class="role-dot ${role.className}"></i>${role.word}</span>`;
            if (o.id === selected) li.className = 'selected';
            li.addEventListener('click', () => ctx.setSelected(o.id === selected ? null : o.id));
            tree.appendChild(li);
        }
        container.appendChild(tree);

        const addRow = document.createElement('div');
        addRow.className = 'insp-addrow';
        const kinds = [
            { value: 'box-dynamic', label: 'block that falls' },
            { value: 'box-static', label: 'block that stays put' },
            { value: 'group', label: 'pivot (invisible)' },
        ];
        if (Object.keys(doc.models ?? {}).length) kinds.push({ value: 'model', label: 'lever' });
        const kindSel = selectInput(kinds, 'box-dynamic', () => {});
        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add';
        addBtn.addEventListener('click', () => addObject(kindSel.value));
        addRow.appendChild(kindSel);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);

        // ======= everything below exists ONLY for a selection =======
        const obj = (doc.objects ?? []).find((o) => o.id === selected);
        if (!obj) {
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.style.marginTop = '0.8rem';
            hint.innerHTML = '<strong>Nothing selected.</strong> Click a part in the scene or in the list above.';
            container.appendChild(hint);
            container.scrollTop = scrollTop;
            return;
        }

        // link lookup for this part, computed early for the summary line ------------
        const patch = ctx.getCurrentPatch();
        doc.patches ??= {};
        doc.patches[patch] ??= [];
        const allDrivers = doc.patches[patch];
        const mine = allDrivers.filter((d) => d.target === obj.id);

        // selected part properties -------------------------------------------------
        const fieldsTitle = h4(obj.id);
        fieldsTitle.className = 'insp-obj-title';
        const del = document.createElement('button');
        del.className = 'insp-del';
        del.textContent = 'Delete';
        del.title = 'removes this part and anything attached to it';
        del.addEventListener('click', () => {
            if (confirm(`Delete '${obj.id}' and everything attached to it?`)) deleteObject(obj.id);
        });
        fieldsTitle.appendChild(del);
        container.appendChild(fieldsTitle);

        const summary = document.createElement('div');
        summary.className = 'obj-summary';
        summary.textContent = summaryLine(obj, mine);
        container.appendChild(summary);

        // name — any label you like; every reference follows the rename
        const nameEl = document.createElement('input');
        nameEl.type = 'text';
        nameEl.value = obj.id;
        nameEl.title = 'Rename this part — attachments, links, and overlays all follow';
        nameEl.addEventListener('change', () => {
            if (!renameObject(obj.id, nameEl.value)) nameEl.value = obj.id;
        });
        container.appendChild(fieldRow('name', 'part id', null, nameEl));

        obj.position ??= [0, 0, 0];
        const live = () => ctx.liveTransform(obj.id);
        transformRefs.id = obj.id;
        transformRefs.pos = [0, 1, 2].map((i) => numberInput(obj.position[i] ?? 0, 0.1, (v) => {
            obj.position[i] = v;
            live();
        }));
        container.appendChild(fieldRow('position', 'x · y · z — or drag the arrows', 'x · y · z — or drag the arrows', ...transformRefs.pos));
        transformRefs.rot = numberInput(obj.rotationZ ?? 0, 1, (v) => {
            obj.rotationZ = v;
            followRest(obj);
            live();
        }, 'where it sits when nothing moves it — or drag the ring in Turn mode');
        container.appendChild(fieldRow('resting angle', 'where it sits when nothing moves it — or drag the ring',
            'where it sits when nothing moves it — or drag the ring', transformRefs.rot));

        const rebuild = () => ctx.commit({ rebuild: true });
        if (obj.size) {
            container.appendChild(fieldRow('size', 'width · height · depth', 'width · height · depth',
                ...[0, 1, 2].map((i) => numberInput(obj.size[i] ?? 1, 0.1, (v) => {
                    obj.size[i] = v;
                    rebuild();
                }))));
        }
        if (obj.body === 'dynamic') {
            container.appendChild(fieldRow('weight', 'heavier is harder to push', 'heavier is harder to push',
                numberInput(obj.mass ?? 1, 0.1, (v) => {
                    obj.mass = v;
                    rebuild();
                })));
        }
        const idx = doc.objects.indexOf(obj);
        const parentOpts = [{ value: '', label: '(the world)' },
            ...doc.objects.slice(0, idx).map((o) => ({ value: o.id, label: o.id }))];
        container.appendChild(fieldRow('attached to', 'moves along with this part', 'moves along with this part',
            selectInput(parentOpts, obj.parent ?? '', (v) => {
                if (v) obj.parent = v; else delete obj.parent;
                rebuild();
            })));
        if (doc.materials && obj.type !== 'group') {
            const matOpts = Object.keys(doc.materials).map((m) => ({ value: m, label: m }));
            container.appendChild(fieldRow('color', 'material', null, selectInput(matOpts, obj.material, (v) => {
                obj.material = v;
                rebuild();
            })));
        }

        // what moves it: only links that drive THIS part ----------------------------------------
        container.appendChild(sectionHead('What moves it', 'links from knobs to this part'));

        const inputOpts = [];
        for (let i = 0; i < 8; i++) inputOpts.push({ value: `ch:${i}`, label: `knob ${i}` });
        for (const n of doc.nodes ?? []) inputOpts.push({ value: `node:${n.id}`, label: `mix ${n.id}` });

        if (!mine.length) {
            const none = document.createElement('p');
            none.className = 'hint';
            none.textContent = 'Nothing moves this part yet.';
            container.appendChild(none);
        }

        for (const d of mine) {
            const card = document.createElement('div');
            card.className = 'ctl-card';

            const sentence = document.createElement('div');
            sentence.className = 'ctl-sentence';
            const inputSel = selectInput(inputOpts, d.input, (v) => {
                d.input = v;
                ctx.commit({});
                render();
            }, 'which input moves this part');
            sentence.appendChild(inputSel);
            const verb = document.createElement('span');
            verb.textContent = 'moves this part';
            sentence.appendChild(verb);
            const disc = document.createElement('button');
            disc.className = 'insp-del';
            disc.textContent = 'Unlink';
            disc.title = 'This knob stops moving this part';
            disc.addEventListener('click', () => {
                allDrivers.splice(allDrivers.indexOf(d), 1);
                ctx.commit({ rebuild: true });
            });
            sentence.appendChild(disc);
            card.appendChild(sentence);

            const liveD = () => ctx.commit({});
            const baseEl = numberInput(d.baseline ?? 0, 1, (v) => { d.baseline = v; liveD(); });
            baselineEls.set(d, baseEl);
            card.appendChild(fieldRow('starting angle', 'where it points when the knob reads 0',
                'where it points when the knob reads 0', baseEl));
            card.appendChild(fieldRow('swing', 'degrees for one full knob turn · negative = the other way',
                'degrees for one full knob turn · negative = the other way',
                numberInput(d.amplitude ?? 0, 1, (v) => { d.amplitude = v; liveD(); })));

            const lerpVal = d.lerp ?? 0;
            const preset = RESPONSE_PRESETS.find((p) => Math.abs(p.value - lerpVal) < 0.011);
            const respOpts = [...RESPONSE_PRESETS];
            if (!preset) respOpts.push({ value: lerpVal, label: `custom (${lerpVal})` });
            card.appendChild(fieldRow('follow', 'how fast it follows the knob', 'how fast it follows the knob',
                selectInput(respOpts, preset?.value ?? lerpVal, (v) => {
                    d.lerp = Number.parseFloat(v);
                    liveD();
                })));

            const inv = document.createElement('input');
            inv.type = 'checkbox';
            inv.checked = Boolean(d.invert);
            inv.title = 'turn the knob one way, the part the other';
            inv.addEventListener('change', () => { d.invert = inv.checked; liveD(); });
            card.appendChild(fieldRow('turn the other way', null, null, inv));

            card.appendChild(calibrationRows(d, obj));
            container.appendChild(card);
        }

        const addD = document.createElement('button');
        addD.className = 'insp-add-driver';
        addD.textContent = '+ Link a knob';
        addD.addEventListener('click', () => {
            allDrivers.push({
                target: obj.id,
                property: 'rotationZ',
                input: 'ch:0',
                baseline: obj.rotationZ ?? 0,
                amplitude: 90,
                lerp: 0.2,
            });
            ctx.commit({ rebuild: true });
        });
        container.appendChild(addD);

        container.scrollTop = scrollTop;
    }

    render();
    return {
        render,
        syncTransform() {
            const doc = ctx.getDoc();
            const obj = doc?.objects?.find((o) => o.id === transformRefs.id);
            if (!obj) return;
            transformRefs.pos.forEach((el, i) => {
                if (document.activeElement !== el) el.value = obj.position?.[i] ?? 0;
            });
            if (transformRefs.rot && document.activeElement !== transformRefs.rot) {
                transformRefs.rot.value = obj.rotationZ ?? 0;
            }
        },
        setDraft(isDraft) {
            container.querySelector('.draft-chip')?.toggleAttribute('hidden', !isDraft);
            container.querySelector('[data-a="revert"]')?.toggleAttribute('hidden', !isDraft);
        },
        destroy() { destroyed = true; clearInterval(liveTimer); liveEls.clear(); container.innerHTML = ''; },
    };
}
