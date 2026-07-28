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
                    <button class="btn btn-ghost btn-sm" id="ws-reset">Reset</button>
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

    function saveDraft() {
        isDraft = true;
        try { localStorage.setItem(draftKey, JSON.stringify(doc)); } catch { /* storage full */ }
    }

    function markDirty({ reload }) {
        saveDraft();
        if (reload) {
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => buildScene(), 250);
        }
        inspector?.refresh();
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
        buildScene();
        inspector?.refresh();
    }

    async function revertDraft() {
        localStorage.removeItem(draftKey);
        isDraft = false;
        await loadDoc(true);
        buildScene();
        inspector?.refresh();
    }

    async function loadDoc(forceOriginal = false) {
        if (!forceOriginal) {
            const draft = localStorage.getItem(draftKey);
            if (draft) {
                try {
                    doc = JSON.parse(draft);
                    isDraft = true;
                    return;
                } catch { localStorage.removeItem(draftKey); }
            }
        }
        const r = await fetch(`scenes/${sceneId}.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        doc = await r.json();
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
        inspector?.refresh();
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
            `).join('');
            for (const radio of patchEl.querySelectorAll('input')) {
                radio.addEventListener('change', () => {
                    inst.setPatch(radio.value);
                    localStorage.setItem(key, radio.value);
                    inspector?.refresh();
                });
            }
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
        editBtn.classList.add('active');
        inspector ??= mountInspector(inspectorEl, {
            getDoc: () => doc,
            markDirty,
            getSelected: () => selectedId,
            setSelected,
            isDraft: () => isDraft,
            exportDoc,
            importDoc,
            revertDraft,
            getCurrentPatch: () => inst?.currentPatch ?? doc?.defaultPatch ?? 'default',
        });
        inspector.refresh();
    }
    function closeInspector() {
        inspectorEl.hidden = true;
        editBtn.classList.remove('active');
    }
    editBtn.addEventListener('click', () => {
        if (inspectorEl.hidden) openInspector(); else closeInspector();
    });

    resetBtn.addEventListener('click', () => inst?.resetDynamics());

    // --- Boot ---------------------------------------------------------------------
    (async () => {
        try {
            await loadDoc();
        } catch (err) {
            stageMsg.hidden = false;
            stageMsg.textContent = `Scene '${sceneId}' failed to load: ${err.message}`;
            return;
        }
        await buildScene();
        if (urlParams.has('edit')) openInspector();
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
            if (raf) cancelAnimationFrame(raf);
            offSample();
            unmountBar();
            ro.disconnect();
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
