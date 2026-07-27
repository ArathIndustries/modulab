/**
 * Workspace view — modulab's product surface. The 3D scene IS the page:
 * a full-bleed viewport with everything else floating over it as HUD
 * (ruling 2026-07-27 — no side panels stealing viewport space; analysis
 * overlays will live inside the scene itself, on this substrate).
 *
 * The scene comes from a scenes-as-data document via js/scene/engine.js;
 * ?scene=<id> picks it (default pol-lever-arm).
 */
import * as THREE from '../../vendor/three.module.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
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
                </div>
                <div class="hud hud-bl" id="ws-readout"></div>
                <div class="hud hud-br">drag · orbit &nbsp; wheel · zoom &nbsp; right-drag · pan</div>
            </div>
        </div>
    `;

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));
    const canvas = container.querySelector('.twin-canvas');
    const stageMsg = container.querySelector('.stage-msg');
    const readout = container.querySelector('#ws-readout');
    const patchEl = container.querySelector('#patch-toggle');
    const sceneNameEl = container.querySelector('#scene-name');
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
    const lastValues = new Map();
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

    const offSample = stream.onSample(({ ch, value }) => {
        lastValues.set(ch, value);
        ensureChannelBadge(ch);
    });

    // --- Load the scene document ------------------------------------------------
    const sceneId = new URLSearchParams(window.location.search).get('scene') || 'pol-lever-arm';
    let inst = null;
    let raf = null;
    let destroyed = false;
    let frame = 0;
    let lastT = performance.now();

    (async () => {
        let def;
        try {
            const r = await fetch(`scenes/${sceneId}.json`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            def = await r.json();
        } catch (err) {
            stageMsg.hidden = false;
            stageMsg.textContent = `Scene '${sceneId}' failed to load: ${err.message}`;
            return;
        }

        inst = await instantiateScene(def, {
            scene,
            getChannel: (n) => (lastValues.has(n) ? lastValues.get(n) / 1023 : null),
        });
        sceneNameEl.textContent = inst.meta.name ?? sceneId;

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

        for (const d of inst.driverReadout()) {
            const el = document.createElement('span');
            el.className = 'twin-badge';
            el.innerHTML = `${d.label} <b>—</b>`;
            readout.appendChild(el);
            driverBadges.push(el.querySelector('b'));
        }

        container.querySelector('#ws-reset').addEventListener('click', () => inst.resetDynamics());
    })();

    // --- Render loop --------------------------------------------------------
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
            if (raf) cancelAnimationFrame(raf);
            offSample();
            unmountBar();
            ro.disconnect();
            inst?.dispose();
            renderer.dispose();
            scene.traverse((o) => {
                o.geometry?.dispose?.();
                o.material?.dispose?.();
            });
        },
    };
}
