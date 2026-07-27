/**
 * Workspace view — modulab's product surface. Loads a scenes-as-data
 * document (AUTHORING.md) and runs it in an engine-grade viewport, with
 * the instrument panel docked beside it (the Dashboard, folded in).
 *
 * Nothing here is scene-specific: which scene runs comes from
 * ?scene=<id> (default pol-lever-arm), and everything inside the
 * viewport comes from that document via js/scene/engine.js.
 */
import * as THREE from '../../vendor/three.module.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
import { createStripChart } from '../components/stripchart.js';
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
            <section id="connect-mount"></section>
            <div class="workspace">
                <div class="ws-main">
                    <div class="twin-stage">
                        <canvas class="twin-canvas"></canvas>
                        <div class="stage-msg" hidden></div>
                    </div>
                    <div class="sandbox-bar">
                        <button class="btn btn-ghost" id="ws-reset">Reset objects</button>
                        <span class="patch-toggle" id="patch-toggle" hidden></span>
                        <span class="hint" style="margin:0">Drag to orbit · wheel to zoom · right-drag to pan</span>
                    </div>
                    <div class="twin-readout" id="ws-readout"></div>
                </div>
                <aside class="ws-panel">
                    <h3>Instruments</h3>
                    <div id="inst-grid" class="inst-grid">
                        <p class="hint" id="inst-empty">Channels appear when a module streams.</p>
                    </div>
                </aside>
            </div>
        </div>
    `;

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));
    const canvas = container.querySelector('.twin-canvas');
    const stageMsg = container.querySelector('.stage-msg');
    const readout = container.querySelector('#ws-readout');
    const patchEl = container.querySelector('#patch-toggle');
    const instGrid = container.querySelector('#inst-grid');
    const instEmpty = container.querySelector('#inst-empty');
    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

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
    const lastValues = new Map(); // ch -> raw value
    const instruments = new Map(); // ch -> {chart, valueEl, hzEl, times}

    function ensureInstrument(ch) {
        if (instruments.has(ch)) return instruments.get(ch);
        instEmpty.hidden = true;
        const slot = (ch % 8) + 1;
        const card = document.createElement('div');
        card.className = 'inst-card';
        card.innerHTML = `
            <header>
                <span class="series-chip" style="background: var(--series-${slot})"></span>
                <span class="inst-ch">CH ${ch}</span>
                <span class="ch-hz"></span>
            </header>
            <div class="inst-value">—</div>
            <div class="chart-holder"></div>
        `;
        instGrid.appendChild(card);
        const chart = createStripChart(card.querySelector('.chart-holder'), {
            colorVar: `--series-${slot}`,
        });
        const entry = {
            chart,
            valueEl: card.querySelector('.inst-value'),
            hzEl: card.querySelector('.ch-hz'),
            times: [],
        };
        instruments.set(ch, entry);
        return entry;
    }

    const offSample = stream.onSample(({ ch, value, t }) => {
        lastValues.set(ch, value);
        const inst = ensureInstrument(ch);
        inst.chart.push(t, value);
        inst.times.push(t);
        if (inst.times.length > 64) inst.times.shift();
        ensureChannelBadge(ch);
    });

    // --- Readout badges -------------------------------------------------------
    const chBadges = new Map();
    const driverBadges = [];

    function ensureChannelBadge(ch) {
        if (chBadges.has(ch)) return;
        const el = document.createElement('span');
        el.className = 'twin-badge';
        el.innerHTML = `<span class="series-chip" style="background:${SERIES_HEX[mode][ch % 8]}"></span>CH ${ch} <b>—</b>`;
        readout.prepend(el);
        chBadges.set(ch, el.querySelector('b'));
    }

    // --- Load the scene document ------------------------------------------------
    const sceneId = new URLSearchParams(window.location.search).get('scene') || 'pol-lever-arm';
    let inst = null; // engine instance
    let raf = null;
    let destroyed = false;
    let frame = 0;
    let lastT = performance.now();

    function showStageMsg(text) {
        stageMsg.hidden = false;
        stageMsg.textContent = text;
    }

    (async () => {
        let def;
        try {
            const r = await fetch(`scenes/${sceneId}.json`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            def = await r.json();
        } catch (err) {
            showStageMsg(`Scene '${sceneId}' failed to load: ${err.message}`);
            return;
        }

        inst = await instantiateScene(def, {
            scene,
            getChannel: (n) => (lastValues.has(n) ? lastValues.get(n) / 1023 : null),
        });

        // Camera / controls from the document
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

        // Patch selector from the document's named driver sets
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
                });
            }
        }

        // Driver readout badges (generic: one per driven object)
        for (const d of inst.driverReadout()) {
            const el = document.createElement('span');
            el.className = 'twin-badge';
            el.innerHTML = `${d.label}.rotZ <b>—</b>`;
            readout.appendChild(el);
            driverBadges.push(el.querySelector('b'));
        }

        container.querySelector('#ws-reset').addEventListener('click', () => inst.resetDynamics());
    })();

    // --- Render loop --------------------------------------------------------
    function sizeRenderer() {
        const w = canvas.parentElement.clientWidth;
        const h = Math.max(340, Math.round(w * 0.55));
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

        frame += 1;
        if (frame % 6 === 0) {
            for (const [ch, b] of chBadges) b.textContent = (lastValues.get(ch) ?? 0).toFixed(0);
            if (inst) {
                inst.driverReadout().forEach((d, i) => {
                    if (driverBadges[i]) driverBadges[i].textContent = `${d.deg.toFixed(0)}°`;
                });
            }
            const nowMs = performance.now();
            for (const i of instruments.values()) {
                i.times = i.times.filter((t) => nowMs - t < 2000);
                i.hzEl.textContent = i.times.length > 1 ? `${(i.times.length / 2).toFixed(0)} Hz` : '';
            }
            for (const [ch, i] of instruments) {
                i.valueEl.textContent = (lastValues.get(ch) ?? 0).toFixed(1);
            }
        }
        controls.update();
        renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    active = {
        teardown() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            offSample();
            unmountBar();
            ro.disconnect();
            for (const i of instruments.values()) i.chart.destroy();
            inst?.dispose();
            renderer.dispose();
            scene.traverse((o) => {
                o.geometry?.dispose?.();
                o.material?.dispose?.();
            });
        },
    };
}
