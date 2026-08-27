/**
 * Workspace view — modulab's product surface. Full-bleed viewport + HUD,
 * scene from a scenes-as-data document, and the editing verbs
 * (AUTHORING.md layer 3): click-select, inspector, live document edits
 * with hot-reload, per-scene localStorage drafts, export/import.
 *
 * Document lifecycle: original (scenes/<id>.json) -> draft (localStorage,
 * created on first edit) -> export (file). The document is the single
 * source of truth; object edits rebuild the scene from it (geometry is
 * cached so rebuilds are instant), driver edits apply live by reference.
 */
import * as THREE from '../../vendor/three.module.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { TransformControls } from '../../vendor/TransformControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
import { mountInspector } from '../components/inspector.js';
import { instantiateScene } from '../scene/engine.js';

const SERIES_HEX = {
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
};

let active = null;

export function renderSandbox(container) {
    if (active) { active.teardown(); active = null; }

    container.innerHTML = `
        <div class="view workspace-view">
            <div class="stage-full">
                <canvas class="twin-canvas"></canvas>
                <div class="stage-msg" hidden></div>
                <div class="hud hud-tl" id="connect-mount"></div>
                <div class="hud hud-tr">
                    <span class="scene-name" id="scene-name"></span>
                    <span class="patch-toggle" id="patch-toggle" hidden></span>
                    <span id="giz-modes" hidden>
                        <button class="btn btn-ghost btn-sm" data-m="translate" title="Drag arrows to move (W)">Move</button>
                        <button class="btn btn-ghost btn-sm" data-m="rotate" title="Drag the ring to rotate (E)">Rotate</button>
                    </span>
                    <button class="btn btn-ghost btn-sm" id="ws-reset" title="Put the physics objects back at their start">Reset</button>
                    <button class="btn btn-ghost btn-sm" id="ws-restore" hidden title="Discard your edits and reload the original scene">Restore scene</button>
                    <button class="btn btn-ghost btn-sm" id="ws-edit">Edit</button>
                </div>
                <div class="hud hud-bl" id="ws-readout"></div>
                <div class="hud hud-br">drag · orbit &nbsp; wheel · zoom &nbsp; right-drag · pan</div>
                <div class="hud inspector" id="inspector" hidden></div>
            </div>
        </div>
    `;

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));
    const canvas = container.querySelector('.twin-canvas');
    const stageMsg = container.querySelector('.stage-msg');
    const readout = container.querySelector('#ws-readout');
    const patchEl = container.querySelector('#patch-toggle');
    const sceneNameEl = container.querySelector('#scene-name');
    const inspectorEl = container.querySelector('#inspector');
    const editBtn = container.querySelector('#ws-edit');
    const resetBtn = container.querySelector('#ws-reset');
    const restoreBtn = container.querySelector('#ws-restore');
    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const urlParams = new URLSearchParams(window.location.search);

    // --- Viewport shell ---------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'light' ? 0xdfe3ea : 0x101318);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 200);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 80;

    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-10, 14, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 20, bottom: -12, far: 60 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // Viewport gizmo — viewport-first editing (workshop ruling 2026-07-27)
    const modeBtns = container.querySelector('#giz-modes');
    const gizmo = new TransformControls(camera, canvas);
    gizmo.setSize(0.85);
    scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);

    function setGizmoMode(m) {
        gizmo.setMode(m);
        const rot = m === 'rotate';
        gizmo.showX = !rot; // rotate mode: only the Z ring matters in-plane
        gizmo.showY = !rot;
        gizmo.showZ = true;
        for (const b of modeBtns.querySelectorAll('button')) {
            b.classList.toggle('active', b.dataset.m === m);
        }
    }
    for (const b of modeBtns.querySelectorAll('button')) {
        b.addEventListener('click', () => setGizmoMode(b.dataset.m));
    }

    let gizmoSyncAt = 0;
    gizmo.addEventListener('dragging-changed', (e) => {
        controls.enabled = !e.value;
        if (!e.value && selectedId) { // drag ended: settle doc + history
            inst?.commitTransform(selectedId);
            inspector?.syncTransform();
            commit({});
        }
    });
    gizmo.addEventListener('objectChange', () => {
        if (!selectedId) return;
        const now = performance.now();
        if (now - gizmoSyncAt > 60) { // throttled write-back during the drag
            gizmoSyncAt = now;
            inst?.commitTransform(selectedId);
            inspector?.syncTransform();
        }
    });

    // --- Stream state -------------------------------------------------------
    const lastValues = new Map();
    const chBadges = new Map();
    let driverBadges = [];

    function ensureChannelBadge(ch) {
        if (chBadges.has(ch)) return;
        const el = document.createElement('span');
        el.className = 'twin-badge';
        el.innerHTML = `<span class="series-chip" style="background:${SERIES_HEX[mode][ch % 8]}"></span>CH ${ch} <b>—</b>`;
        readout.prepend(el);
        chBadges.set(ch, el.querySelector('b'));
    }

    const offSample = stream.onSample(({ ch, value }) => {
        lastValues.set(ch, value);
        ensureChannelBadge(ch);
    });

    // --- Document lifecycle ---------------------------------------------------
    const sceneId = urlParams.get('scene') || 'pol-lever-arm';
    const draftKey = `modulab-draft-${sceneId}`;
    let doc = null;
    let isDraft = false;
    let inst = null;
    let inspector = null;
    let selectedId = null;
    let selectionHelper = null;
    let firstBuild = true;
    let reloadTimer = null;
    let destroyed = false;

    let baselineStr = null; // the shipped original this draft was edited from

    function saveDraft() {
        isDraft = true;
        restoreBtn.hidden = false;
        try {
            localStorage.setItem(draftKey, JSON.stringify({ __modulab: 1, baseline: baselineStr, doc }));
        } catch { /* storage full */ }
    }

    // --- Undo/redo: coalesced document snapshots -----------------------------
    const history = [];
    let historyPtr = -1;
    let historyTimer = null;

    function seedHistory() {
        history.length = 0;
        history.push(JSON.stringify(doc));
        historyPtr = 0;
    }
    function pushHistorySoon() {
        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => {
            const snap = JSON.stringify(doc);
            if (history[historyPtr] === snap) return;
            history.splice(historyPtr + 1);
            history.push(snap);
            if (history.length > 60) history.shift();
            historyPtr = history.length - 1;
        }, 350);
    }
    function restoreHistory(dir) {
        clearTimeout(historyTimer);
        const next = historyPtr + dir;
        if (next < 0 || next >= history.length) return;
        historyPtr = next;
        doc = JSON.parse(history[historyPtr]);
        saveDraft();
        inspector?.setDraft(true);
        clearTimeout(reloadTimer);
        buildScene().then(() => inspector?.render());
    }

    /** Every edit funnels through here. rebuild=true for structural changes;
     *  transform/driver-field edits apply live and skip the rebuild. */
    function commit({ rebuild = false } = {}) {
        const wasDraft = isDraft;
        saveDraft();
        if (!wasDraft) inspector?.setDraft(true);
        pushHistorySoon();
        if (rebuild) {
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(async () => {
                await buildScene();
                inspector?.render();
            }, 200);
        }
    }

    /** The doc's transform for `id` changed in the panel: apply to the live
     *  scene without a rebuild (engine also moves the physics body). */
    function liveTransform(id) {
        inst?.syncFromDef(id);
        commit({});
    }

    function exportDoc() {
        const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${doc.meta?.id ?? sceneId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function importDoc(parsed) {
        doc = parsed;
        saveDraft();
        pushHistorySoon();
        buildScene().then(() => inspector?.render());
    }

    async function revertDraft() {
        localStorage.removeItem(draftKey);
        isDraft = false;
        await loadDoc(true);
        seedHistory();
        await buildScene();
        inspector?.render();
    }

    async function loadDoc(forceOriginal = false) {
        const r = await fetch(`scenes/${sceneId}.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const originalStr = JSON.stringify(await r.clone().json());

        if (!forceOriginal) {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
                try {
                    const rec = JSON.parse(raw);
                    if (rec && rec.__modulab === 1) {
                        doc = rec.doc;
                        baselineStr = rec.baseline;
                        isDraft = true;
                    } else {
                        // legacy draft (no baseline recorded): keep the edits but
                        // assume the shipped scene may have moved — say so
                        doc = rec;
                        baselineStr = null;
                        isDraft = true;
                    }
                    if (baselineStr !== originalStr) showUpdateNote();
                    if (baselineStr === null) baselineStr = originalStr;
                    return;
                } catch { localStorage.removeItem(draftKey); }
            }
        }
        doc = JSON.parse(originalStr);
        baselineStr = originalStr;
    }

    function showUpdateNote() {
        if (container.querySelector('.update-note')) return;
        const note = document.createElement('div');
        note.className = 'hud update-note';
        note.innerHTML = `
            <span>This scene has been updated — you're viewing your edited copy.</span>
            <button class="btn btn-sm" data-a="load">Load update (discard my edits)</button>
            <button class="btn btn-ghost btn-sm" data-a="keep">Keep mine</button>
        `;
        container.querySelector('.stage-full').appendChild(note);
        note.querySelector('[data-a="load"]').addEventListener('click', () => {
            note.remove();
            revertDraft();
        });
        note.querySelector('[data-a="keep"]').addEventListener('click', () => note.remove());
    }

    // --- Selection ---------------------------------------------------------------
    function setSelected(id) {
        selectedId = id;
        if (selectionHelper) {
            scene.remove(selectionHelper);
            selectionHelper.dispose();
            selectionHelper = null;
        }
        const target = id ? inst?.objects.get(id) : null;
        if (target) {
            selectionHelper = new THREE.BoxHelper(target.group, mode === 'light' ? 0x2a78d6 : 0x3987e5);
            scene.add(selectionHelper);
        }
        if (target && !inspectorEl.hidden) gizmo.attach(target.group);
        else gizmo.detach();
        inspector?.render();
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = null;

    canvas.addEventListener('pointerdown', (e) => {
        downAt = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
    });
    canvas.addEventListener('pointerup', (e) => {
        if (!downAt || downAt.button !== 0) return;
        const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
        const held = performance.now() - downAt.t;
        downAt = null;
        if (gizmo.axis || gizmo.dragging) return; // pointer is on the gizmo
        if (moved > 5 || held > 400 || !inst) return; // that was an orbit, not a click

        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(scene.children, true);
        for (const hit of hits) {
            let node = hit.object;
            while (node && node.userData?.objectId == null) node = node.parent;
            if (node?.userData?.objectId) {
                setSelected(node.userData.objectId);
                return;
            }
        }
        setSelected(null);
    });

    // --- Scene (re)build ------------------------------------------------------------
    async function buildScene() {
        if (destroyed || !doc) return;
        const keepSelection = selectedId;
        setSelected(null);
        inst?.dispose();
        inst = await instantiateScene(doc, {
            scene,
            getChannel: (n) => (lastValues.has(n) ? lastValues.get(n) / 1023 : null),
        });
        if (destroyed) { inst.dispose(); return; }

        sceneNameEl.textContent = (inst.meta.name ?? sceneId) + (isDraft ? ' *' : '');
        restoreBtn.hidden = !isDraft;

        if (firstBuild) {
            const cam = inst.env.camera ?? { position: [0, 4, 12], target: [0, 0, 0], fov: 60 };
            camera.fov = cam.fov ?? 60;
            camera.position.set(...cam.position);
            controls.target.set(...(cam.target ?? [0, 0, 0]));
            camera.updateProjectionMatrix();
            controls.update();

            if (inst.env.grid) {
                const grid = new THREE.GridHelper(80, 80,
                    mode === 'light' ? 0xaab0ba : 0x3a4150,
                    mode === 'light' ? 0xd3d7de : 0x232833);
                grid.position.y = inst.env.gridY ?? 0;
                scene.add(grid);
                const axes = new THREE.AxesHelper(2.2);
                axes.position.set(cam.target?.[0] ?? 0, grid.position.y + 0.01, 0);
                scene.add(axes);
            }
            firstBuild = false;
        }

        // Patch selector (rebuilt each time; patches may have been edited)
        if (inst.patchNames.length > 1) {
            const key = `modulab-patch-${inst.meta.id}`;
            const saved = localStorage.getItem(key);
            if (saved && inst.patchNames.includes(saved)) inst.setPatch(saved);
            patchEl.hidden = false;
            patchEl.innerHTML = inst.patchNames.map((p) => `
                <label><input type="radio" name="ws-patch" value="${p}"
                    ${p === inst.currentPatch ? 'checked' : ''}> ${p}</label>
            `).join('')
                + '<button class="patch-save" title="Save the current motion setup under a new name">＋</button>';
            for (const radio of patchEl.querySelectorAll('input')) {
                radio.addEventListener('change', () => {
                    inst.setPatch(radio.value);
                    localStorage.setItem(key, radio.value);
                    inspector?.render();
                });
            }
            patchEl.querySelector('.patch-save').addEventListener('click', () => {
                const name = prompt('Name for this motion setup:');
                if (!name || doc.patches?.[name]) return;
                doc.patches[name] = JSON.parse(JSON.stringify(doc.patches[inst.currentPatch] ?? []));
                commit({ rebuild: true });
            });
        } else {
            patchEl.hidden = true;
        }

        // Driver readout badges
        for (const b of driverBadges) b.closest('.twin-badge')?.remove();
        driverBadges = [];
        for (const d of inst.driverReadout()) {
            const el = document.createElement('span');
            el.className = 'twin-badge';
            el.innerHTML = `${d.label} <b>—</b>`;
            readout.appendChild(el);
            driverBadges.push(el.querySelector('b'));
        }

        if (keepSelection && inst.objects.has(keepSelection)) setSelected(keepSelection);
    }

    // --- Editor toggle -----------------------------------------------------------
    function openInspector() {
        inspectorEl.hidden = false;
        modeBtns.hidden = false;
        editBtn.classList.add('active');
        inspector ??= mountInspector(inspectorEl, {
            getDoc: () => doc,
            commit,
            liveTransform,
            getSelected: () => selectedId,
            setSelected,
            isDraft: () => isDraft,
            exportDoc,
            importDoc,
            revertDraft,
            getCurrentPatch: () => inst?.currentPatch ?? doc?.defaultPatch ?? 'default',
            inputValue: (ref) => inst?.inputValue(ref) ?? null,
        });
        inspector.render();
        setGizmoMode('translate');
        const target = selectedId ? inst?.objects.get(selectedId) : null;
        if (target) gizmo.attach(target.group);
    }
    function closeInspector() {
        inspectorEl.hidden = true;
        modeBtns.hidden = true;
        editBtn.classList.remove('active');
        gizmo.detach();
    }
    editBtn.addEventListener('click', () => {
        if (inspectorEl.hidden) openInspector(); else closeInspector();
    });

    resetBtn.addEventListener('click', () => inst?.resetDynamics());
    restoreBtn.addEventListener('click', () => {
        if (confirm('Discard your edits and reload the original scene?')) {
            container.querySelector('.update-note')?.remove();
            revertDraft();
        }
    });

    // Undo/redo + gizmo mode keys (skip while typing in panel fields)
    function onKey(e) {
        const t = e.target;
        if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') {
            e.preventDefault();
            restoreHistory(e.shiftKey ? 1 : -1);
        } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
            e.preventDefault();
            restoreHistory(1);
        } else if (k === 'w' && !inspectorEl.hidden) {
            setGizmoMode('translate');
        } else if (k === 'e' && !inspectorEl.hidden) {
            setGizmoMode('rotate');
        }
    }
    window.addEventListener('keydown', onKey);

    // --- Boot ---------------------------------------------------------------------
    (async () => {
        try {
            await loadDoc();
        } catch (err) {
            stageMsg.hidden = false;
            stageMsg.textContent = `Scene '${sceneId}' failed to load: ${err.message}`;
            return;
        }
        seedHistory();
        await buildScene();
        if (urlParams.has('edit')) openInspector();
        const preselect = urlParams.get('select');
        if (preselect) setSelected(preselect);
    })();

    // --- Render loop -----------------------------------------------------------
    let raf = null;
    let frame = 0;
    let lastT = performance.now();

    function sizeRenderer() {
        const w = canvas.parentElement.clientWidth;
        const h = canvas.parentElement.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(sizeRenderer);
    ro.observe(canvas.parentElement);
    sizeRenderer();

    function tick(now) {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        const dt = Math.min((now - lastT) / 1000, 0.05);
        lastT = now;

        inst?.tick(dt);
        selectionHelper?.update();

        frame += 1;
        if (frame % 6 === 0) {
            for (const [ch, b] of chBadges) b.textContent = (lastValues.get(ch) ?? 0).toFixed(0);
            if (inst) {
                inst.driverReadout().forEach((d, i) => {
                    if (driverBadges[i]) driverBadges[i].textContent = `${d.deg.toFixed(0)}°`;
                });
            }
        }
        controls.update();
        renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    active = {
        teardown() {
            destroyed = true;
            clearTimeout(reloadTimer);
            clearTimeout(historyTimer);
            window.removeEventListener('keydown', onKey);
            if (raf) cancelAnimationFrame(raf);
            offSample();
            unmountBar();
            ro.disconnect();
            gizmo.detach();
            gizmo.dispose?.();
            inspector?.destroy();
            inst?.dispose();
            renderer.dispose();
            scene.traverse((o) => {
                if (o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
                o.material?.dispose?.();
            });
        },
    };
}
