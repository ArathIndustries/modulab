/**
 * Twin view — the live 3D environment. Each channel drives a physical-twin
 * lever in a Three.js scene: value 0-1023 maps to the 270° sweep of a real
 * B10K potentiometer. Levers self-register exactly like dashboard cards.
 */
import * as THREE from '../../vendor/three.module.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
import { parseOBJ } from '../lib/objparser.js';

// The real printed part: PowderOfLife's 60 mm potentiometer lever (see
// models/README.md for provenance). Loaded once, shared by every twin.
const MODEL_URL = 'models/potentiometer-lever-60mm.obj';
const MODEL_SCALE = 0.025; // mm -> scene units (66 mm arm -> 1.65 u)
let leverGeometryPromise = null;

function loadLeverGeometry() {
    leverGeometryPromise ??= fetch(MODEL_URL)
        .then((r) => {
            if (!r.ok) throw new Error(`${MODEL_URL}: HTTP ${r.status}`);
            return r.text();
        })
        .then((text) => {
            const { positions, normals } = parseOBJ(text);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            return geo;
        });
    return leverGeometryPromise;
}

const SWEEP = (270 * Math.PI) / 180; // physical pot travel
const SERIES_HEX = {
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
};

let active = null;

export function renderTwin(container) {
    if (active) { active.teardown(); active = null; }

    container.innerHTML = `
        <div class="view twin">
            <section id="connect-mount"></section>
            <div class="twin-stage">
                <canvas class="twin-canvas"></canvas>
                <div class="twin-empty" hidden>Connect a module — its levers appear here and move with the hardware.</div>
            </div>
            <div class="twin-readout" id="twin-readout"></div>
        </div>
    `;

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));
    const canvas = container.querySelector('.twin-canvas');
    const emptyMsg = container.querySelector('.twin-empty');
    const readout = container.querySelector('#twin-readout');
    emptyMsg.hidden = false;

    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

    // --- Scene ---------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'light' ? 0xeaecf0 : 0x14161a);

    const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.set(0, 3.2, 6.5);
    camera.lookAt(0, 0.4, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 4);
    scene.add(key);

    const grid = new THREE.GridHelper(12, 24,
        mode === 'light' ? 0xc5c9d1 : 0x2e323b,
        mode === 'light' ? 0xdfe2e7 : 0x1c1f26);
    scene.add(grid);

    // --- Twins: one lever assembly per channel ---------------------------
    const twins = new Map(); // ch -> {group, arm, target, current, badge, last}

    function layout() {
        const n = twins.size;
        let i = 0;
        for (const t of twins.values()) {
            t.group.position.x = (i - (n - 1) / 2) * 2.4;
            i += 1;
        }
    }

    function createTwin(ch) {
        emptyMsg.hidden = true;
        const color = new THREE.Color(SERIES_HEX[mode][ch % 8]);

        const group = new THREE.Group();

        const baseMat = new THREE.MeshStandardMaterial({
            color: mode === 'light' ? 0xb8bcc4 : 0x3a3f4a, roughness: 0.6, metalness: 0.3,
        });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.3, 40), baseMat);
        base.position.y = 0.15;
        group.add(base);

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 24), baseMat);
        shaft.position.y = 0.55;
        group.add(shaft);

        // The lever arm — the actual printed-part geometry, pivoting about
        // the shaft's vertical axis exactly like the physical lever on the pot.
        const arm = new THREE.Group();
        arm.position.y = 0.72; // hub sleeves over the shaft top
        const armMat = new THREE.MeshStandardMaterial({
            color, roughness: 0.45, metalness: 0.05, // printed-plastic look
            emissive: color, emissiveIntensity: 0.08,
        });
        if (leverGeometry) {
            const lever = new THREE.Mesh(leverGeometry, armMat);
            lever.scale.setScalar(MODEL_SCALE);
            arm.add(lever);
        } else {
            // model failed to load — degrade visibly, don't die
            const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), armMat);
            bar.position.x = 0.65;
            arm.add(bar);
        }
        group.add(arm);

        scene.add(group);

        const badge = document.createElement('span');
        badge.className = 'twin-badge';
        badge.innerHTML = `<span class="series-chip" style="background: var(--series-${(ch % 8) + 1})"></span>CH ${ch} <b>—</b>`;
        readout.appendChild(badge);

        const twin = { group, arm, target: 0, current: 0, badge: badge.querySelector('b'), last: null };
        twins.set(ch, twin);
        layout();
        return twin;
    }

    // Twins are created only after the lever model resolves, so channels
    // arriving early are stashed and flushed on load.
    let leverGeometry = null;
    let modelReady = false;
    const pending = new Map(); // ch -> latest value seen before model load

    loadLeverGeometry()
        .then((geo) => { leverGeometry = geo; })
        .catch((err) => { console.warn('lever model unavailable, using fallback:', err.message); })
        .finally(() => {
            modelReady = true;
            for (const [ch, value] of pending) applySample(ch, value);
            pending.clear();
        });

    function applySample(ch, value) {
        let t = twins.get(ch);
        if (!t) t = createTwin(ch);
        t.last = value;
        // 0-1023 -> -135°..+135°, matching the physical pot sweep
        t.target = (value / 1023 - 0.5) * SWEEP;
    }

    const offSample = stream.onSample(({ ch, value }) => {
        if (!modelReady) { pending.set(ch, value); return; }
        applySample(ch, value);
    });

    // --- Render loop -----------------------------------------------------
    let raf = null;
    let destroyed = false;
    let frame = 0;

    function sizeRenderer() {
        const w = canvas.parentElement.clientWidth;
        const h = Math.max(320, Math.round(w * 0.48));
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(sizeRenderer);
    ro.observe(canvas.parentElement);
    sizeRenderer();

    function tick() {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        for (const t of twins.values()) {
            t.current += (t.target - t.current) * 0.25; // smooth toward hardware
            t.arm.rotation.y = t.current;
        }
        frame += 1;
        if (frame % 6 === 0) { // ~10 Hz text updates
            for (const t of twins.values()) {
                if (t.last !== null) t.badge.textContent = t.last.toFixed(0);
            }
        }
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
            renderer.dispose();
            scene.traverse((o) => {
                o.geometry?.dispose?.();
                o.material?.dispose?.();
            });
        },
    };
}
