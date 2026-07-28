/**
 * Inspector — authoring surface (AUTHORING.md layers 3+4: editing AND
 * authoring verbs). Object tree + add/delete/reparent, the selected
 * object's document entry as fields, and driver CRUD on the current patch.
 *
 * Contract with the workspace: the inspector never touches the 3D world.
 * It mutates the document and calls ctx.markDirty({ reload }). Object and
 * driver-list changes rebuild the scene; driver FIELD edits apply live
 * because the engine reads patch arrays and target ids by reference.
 */

export function mountInspector(container, ctx) {
    let destroyed = false;

    function numberInput(value, step, onChange) {
        const el = document.createElement('input');
        el.type = 'number';
        el.step = step;
        el.value = Number.isFinite(value) ? value : 0;
        el.addEventListener('change', () => {
            const v = Number.parseFloat(el.value);
            if (Number.isFinite(v)) onChange(v);
        });
        return el;
    }

    function fieldRow(label, ...inputs) {
        const row = document.createElement('label');
        row.className = 'insp-row';
        const span = document.createElement('span');
        span.textContent = label;
        row.appendChild(span);
        const holder = document.createElement('div');
        holder.className = 'insp-inputs';
        for (const i of inputs) holder.appendChild(i);
        row.appendChild(holder);
        return row;
    }

    function vecInputs(arr, onChange) {
        return [0, 1, 2].map((i) => numberInput(arr[i] ?? 0, 0.1, (v) => {
            arr[i] = v;
            onChange();
        }));
    }

    function selectInput(options, current, onChange) {
        const sel = document.createElement('select');
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
        const matIds = Object.keys(doc.materials ?? {});
        const firstMat = matIds[0];
        let obj;
        if (kind === 'group') {
            obj = { id: uniqueId(doc, 'group'), type: 'group', position: [0, 2, 0] };
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
        ctx.markDirty({ reload: true });
    }

    function deleteObject(id) {
        const doc = ctx.getDoc();
        const dead = new Set([id]);
        let grew = true;
        while (grew) { // cascade to descendants (parents always declared earlier)
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
        ctx.markDirty({ reload: true });
    }

    function inputRefOptions(doc) {
        const refs = [];
        for (let i = 0; i < 4; i++) refs.push(`ch:${i}`);
        for (const n of doc.nodes ?? []) refs.push(`node:${n.id}`);
        return refs;
    }

    // --- render -------------------------------------------------------------

    function render() {
        if (destroyed) return;
        const doc = ctx.getDoc();
        if (!doc) { container.innerHTML = '<p class="hint">No scene loaded.</p>'; return; }
        const selected = ctx.getSelected();
        container.innerHTML = '';

        // header
        const head = document.createElement('div');
        head.className = 'insp-head';
        head.innerHTML = `
            <b>Inspector</b>
            ${ctx.isDraft() ? '<span class="draft-chip">draft</span>' : ''}
            <span class="insp-head-btns">
                <button data-a="export" title="Download scene JSON">Export</button>
                <button data-a="import" title="Load scene JSON from file">Import</button>
                ${ctx.isDraft() ? '<button data-a="revert" title="Discard draft, restore original">Revert</button>' : ''}
            </span>
            <input type="file" accept=".json,application/json" hidden>
        `;
        const fileInput = head.querySelector('input[type=file]');
        head.querySelector('[data-a="export"]').addEventListener('click', ctx.exportDoc);
        head.querySelector('[data-a="import"]').addEventListener('click', () => fileInput.click());
        head.querySelector('[data-a="revert"]')?.addEventListener('click', ctx.revertDraft);
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                ctx.importDoc(JSON.parse(await file.text()));
            } catch (err) {
                alert(`Not a valid scene document: ${err.message}`);
            }
        });
        container.appendChild(head);

        // object tree
        const treeTitle = document.createElement('h4');
        treeTitle.textContent = 'Objects';
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
            li.style.paddingLeft = `${depthOf(o) * 0.9}rem`;
            li.textContent = `${o.id} · ${o.type}${o.body ? ` (${o.body})` : ''}`;
            if (o.id === selected) li.className = 'selected';
            li.addEventListener('click', () => ctx.setSelected(o.id === selected ? null : o.id));
            tree.appendChild(li);
        }
        container.appendChild(tree);

        // add-object controls
        const addRow = document.createElement('div');
        addRow.className = 'insp-addrow';
        const kinds = [
            { value: 'box-static', label: 'box (static)' },
            { value: 'box-dynamic', label: 'box (dynamic)' },
            { value: 'group', label: 'group (joint)' },
        ];
        if (Object.keys(doc.models ?? {}).length) kinds.push({ value: 'model', label: 'model part' });
        const kindSel = selectInput(kinds, 'box-dynamic', () => {});
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add object';
        addBtn.addEventListener('click', () => addObject(kindSel.value));
        addRow.appendChild(kindSel);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);

        // selected object fields
        const obj = (doc.objects ?? []).find((o) => o.id === selected);
        const fieldsTitle = document.createElement('h4');
        fieldsTitle.className = 'insp-obj-title';
        fieldsTitle.textContent = obj ? `Object · ${obj.id}` : 'Object';
        if (obj) {
            const del = document.createElement('button');
            del.className = 'insp-del';
            del.textContent = 'Delete';
            del.title = 'Delete this object (and its children, drivers, overlays)';
            del.addEventListener('click', () => {
                if (confirm(`Delete '${obj.id}' and everything attached to it?`)) deleteObject(obj.id);
            });
            fieldsTitle.appendChild(del);
        }
        container.appendChild(fieldsTitle);

        if (!obj) {
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.textContent = 'Click an object in the scene or the tree.';
            container.appendChild(hint);
        } else {
            const reload = () => ctx.markDirty({ reload: true });
            obj.position ??= [0, 0, 0];
            container.appendChild(fieldRow('position', ...vecInputs(obj.position, reload)));
            container.appendChild(fieldRow('rotZ °', numberInput(obj.rotationZ ?? 0, 1, (v) => {
                obj.rotationZ = v;
                reload();
            })));
            if (obj.size) container.appendChild(fieldRow('size', ...vecInputs(obj.size, reload)));
            if (obj.body === 'dynamic') {
                container.appendChild(fieldRow('mass', numberInput(obj.mass ?? 1, 0.1, (v) => {
                    obj.mass = v;
                    reload();
                })));
            }
            // parent: only objects declared EARLIER are legal (keeps the
            // document acyclic by construction — AUTHORING.md rule 4)
            const idx = doc.objects.indexOf(obj);
            const parentOpts = [{ value: '', label: '(scene root)' },
                ...doc.objects.slice(0, idx).map((o) => ({ value: o.id, label: o.id }))];
            container.appendChild(fieldRow('parent', selectInput(parentOpts, obj.parent ?? '', (v) => {
                if (v) obj.parent = v; else delete obj.parent;
                reload();
            })));
            if (doc.materials && obj.type !== 'group') {
                const matOpts = Object.keys(doc.materials).map((m) => ({ value: m, label: m }));
                container.appendChild(fieldRow('material', selectInput(matOpts, obj.material, (v) => {
                    obj.material = v;
                    reload();
                })));
            }
        }

        // drivers of the current patch
        const patch = ctx.getCurrentPatch();
        doc.patches ??= {};
        doc.patches[patch] ??= [];
        const drivers = doc.patches[patch];
        const dTitle = document.createElement('h4');
        dTitle.className = 'insp-obj-title';
        dTitle.textContent = `Drivers · ${patch}`;
        const saveAs = document.createElement('button');
        saveAs.className = 'insp-del';
        saveAs.textContent = 'Save as…';
        saveAs.title = 'Copy these drivers into a new named patch';
        saveAs.addEventListener('click', () => {
            const name = prompt('New patch name:');
            if (!name || doc.patches[name]) return;
            doc.patches[name] = JSON.parse(JSON.stringify(drivers));
            ctx.markDirty({ reload: true });
        });
        dTitle.appendChild(saveAs);
        container.appendChild(dTitle);

        const refOpts = inputRefOptions(doc).map((r) => ({ value: r, label: r }));
        const targetOpts = (doc.objects ?? []).map((o) => ({ value: o.id, label: o.id }));

        drivers.forEach((d, i) => {
            const box = document.createElement('div');
            box.className = 'insp-driver';
            const cap = document.createElement('div');
            cap.className = 'insp-driver-cap';
            cap.textContent = `driver ${i + 1}`;
            const delD = document.createElement('button');
            delD.className = 'insp-del';
            delD.textContent = '×';
            delD.title = 'Remove this driver';
            delD.addEventListener('click', () => {
                drivers.splice(i, 1);
                ctx.markDirty({ reload: true });
            });
            cap.appendChild(delD);
            box.appendChild(cap);

            const live = () => ctx.markDirty({ reload: false });
            box.appendChild(fieldRow('target', selectInput(targetOpts, d.target, (v) => { d.target = v; live(); })));
            box.appendChild(fieldRow('input', selectInput(refOpts, d.input, (v) => { d.input = v; live(); })));
            box.appendChild(fieldRow('baseline', numberInput(d.baseline ?? 0, 1, (v) => { d.baseline = v; live(); })));
            box.appendChild(fieldRow('amplitude', numberInput(d.amplitude ?? 0, 1, (v) => { d.amplitude = v; live(); })));
            box.appendChild(fieldRow('lerp', numberInput(d.lerp ?? 0, 0.05, (v) => { d.lerp = v; live(); })));
            const inv = document.createElement('input');
            inv.type = 'checkbox';
            inv.checked = Boolean(d.invert);
            inv.addEventListener('change', () => { d.invert = inv.checked; live(); });
            box.appendChild(fieldRow('invert', inv));
            container.appendChild(box);
        });

        const addD = document.createElement('button');
        addD.className = 'insp-add-driver';
        addD.textContent = '+ Add driver';
        addD.addEventListener('click', () => {
            drivers.push({
                target: selected ?? doc.objects?.[0]?.id,
                property: 'rotationZ',
                input: 'ch:0',
                baseline: 0,
                amplitude: 90,
                lerp: 0.2,
            });
            ctx.markDirty({ reload: true });
        });
        container.appendChild(addD);
    }

    render();
    return {
        refresh: render,
        destroy() { destroyed = true; container.innerHTML = ''; },
    };
}
