/**
 * Inspector v2 — workshop round (ruling 2026-07-27):
 *  - speaks human, not schema: Box/Joint/Part, fixed/physics/driven,
 *    Knob N instead of ch:N, rest/sweep/smoothing instead of
 *    baseline/amplitude/lerp (schema names live in tooltips)
 *  - field edits NEVER re-render the panel (no focus/scroll loss);
 *    structural changes re-render with scroll preserved
 *  - transform fields apply live via ctx.liveTransform (no scene rebuild)
 *    and stay in sync with viewport gizmo drags via syncTransform()
 *
 * ctx contract:
 *   getDoc, getSelected, setSelected, isDraft,
 *   exportDoc, importDoc(parsed), revertDraft,
 *   getCurrentPatch,
 *   commit({rebuild})   — persist draft + undo history (+ rebuild scene)
 *   liveTransform(id)   — doc transform changed; push into live scene
 */

const TYPE_LABEL = { box: 'Box', group: 'Joint', model: 'Part' };
const BODY_LABEL = { static: 'fixed', dynamic: 'physics', kinematic: 'driven' };

function humanRef(ref) {
    if (!ref) return '—';
    if (ref.startsWith('ch:')) return `Knob ${ref.slice(3)}`;
    if (ref.startsWith('node:')) return `Node ${ref.slice(5)}`;
    return ref;
}

export function mountInspector(container, ctx) {
    let destroyed = false;
    const transformRefs = { id: null, pos: [], rot: null };

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

    function fieldRow(label, tooltip, ...inputs) {
        const row = document.createElement('label');
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

    function selectInput(options, current, onChange, tooltip) {
        const sel = document.createElement('select');
        if (tooltip) sel.title = tooltip;
        for (const { value, label } of options) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label ?? value;
            if (value === current) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', () => onChange(sel.value));
        return sel;
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
            obj = { id: uniqueId(doc, 'joint'), type: 'group', position: [0, 2, 0] };
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
        if (destroyed) return;
        const doc = ctx.getDoc();
        if (!doc) { container.innerHTML = '<p class="hint">No scene loaded.</p>'; return; }
        const selected = ctx.getSelected();
        const scrollTop = container.scrollTop;
        container.innerHTML = '';
        transformRefs.id = null;
        transformRefs.pos = [];
        transformRefs.rot = null;

        // header
        const head = document.createElement('div');
        head.className = 'insp-head';
        head.innerHTML = `
            <b>Inspector</b>
            <span class="draft-chip" ${ctx.isDraft() ? '' : 'hidden'}>edited</span>
            <span class="insp-head-btns">
                <button data-a="export" title="Download this scene as a JSON file">Save file</button>
                <button data-a="import" title="Open a scene JSON file">Open</button>
                <button data-a="revert" title="Throw away your edits, restore the original scene" ${ctx.isDraft() ? '' : 'hidden'}>Undo all</button>
            </span>
            <input type="file" accept=".json,application/json" hidden>
        `;
        const fileInput = head.querySelector('input[type=file]');
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

        // scene tree
        const treeTitle = document.createElement('h4');
        treeTitle.textContent = 'Scene';
        container.appendChild(treeTitle);
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
            const chips = [TYPE_LABEL[o.type] ?? o.type];
            if (o.body) chips.push(BODY_LABEL[o.body] ?? o.body);
            li.innerHTML = `<b>${o.id}</b><span class="t-chip">${chips.join(' · ')}</span>`;
            if (o.id === selected) li.className = 'selected';
            li.addEventListener('click', () => ctx.setSelected(o.id === selected ? null : o.id));
            tree.appendChild(li);
        }
        container.appendChild(tree);

        // add-object controls
        const addRow = document.createElement('div');
        addRow.className = 'insp-addrow';
        const kinds = [
            { value: 'box-dynamic', label: 'Box — falls & collides' },
            { value: 'box-static', label: 'Box — fixed in place' },
            { value: 'group', label: 'Joint — invisible pivot' },
        ];
        if (Object.keys(doc.models ?? {}).length) kinds.push({ value: 'model', label: 'Part — lever model' });
        const kindSel = selectInput(kinds, 'box-dynamic', () => {});
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add';
        addBtn.addEventListener('click', () => addObject(kindSel.value));
        addRow.appendChild(kindSel);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);

        // selected object
        const obj = (doc.objects ?? []).find((o) => o.id === selected);
        const fieldsTitle = document.createElement('h4');
        fieldsTitle.className = 'insp-obj-title';
        fieldsTitle.textContent = obj ? obj.id : 'Selection';
        if (obj) {
            const del = document.createElement('button');
            del.className = 'insp-del';
            del.textContent = 'Delete';
            del.title = 'Remove this object and everything attached to it';
            del.addEventListener('click', () => {
                if (confirm(`Delete '${obj.id}' and everything attached to it?`)) deleteObject(obj.id);
            });
            fieldsTitle.appendChild(del);
        }
        container.appendChild(fieldsTitle);

        if (!obj) {
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.textContent = 'Click something in the scene (or the list above). Drag the arrows to move it, or use the fields for exact numbers.';
            container.appendChild(hint);
        } else {
            obj.position ??= [0, 0, 0];
            const live = () => ctx.liveTransform(obj.id);
            transformRefs.id = obj.id;
            transformRefs.pos = [0, 1, 2].map((i) => numberInput(obj.position[i] ?? 0, 0.1, (v) => {
                obj.position[i] = v;
                live();
            }));
            container.appendChild(fieldRow('position', 'position [x, y, z] in scene units', ...transformRefs.pos));
            transformRefs.rot = numberInput(obj.rotationZ ?? 0, 1, (v) => {
                obj.rotationZ = v;
                live();
            }, 'rotationZ (degrees)');
            container.appendChild(fieldRow('angle °', 'rotationZ', transformRefs.rot));

            const rebuild = () => ctx.commit({ rebuild: true });
            if (obj.size) {
                container.appendChild(fieldRow('size', 'size [x, y, z]',
                    ...[0, 1, 2].map((i) => numberInput(obj.size[i] ?? 1, 0.1, (v) => {
                        obj.size[i] = v;
                        rebuild();
                    }))));
            }
            if (obj.body === 'dynamic') {
                container.appendChild(fieldRow('mass', 'mass (kg-ish)', numberInput(obj.mass ?? 1, 0.1, (v) => {
                    obj.mass = v;
                    rebuild();
                })));
            }
            const idx = doc.objects.indexOf(obj);
            const parentOpts = [{ value: '', label: '(the world)' },
                ...doc.objects.slice(0, idx).map((o) => ({ value: o.id, label: o.id }))];
            container.appendChild(fieldRow('attached to', 'parent — what this object moves with', selectInput(parentOpts, obj.parent ?? '', (v) => {
                if (v) obj.parent = v; else delete obj.parent;
                rebuild();
            })));
            if (doc.materials && obj.type !== 'group') {
                const matOpts = Object.keys(doc.materials).map((m) => ({ value: m, label: m }));
                container.appendChild(fieldRow('appearance', 'material', selectInput(matOpts, obj.material, (v) => {
                    obj.material = v;
                    rebuild();
                })));
            }
        }

        // motion (drivers of the current patch)
        const patch = ctx.getCurrentPatch();
        doc.patches ??= {};
        doc.patches[patch] ??= [];
        const drivers = doc.patches[patch];
        const dTitle = document.createElement('h4');
        dTitle.className = 'insp-obj-title';
        dTitle.textContent = `Motion · ${patch}`;
        dTitle.title = 'Drivers: each one turns an input into an object\'s angle';
        const saveAs = document.createElement('button');
        saveAs.className = 'insp-del';
        saveAs.textContent = 'Save as…';
        saveAs.title = 'Keep these motion settings as a new named setup';
        saveAs.addEventListener('click', () => {
            const name = prompt('Name for this motion setup:');
            if (!name || doc.patches[name]) return;
            doc.patches[name] = JSON.parse(JSON.stringify(drivers));
            ctx.commit({ rebuild: true });
        });
        dTitle.appendChild(saveAs);
        container.appendChild(dTitle);

        const refOpts = [];
        for (let i = 0; i < 4; i++) refOpts.push({ value: `ch:${i}`, label: `Knob ${i}` });
        for (const n of doc.nodes ?? []) refOpts.push({ value: `node:${n.id}`, label: `Node ${n.id}` });
        const targetOpts = (doc.objects ?? []).map((o) => ({ value: o.id, label: o.id }));

        drivers.forEach((d, i) => {
            const box = document.createElement('div');
            box.className = 'insp-driver';
            const cap = document.createElement('div');
            cap.className = 'insp-driver-cap';
            cap.textContent = `${d.target} ← ${humanRef(d.input)}`;
            const delD = document.createElement('button');
            delD.className = 'insp-del';
            delD.textContent = '×';
            delD.title = 'Remove this motion link';
            delD.addEventListener('click', () => {
                drivers.splice(i, 1);
                ctx.commit({ rebuild: true });
            });
            cap.appendChild(delD);
            box.appendChild(cap);

            const live = () => ctx.commit({});
            box.appendChild(fieldRow('moves', 'driver target object', selectInput(targetOpts, d.target, (v) => { d.target = v; ctx.commit({ rebuild: true }); })));
            box.appendChild(fieldRow('from', 'driver input (channel or node)', selectInput(refOpts, d.input, (v) => { d.input = v; live(); render(); })));
            box.appendChild(fieldRow('rest °', 'baseline — angle when the input is 0', numberInput(d.baseline ?? 0, 1, (v) => { d.baseline = v; live(); })));
            box.appendChild(fieldRow('sweep °', 'amplitude — how far a full input turn moves it', numberInput(d.amplitude ?? 0, 1, (v) => { d.amplitude = v; live(); })));
            box.appendChild(fieldRow('smoothing', 'lerp — 0 snaps instantly, 0.2 eases like the original', numberInput(d.lerp ?? 0, 0.05, (v) => { d.lerp = v; live(); })));
            const inv = document.createElement('input');
            inv.type = 'checkbox';
            inv.checked = Boolean(d.invert);
            inv.title = 'invert — turn the knob one way, the object goes the other';
            inv.addEventListener('change', () => { d.invert = inv.checked; live(); });
            box.appendChild(fieldRow('reverse', 'invert', inv));
            container.appendChild(box);
        });

        const addD = document.createElement('button');
        addD.className = 'insp-add-driver';
        addD.textContent = '+ Add motion link';
        addD.addEventListener('click', () => {
            drivers.push({
                target: selected ?? doc.objects?.[0]?.id,
                property: 'rotationZ',
                input: 'ch:0',
                baseline: 0,
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
        /** gizmo moved the selected object: reflect doc values in the fields */
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
        destroy() { destroyed = true; container.innerHTML = ''; },
    };
}
