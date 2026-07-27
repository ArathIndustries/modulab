/**
 * Sandbox view — a faithful browser mirror of PowderOfLife's Unity scene
 * "Potentiometer Lever Digital Twin.unity", decoded from the scene YAML:
 *
 *   - side-view camera (the scene is 2D physics in the XY plane)
 *   - floor + 45.766° ramp (static), "toy" cube (dynamic rigidbody,
 *     frozen to the XY plane exactly like the Unity constraints mask 56)
 *   - a two-segment articulated arm built from the printed lever model:
 *     lever 1 is PARENTED to lever 0 (shoulder -> elbow), matching the
 *     Unity hierarchy Root(180°) -> "0" -> "1"
 *   - the exact driver math from the scene's components:
 *       shoulder = 60° - 250°·n0                     (TransformDriver, inverted)
 *       elbow    = -30° + 250°·((-n1) - (1 + n0))    (MixNode sub/add chain;
 *                  the ContinuousGenerator emits a constant 1 — the
 *                  "kludge offset" in the scene's own comments)
 *     where n = channel value / 1023.
 *
 * Physics: cannon-es (vendored, MIT). Arm segments are kinematic bodies —
 * they push the toy; the toy cannot push them. Turn the knobs, catch the cube.
 */
import * as THREE from '../../vendor/three.module.js';
import * as CANNON from '../../vendor/cannon-es.js';
import { stream } from '../stream.js';
import { mountConnectBar } from '../components/connectbar.js';
import { parseOBJ } from '../lib/objparser.js';

const DEG = Math.PI / 180;

// --- Constants transcribed from the Unity scene ------------------------
const CAMERA_POS = { x: 1.58, y: 0, z: 11.15 }; // Unity z=-11.15, handedness flipped
const FLOOR = { pos: [-6.6, -3.91], size: [25.15, 1, 4] };
const RAMP = { pos: [14.42, 4.51], size: [25.15, 1, 4], rotZ: 45.766 * DEG };
const TOY = { pos: [13.86, 7.09], size: 2.9346223 };
const ROOT = { pos: [-8, 0], rotZ: 180 * DEG };
const SEG_LOCAL = [-6, 0];        // each child pivot sits 6 units out
const SEG_LEN = 6;
const SHOULDER = { baseline: 60 * DEG, amp: 250 * DEG, invert: true };
const ELBOW = { baseline: -30 * DEG, amp: 250 * DEG };
const MODEL_URL = 'models/potentiometer-lever-60mm.obj';
// The part's holes sit at x=0 and x=60 mm (it IS the "60 mm" lever), so
// hole-to-hole must equal SEG_LEN: scale = 6/60 = 0.1, Unity's own import
// scale. (Scaling by the 66 mm total length put the far hole 0.55 units
// short of the child pivot — the visible misalignment.)
const LEVER_SCALE = SEG_LEN / 60;
const LEVER_THICKNESS = 6.51 * LEVER_SCALE; // part thickness, for layer stacking

let active = null;

export function renderSandbox(container) {
    if (active) { active.teardown(); active = null; }

    container.innerHTML = `
        <div class="view sandbox">
            <section id="connect-mount"></section>
            <div class="twin-stage">
                <canvas class="twin-canvas"></canvas>
            </div>
            <div class="sandbox-bar">
                <button class="btn btn-ghost" id="toy-reset">Drop the toy again</button>
                <span class="hint" style="margin:0">Knob 0 swings the shoulder; both knobs couple into the elbow (that's the scene's own node patch). Catch the cube.</span>
            </div>
            <div class="twin-readout" id="sb-readout"></div>
        </div>
    `;

    const unmountBar = mountConnectBar(container.querySelector('#connect-mount'));
    const canvas = container.querySelector('.twin-canvas');
    const readout = container.querySelector('#sb-readout');
    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

    // --- Three scene ---------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'light' ? 0xdfe3ea : 0x101318);

    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    camera.position.set(CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z);
    camera.lookAt(CAMERA_POS.x, CAMERA_POS.y, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-4, 6, 8);
    scene.add(sun);

    const worldMat = new THREE.MeshStandardMaterial({
        color: mode === 'light' ? 0x9aa1ad : 0x3a4150, roughness: 0.85,
    });
    const armMat = new THREE.MeshStandardMaterial({
        color: 0xeb6834, roughness: 0.45, metalness: 0.05, // POL orange print
        emissive: 0xeb6834, emissiveIntensity: 0.06,
    });
    const toyMat = new THREE.MeshStandardMaterial({
        color: 0x3987e5, roughness: 0.4,
        emissive: 0x3987e5, emissiveIntensity: 0.08,
    });

    // --- Physics world ---------------------------------------------------
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

    function staticBox(pos, size, rotZ = 0) {
        const geo = new THREE.Mesh(new THREE.BoxGeometry(...size), worldMat);
        geo.position.set(pos[0], pos[1], 0);
        geo.rotation.z = rotZ;
        scene.add(geo);
        const body = new CANNON.Body({
            type: CANNON.Body.STATIC,
            shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
            position: new CANNON.Vec3(pos[0], pos[1], 0),
        });
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotZ);
        world.addBody(body);
        return geo;
    }

    staticBox(FLOOR.pos, FLOOR.size);
    staticBox(RAMP.pos, RAMP.size, RAMP.rotZ);

    // Toy: dynamic, frozen to the XY plane (Unity constraint mask 56)
    const toyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(TOY.size, TOY.size, TOY.size), toyMat);
    scene.add(toyMesh);
    const toyBody = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(TOY.size / 2, TOY.size / 2, TOY.size / 2)),
        position: new CANNON.Vec3(TOY.pos[0], TOY.pos[1], 0),
        linearFactor: new CANNON.Vec3(1, 1, 0),
        angularFactor: new CANNON.Vec3(0, 0, 1),
    });
    world.addBody(toyBody);

    function resetToy() {
        toyBody.position.set(TOY.pos[0], TOY.pos[1], 0);
        toyBody.velocity.setZero();
        toyBody.angularVelocity.setZero();
        toyBody.quaternion.set(0, 0, 0, 1);
        toyBody.wakeUp();
    }
    container.querySelector('#toy-reset').addEventListener('click', resetToy);

    // --- The arm: Root(180°) -> shoulder segment -> elbow segment --------
    const root = new THREE.Group();
    root.position.set(ROOT.pos[0], ROOT.pos[1], 0);
    root.rotation.z = ROOT.rotZ;
    scene.add(root);

    const shoulder = new THREE.Group();
    root.add(shoulder);
    const elbow = new THREE.Group();
    // The physical assembly stacks each lever one part-thickness above the
    // one it bolts onto — parallel planes, so the arms can fold past each
    // other without intersecting (the geometry-breaking overlap otherwise).
    elbow.position.set(SEG_LOCAL[0], SEG_LOCAL[1], LEVER_THICKNESS + 0.01);
    shoulder.add(elbow);

    // Segment visual: the printed lever model, arm pointing from the pivot
    // toward the child joint (local -x, hence the 180° flip on the mesh).
    function buildSegmentVisual(group) {
        const holder = new THREE.Group();
        holder.rotation.z = Math.PI;
        group.add(holder);
        // placeholder box until the OBJ resolves (swapped in below)
        const ph = new THREE.Mesh(new THREE.BoxGeometry(SEG_LEN, 0.6, 1), armMat);
        ph.position.x = SEG_LEN / 2;
        holder.add(ph);
        return holder;
    }
    const shoulderVis = buildSegmentVisual(shoulder);
    const elbowVis = buildSegmentVisual(elbow);

    fetch(MODEL_URL)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((text) => {
            const { positions, normals } = parseOBJ(text);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            for (const holder of [shoulderVis, elbowVis]) {
                holder.clear();
                const mesh = new THREE.Mesh(geo, armMat);
                mesh.scale.setScalar(LEVER_SCALE);
                // stand the flat part up: OBJ thickness runs +y (its print
                // bed axis); after this rotation the thickness spans
                // z in [-LEVER_THICKNESS, 0] — each segment is one layer
                mesh.rotation.x = 90 * DEG;
                holder.add(mesh);
            }
        })
        .catch((err) => console.warn('lever model unavailable, keeping boxes:', err.message));

    // Kinematic physics bodies shadowing the two segments
    function segmentBody() {
        const body = new CANNON.Body({
            type: CANNON.Body.KINEMATIC,
            shape: new CANNON.Box(new CANNON.Vec3(SEG_LEN / 2, 0.35, 1.5)),
        });
        world.addBody(body);
        return body;
    }
    const shoulderBody = segmentBody();
    const elbowBody = segmentBody();

    const segCenter = new THREE.Vector3();
    const segQuat = new THREE.Quaternion();
    const tmpMat = new THREE.Matrix4();

    function syncSegmentBody(group, body) {
        // body center sits halfway along the segment (local -x direction)
        tmpMat.copy(group.matrixWorld);
        segCenter.set(-SEG_LEN / 2, 0, 0).applyMatrix4(tmpMat);
        group.getWorldQuaternion(segQuat);
        body.position.set(segCenter.x, segCenter.y, 0);
        body.quaternion.set(segQuat.x, segQuat.y, segQuat.z, segQuat.w);
    }

    // --- Drivers (exact scene math) --------------------------------------
    const lastValues = new Map();
    const offSample = stream.onSample(({ ch, value }) => lastValues.set(ch, value));

    let a0 = SHOULDER.baseline;
    let a1 = ELBOW.baseline;

    function driveArm() {
        const n0 = (lastValues.get(0) ?? 511.5) / 1023;
        const n1 = (lastValues.get(1) ?? 511.5) / 1023;
        const gen = 1; // ContinuousGenerator: constant 1 (the scene's offset kludge)
        const mixAdd = gen + n0;              // MixNode "add"
        const mixSub = (-1 * n1) - mixAdd;    // MixNode "sub, -1"
        const target0 = SHOULDER.baseline + SHOULDER.amp * (SHOULDER.invert ? -n0 : n0);
        const target1 = ELBOW.baseline + ELBOW.amp * mixSub;
        a0 += (target0 - a0) * 0.2;
        a1 += (target1 - a1) * 0.2;
        shoulder.rotation.z = a0;
        elbow.rotation.z = a1;
    }

    // --- Readout ----------------------------------------------------------
    readout.innerHTML = `
        <span class="twin-badge"><span class="series-chip" style="background:#3987e5"></span>CH 0 <b>—</b></span>
        <span class="twin-badge"><span class="series-chip" style="background:#d95926"></span>CH 1 <b>—</b></span>
        <span class="twin-badge">shoulder <b>—</b></span>
        <span class="twin-badge">elbow <b>—</b></span>
    `;
    const badges = readout.querySelectorAll('b');

    // --- Loop --------------------------------------------------------------
    let raf = null;
    let destroyed = false;
    let frame = 0;
    let lastT = performance.now();

    function sizeRenderer() {
        const w = canvas.parentElement.clientWidth;
        const h = Math.max(340, Math.round(w * 0.52));
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

        driveArm();
        scene.updateMatrixWorld();
        syncSegmentBody(shoulder, shoulderBody);
        syncSegmentBody(elbow, elbowBody);

        const dt = Math.min((now - lastT) / 1000, 0.05);
        lastT = now;
        world.step(1 / 60, dt, 3);

        toyMesh.position.copy(toyBody.position);
        toyMesh.quaternion.copy(toyBody.quaternion);
        if (toyBody.position.y < -30) resetToy(); // fell off the world

        frame += 1;
        if (frame % 6 === 0) {
            badges[0].textContent = (lastValues.get(0) ?? 0).toFixed(0);
            badges[1].textContent = (lastValues.get(1) ?? 0).toFixed(0);
            badges[2].textContent = `${(a0 / DEG).toFixed(0)}°`;
            badges[3].textContent = `${(a1 / DEG).toFixed(0)}°`;
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
