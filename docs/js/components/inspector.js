/**
 * Inspector — the first authoring surface (AUTHORING.md layer 3, "editing
 * verbs"). Shows the scene DOCUMENT: an object tree, the selected object's
 * entry as editable fields, and the current patch's drivers.
 *
 * Contract with the workspace: the inspector never touches the 3D world.
 * It mutates the document and calls ctx.markDirty({ reload }) — object
 * edits need a scene rebuild; driver edits apply live because the engine
 * reads the patch arrays by reference every tick.
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

    function render() {
        if (destroyed) return;
        const doc = ctx.getDoc();
        if (!doc) { container.innerHTML = '<p class="hint">No scene loaded.</p>'; return; }
        const selected = ctx.getSelected();
        container.innerHTML = '';

        // --- header ---------------------------------------------------------
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

        // --- object tree ------------------------------------------------------
        const treeTitle = document.createElement('h4');
        treeTitle.textContent = 'Objects';
        container.appendChild(treeTitle);
        const tree = document.createElement('ul');
        tree.className = 'insp-tree';
        const depthOf = (o) => {
            let d = 0;
            let cur = o;
            const byId = new Map(doc.objects.map((x) => [x.id, x]));
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

        // --- selected object fields ---------------------------------------------
        const obj = (doc.objects ?? []).find((o) => o.id === selected);
        const fieldsTitle = document.createElement('h4');
        fieldsTitle.textContent = obj ? `Object · ${obj.id}` : 'Object';
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
            if (obj.size) {
                container.appendChild(fieldRow('size', ...vecInputs(obj.size, reload)));
            }
            if (obj.body === 'dynamic') {
                container.appendChild(fieldRow('mass', numberInput(obj.mass ?? 1, 0.1, (v) => {
                    obj.mass = v;
                    reload();
                })));
            }
            if (doc.materials && obj.type !== 'group') {
                const sel = document.createElement('select');
                for (const id of Object.keys(doc.materials)) {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = id;
                    if (id === obj.material) opt.selected = true;
                    sel.appendChild(opt);
                }
                sel.addEventListener('change', () => {
                    obj.material = sel.value;
                    reload();
                });
                container.appendChild(fieldRow('material', sel));
            }
        }

        // --- drivers of the current patch (live, no reload) ------------------------
        const patch = ctx.getCurrentPatch();
        const drivers = doc.patches?.[patch] ?? [];
        const dTitle = document.createElement('h4');
        dTitle.textContent = `Drivers · ${patch}`;
        container.appendChild(dTitle);
        drivers.forEach((d) => {
            const box = document.createElement('div');
            box.className = 'insp-driver';
            const cap = document.createElement('div');
            cap.className = 'insp-driver-cap';
            cap.textContent = `${d.target} ← ${d.input}`;
            box.appendChild(cap);
            const live = () => ctx.markDirty({ reload: false });
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
    }

    render();
    return {
        refresh: render,
        destroy() { destroyed = true; container.innerHTML = ''; },
    };
}
