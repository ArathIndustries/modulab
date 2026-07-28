/**
 * Scene engine — instantiates a scenes-as-data document (AUTHORING.md,
 * schema v0) into Three.js + cannon-es and runs it.
 *
 * The contract that makes authoring possible: NOTHING in here knows about
 * any particular scene. Objects, bodies, node math, and drivers all come
 * from the document; channels arrive through ctx.getChannel (normalized
 * 0-1), so the engine is equally driven by sliders, demo, USB, or BLE.
 */
import * as THREE from '../../vendor/three.module.js';
import * as CANNON from '../../vendor/cannon-es.js';
import { parseOBJ } from '../lib/objparser.js';

const DEG = Math.PI / 180;

// Model geometries cached across instantiations — hot-reload during editing
// must not refetch or reparse. Cached geometries are never disposed.
const geoCache = new Map(); // url -> Promise<BufferGeometry|null>

function loadGeometry(url, warn) {
    if (!geoCache.has(url)) {
        geoCache.set(url, fetch(url)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((text) => {
                const { positions, normals } = parseOBJ(text);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                geo.userData.cached = true;
                return geo;
            })
            .catch((err) => {
                warn(`model at '${url}' failed to load (${err.message})`);
                return null;
            }));
    }
    return geoCache.get(url);
}

export async function instantiateScene(def, { scene, getChannel }) {
    const warn = (msg) => console.warn(`[scene:${def.meta?.id ?? '?'}] ${msg}`);

    // --- Physics world ---------------------------------------------------
    const g = def.environment?.gravity ?? [0, -9.82, 0];
    const world = new CANNON.World({ gravity: new CANNON.Vec3(...g) });

    // --- Materials ---------------------------------------------------------
    const materials = new Map();
    for (const [id, m] of Object.entries(def.materials ?? {})) {
        materials.set(id, new THREE.MeshStandardMaterial({
            color: new THREE.Color(m.color ?? '#888888'),
            roughness: m.roughness ?? 0.7,
            metalness: m.metalness ?? 0.0,
        }));
    }
    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x888888 });

    // --- Models (shared geometries, cached across reloads) -------------------
    const modelGeos = new Map();
    await Promise.all(Object.entries(def.models ?? {}).map(async ([id, m]) => {
        const geo = await loadGeometry(m.url, warn);
        if (geo) modelGeos.set(id, geo);
    }));

    // --- Objects --------------------------------------------------------------
    const objects = new Map(); // id -> {def, group, body, colliderOffset, initial}
    const kinematics = [];
    const dynamics = [];

    for (const o of def.objects ?? []) {
        if (!o.id || objects.has(o.id)) { warn(`bad/duplicate object id ${o.id}`); continue; }
        const group = new THREE.Group();
        group.name = o.id;
        group.userData.objectId = o.id; // raycast selection resolves to this
        group.position.set(...(o.position ?? [0, 0, 0]));
        group.rotation.z = (o.rotationZ ?? 0) * DEG;

        const parent = o.parent ? objects.get(o.parent)?.group : null;
        if (o.parent && !parent) warn(`object '${o.id}' parent '${o.parent}' not declared earlier`);
        (parent ?? scene).add(group);

        const mat = materials.get(o.material) ?? fallbackMat;

        if (o.type === 'box') {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...o.size), mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
        } else if (o.type === 'model') {
            const mdef = def.models?.[o.model] ?? {};
            const geo = modelGeos.get(o.model);
            const mesh = geo
                ? new THREE.Mesh(geo, mat)
                : new THREE.Mesh(new THREE.BoxGeometry(...(o.collider?.size ?? [1, 1, 1])), mat);
            if (geo) {
                mesh.scale.setScalar(mdef.scale ?? 1);
                // ZYX so rotationX (stand the part up) happens before
                // rotationZ (point it along the mount direction) — matches
                // the nested-group composition the hardcoded scene used
                mesh.rotation.order = 'ZYX';
                mesh.rotation.set((mdef.rotationX ?? 0) * DEG, (mdef.rotationY ?? 0) * DEG, (mdef.rotationZ ?? 0) * DEG);
            }
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
        } else if (o.type !== 'group') {
            warn(`object '${o.id}' has unknown type '${o.type}'`);
        }

        // --- body -----------------------------------------------------------
        let body = null;
        let colliderOffset = null;
        if (o.body === 'static' && o.size) {
            body = new CANNON.Body({
                type: CANNON.Body.STATIC,
                shape: new CANNON.Box(new CANNON.Vec3(o.size[0] / 2, o.size[1] / 2, o.size[2] / 2)),
                position: new CANNON.Vec3(...(o.position ?? [0, 0, 0])),
            });
            body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), (o.rotationZ ?? 0) * DEG);
        } else if (o.body === 'dynamic' && o.size) {
            body = new CANNON.Body({
                mass: o.mass ?? 1,
                shape: new CANNON.Box(new CANNON.Vec3(o.size[0] / 2, o.size[1] / 2, o.size[2] / 2)),
                position: new CANNON.Vec3(...(o.position ?? [0, 0, 0])),
            });
            if (o.plane2d) {
                body.linearFactor.set(1, 1, 0);
                body.angularFactor.set(0, 0, 1);
            }
            dynamics.push(o.id);
        } else if (o.body === 'kinematic') {
            const c = o.collider ?? { size: [1, 1, 1], offset: [0, 0, 0] };
            body = new CANNON.Body({
                type: CANNON.Body.KINEMATIC,
                shape: new CANNON.Box(new CANNON.Vec3(c.size[0] / 2, c.size[1] / 2, c.size[2] / 2)),
            });
            colliderOffset = new THREE.Vector3(...(c.offset ?? [0, 0, 0]));
            kinematics.push(o.id);
        }
        if (body) world.addBody(body);

        objects.set(o.id, {
            def: o, group, body, colliderOffset,
            initial: { position: [...(o.position ?? [0, 0, 0])], rotationZ: (o.rotationZ ?? 0) * DEG },
        });
    }

    // --- Node graph (data, normalized domain) -------------------------------
    const nodeDefs = def.nodes ?? [];
    const nodeValues = new Map();

    function resolveRef(ref) {
        if (ref == null) return null;
        if (ref.startsWith('ch:')) return getChannel(Number(ref.slice(3)));
        if (ref.startsWith('node:')) return nodeValues.get(ref.slice(5)) ?? null;
        warn(`unknown input ref '${ref}'`);
        return null;
    }

    function evalNodes() {
        for (const n of nodeDefs) {
            if (n.kind === 'const') {
                nodeValues.set(n.id, n.value ?? 0);
            } else if (n.kind === 'mix') {
                const a = resolveRef(n.a);
                const b = resolveRef(n.b);
                if (a == null || b == null) continue;
                const av = a * (n.aAmp ?? 1);
                const bv = b * (n.bAmp ?? 1);
                const mode = n.mode ?? 'add';
                nodeValues.set(n.id,
                    mode === 'subtract' ? av - bv
                    : mode === 'multiply' ? av * bv
                    : av + bv);
            } else if (n.kind === 'lerp') {
                const inV = resolveRef(n.input);
                if (inV == null) continue;
                const prev = nodeValues.get(n.id) ?? inV;
                nodeValues.set(n.id, prev + (inV - prev) * (n.speed ?? 0.1));
            } else if (n.kind === 'invert') {
                const inV = resolveRef(n.input);
                if (inV != null) nodeValues.set(n.id, 1 - inV);
            } else {
                warn(`node '${n.id}' has unknown kind '${n.kind}'`);
            }
        }
    }

    // --- Patches (named driver sets) ------------------------------------------
    const patches = def.patches ?? { default: [] };
    let currentPatch = def.defaultPatch && patches[def.defaultPatch]
        ? def.defaultPatch : Object.keys(patches)[0];
    const driverState = new Map(); // driver index -> current value (radians)

    function setPatch(name) {
        if (!patches[name]) { warn(`no patch '${name}'`); return; }
        currentPatch = name;
        driverState.clear();
    }

    function applyDrivers() {
        const list = patches[currentPatch] ?? [];
        list.forEach((d, i) => {
            const target = objects.get(d.target);
            if (!target) return;
            const inV = resolveRef(d.input);
            if (inV == null) return;
            const signal = d.invert ? -inV : inV;
            const targetRad = ((d.baseline ?? 0) + (d.amplitude ?? 0) * signal) * DEG;
            const prev = driverState.get(i) ?? target.initial.rotationZ;
            const next = d.lerp ? prev + (targetRad - prev) * d.lerp : targetRad;
            driverState.set(i, next);
            if ((d.property ?? 'rotationZ') === 'rotationZ') {
                target.group.rotation.z = next;
            } else {
                warn(`driver property '${d.property}' not supported in schema v0`);
            }
        });
    }

    // --- Kinematic sync + dynamics copy-back -----------------------------------
    const tmpCenter = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();

    function syncKinematics() {
        for (const id of kinematics) {
            const o = objects.get(id);
            tmpCenter.copy(o.colliderOffset).applyMatrix4(o.group.matrixWorld);
            o.group.getWorldQuaternion(tmpQuat);
            o.body.position.set(tmpCenter.x, tmpCenter.y, tmpCenter.z);
            o.body.quaternion.set(tmpQuat.x, tmpQuat.y, tmpQuat.z, tmpQuat.w);
        }
    }

    function copyDynamics() {
        for (const id of dynamics) {
            const o = objects.get(id);
            o.group.position.copy(o.body.position);
            o.group.quaternion.copy(o.body.quaternion);
            if (o.def.resettable && o.body.position.y < -30) resetDynamics(id);
        }
    }

    function resetDynamics(onlyId = null) {
        for (const id of dynamics) {
            if (onlyId && id !== onlyId) continue;
            const o = objects.get(id);
            if (onlyId === null && !o.def.resettable) continue;
            o.body.position.set(...o.initial.position);
            o.body.velocity.setZero();
            o.body.angularVelocity.setZero();
            o.body.quaternion.set(0, 0, 0, 1);
            o.body.wakeUp();
        }
    }

    // --- Public instance ----------------------------------------------------
    return {
        world,
        objects,
        env: def.environment ?? {},
        meta: def.meta ?? {},
        get patchNames() { return Object.keys(patches); },
        get currentPatch() { return currentPatch; },
        setPatch,
        resetDynamics: () => resetDynamics(null),
        driverReadout() {
            return (patches[currentPatch] ?? []).map((d, i) => ({
                label: `${d.target}`,
                deg: (driverState.get(i) ?? 0) / DEG,
            }));
        },
        tick(dt) {
            evalNodes();
            applyDrivers();
            scene.updateMatrixWorld();
            syncKinematics();
            world.step(1 / 60, dt, 3);
            copyDynamics();
        },
        dispose() {
            for (const o of objects.values()) {
                o.body && world.removeBody(o.body);
                o.group.parent?.remove(o.group);
                o.group.traverse((child) => {
                    if (child.geometry && !child.geometry.userData?.cached) {
                        child.geometry.dispose();
                    }
                });
            }
            for (const m of materials.values()) m.dispose();
            // cached model geometries stay alive for the next instantiation
        },
    };
}
