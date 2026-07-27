/**
 * Twin view — the live 3D environment, PowderOfLife-style: physical
 * channels appear as printed-part levers, and a patch bar wires nodes
 * (lerp / invert / mix) onto them. Every node is another lever in the
 * scene, with a patch-cable link drawn from whatever feeds it.
 */
import * as THREE from '../../vendor/three.module.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
import { parseOBJ } from '../lib/objparser.js';
import { createGraph, NODE_KINDS } from '../nodes.js';

const SWEEP = (270 * Math.PI) / 180; // physical pot travel
const SERIES_HEX = {
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
};

// The real printed part: PowderOfLife's 60 mm potentiometer lever (see
// models/README.md for provenance). Loaded once, shared by every lever.
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
            <div class="patch-bar">
                <span class="patch-label">Connect nodes:</span>
                <select id="node-kind">
                    ${Object.entries(NODE_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
                </select>
                <span>←</span>
                <select id="node-in-a"></select>
                <select id="node-in-b" hidden></select>
                <button class="btn btn-ghost" id="node-add">Add node</button>
                <span class="node-chips" id="node-chips"></span>
            </div>
            <div class="twin-readout" id="twin-readout"></div>
        </div>
    `;

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));
    const canvas = container.querySelector('.twin-canvas');
    const emptyMsg = container.querySelector('.twin-empty');
    const readout = container.querySelector('#twin-readout');
    const kindSel = container.querySelector('#node-kind');
    const inASel = container.querySelector('#node-in-a');
    const inBSel = container.querySelector('#node-in-b');
    const addBtn = container.querySelector('#node-add');
    const chipsEl = container.querySelector('#node-chips');
    emptyMsg.hidden = false;

    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

    // --- Scene ---------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'light' ? 0xeaecf0 : 0x14161a);

    const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.set(0, 3.6, 7.2);
    camera.lookAt(0, 0.3, 0.8);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 4);
    scene.add(key);

    const grid = new THREE.GridHelper(14, 28,
        mode === 'light' ? 0xc5c9d1 : 0x2e323b,
        mode === 'light' ? 0xdfe2e7 : 0x1c1f26);
    scene.add(grid);

    const linksGroup = new THREE.Group();
    scene.add(linksGroup);

    // --- Levers (channels AND nodes are the same thing on stage) --------
    const graph = createGraph();
    const levers = new Map(); // key 'ch:N' | node id -> lever entry
    const lastValues = new Map(); // ch -> latest raw value
    let nextSlot = 0;

    function slotHex(slot) { return SERIES_HEX[mode][(slot - 1) % 8]; }

    function createLever(key, label, row) {
        emptyMsg.hidden = true;
        const slot = (nextSlot % 8) + 1;
        nextSlot += 1;
        const color = new THREE.Color(slotHex(slot));

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
            const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), armMat);
            bar.position.x = 0.65;
            arm.add(bar);
        }
        group.add(arm);
        scene.add(group);

        const badge = document.createElement('span');
        badge.className = 'twin-badge';
        badge.innerHTML = `<span class="series-chip" style="background:${slotHex(slot)}"></span>${label} <b>—</b>`;
        readout.appendChild(badge);

        const entry = {
            key, group, arm, slot, row, badge,
            badgeVal: badge.querySelector('b'),
            target: 0, current: 0, value: null,
        };
        levers.set(key, entry);
        layout();
        refreshSelects();
        return entry;
    }

    function removeLever(key) {
        const l = levers.get(key);
        if (!l) return;
        scene.remove(l.group);
        l.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        l.badge.remove();
        levers.delete(key);
    }

    function layout() {
        const chans = [...levers.values()].filter((l) => l.row === 'ch')
            .sort((a, b) => Number(a.key.slice(3)) - Number(b.key.slice(3)));
        const nodes = graph.nodes.map((n) => levers.get(n.id)).filter(Boolean);
        chans.forEach((l, i) => l.group.position.set((i - (chans.length - 1) / 2) * 2.4, 0, -0.6));
        nodes.forEach((l, i) => l.group.position.set((i - (nodes.length - 1) / 2) * 2.4, 0, 2.1));
        rebuildLinks();
    }

    function rebuildLinks() {
        for (const child of [...linksGroup.children]) {
            linksGroup.remove(child);
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        }
        for (const node of graph.nodes) {
            const to = levers.get(node.id);
            if (!to) continue;
            for (const ref of node.inputs) {
                const from = levers.get(ref.startsWith('node:') ? ref.slice(5) : ref);
                if (!from) continue;
                const a = from.group.position, b = to.group.position;
                const mid = new THREE.Vector3((a.x + b.x) / 2, 0.55, (a.z + b.z) / 2);
                const curve = new THREE.QuadraticBezierCurve3(
                    new THREE.Vector3(a.x, 0.08, a.z),
                    mid,
                    new THREE.Vector3(b.x, 0.08, b.z),
                );
                const tube = new THREE.Mesh(
                    new THREE.TubeGeometry(curve, 24, 0.03, 8),
                    new THREE.MeshStandardMaterial({
                        color: new THREE.Color(slotHex(from.slot)),
                        roughness: 0.5,
                        emissive: new THREE.Color(slotHex(from.slot)),
                        emissiveIntensity: 0.15,
                    }),
                );
                linksGroup.add(tube);
            }
        }
    }

    // --- Patch bar -------------------------------------------------------
    function refLabel(ref) {
        return ref.startsWith('ch:') ? `CH ${ref.slice(3)}` : ref.slice(5).toUpperCase();
    }

    function refreshSelects() {
        const opts = [
            ...[...levers.values()].filter((l) => l.row === 'ch')
                .sort((a, b) => Number(a.key.slice(3)) - Number(b.key.slice(3)))
                .map((l) => ({ v: l.key, t: `CH ${l.key.slice(3)}` })),
            ...graph.nodes.map((n) => ({ v: `node:${n.id}`, t: n.id.toUpperCase() })),
        ];
        for (const sel of [inASel, inBSel]) {
            const prev = sel.value;
            sel.innerHTML = opts.map((o) => `<option value="${o.v}">${o.t}</option>`).join('');
            if (opts.some((o) => o.v === prev)) sel.value = prev;
        }
        addBtn.disabled = opts.length === 0;
    }

    function renderChips() {
        chipsEl.innerHTML = '';
        for (const n of graph.nodes) {
            const chip = document.createElement('span');
            chip.className = 'node-chip';
            chip.innerHTML = `${n.id.toUpperCase()} ${n.kind} ← ${n.inputs.map(refLabel).join(' + ')}
                <button title="remove">×</button>`;
            chip.querySelector('button').addEventListener('click', () => {
                for (const deadId of graph.remove(n.id)) removeLever(deadId);
                renderChips();
                refreshSelects();
                layout();
            });
            chipsEl.appendChild(chip);
        }
    }

    kindSel.addEventListener('change', () => {
        inBSel.hidden = NODE_KINDS[kindSel.value].inputs < 2;
    });

    const pendingNodes = [];

    function addNode(kind, inputs) {
        const node = graph.add(kind, inputs);
        if (modelReady) {
            createLever(node.id, `${node.id.toUpperCase()} · ${kind}`, 'node');
        } else {
            pendingNodes.push(node); // lever appears once the model resolves
        }
        renderChips();
        return node;
    }

    addBtn.addEventListener('click', () => {
        const kind = kindSel.value;
        const inputs = NODE_KINDS[kind].inputs === 2
            ? [inASel.value, inBSel.value]
            : [inASel.value];
        if (inputs.some((r) => !r)) return;
        addNode(kind, inputs);
    });

    refreshSelects();

    // --- Stream ----------------------------------------------------------
    let leverGeometry = null;
    let modelReady = false;
    const pendingCh = new Set();

    loadLeverGeometry()
        .then((geo) => { leverGeometry = geo; })
        .catch((err) => { console.warn('lever model unavailable, using fallback:', err.message); })
        .finally(() => {
            modelReady = true;
            for (const ch of pendingCh) {
                ensureChannel(ch);
                const v = lastValues.get(ch);
                if (v != null) {
                    const l = levers.get(`ch:${ch}`);
                    l.value = v;
                    l.target = (v / 1023 - 0.5) * SWEEP;
                }
            }
            pendingCh.clear();
            for (const n of pendingNodes) {
                createLever(n.id, `${n.id.toUpperCase()} · ${n.kind}`, 'node');
            }
            pendingNodes.length = 0;
        });

    function ensureChannel(ch) {
        const key = `ch:${ch}`;
        if (!levers.has(key)) createLever(key, `CH ${ch}`, 'ch');
    }

    const offSample = stream.onSample(({ ch, value }) => {
        lastValues.set(ch, value);
        if (!modelReady) { pendingCh.add(ch); return; }
        ensureChannel(ch);
        const l = levers.get(`ch:${ch}`);
        l.value = value;
        l.target = (value / 1023 - 0.5) * SWEEP;
    });

    // ?patch=lerp@ch:0;mix@ch:0,ch:1 — preset node wiring from the URL
    // (shareable patches; also how headless verification drives the graph)
    const patchParam = new URLSearchParams(window.location.search).get('patch');
    if (patchParam) {
        for (const spec of patchParam.split(';')) {
            const [kind, refs] = spec.split('@');
            if (!NODE_KINDS[kind] || !refs) continue;
            addNode(kind, refs.split(',').slice(0, NODE_KINDS[kind].inputs));
        }
    }

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

        graph.tick((ch) => lastValues.get(ch));
        for (const n of graph.nodes) {
            const l = levers.get(n.id);
            if (l && n.value != null) {
                l.value = n.value;
                l.target = (n.value / 1023 - 0.5) * SWEEP;
            }
        }

        for (const l of levers.values()) {
            l.current += (l.target - l.current) * 0.25; // smooth toward source
            l.arm.rotation.y = l.current;
        }

        frame += 1;
        if (frame % 6 === 0) { // ~10 Hz text updates
            for (const l of levers.values()) {
                if (l.value !== null) l.badgeVal.textContent = l.value.toFixed(0);
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
