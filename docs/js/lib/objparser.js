/**
 * Minimal OBJ parser — v / vn / f (v, v/vt, v/vt/vn, v//vn), quads
 * fan-triangulated. Returns flat non-indexed arrays ready for a
 * THREE.BufferGeometry. Deliberately tiny instead of vendoring the
 * three/addons OBJLoader (which needs an import map for its bare
 * 'three' specifier).
 */
export function parseOBJ(text) {
    const v = [];
    const vn = [];
    const positions = [];
    const normals = [];

    for (const line of text.split('\n')) {
        if (line.startsWith('v ')) {
            const p = line.split(/\s+/);
            v.push([+p[1], +p[2], +p[3]]);
        } else if (line.startsWith('vn ')) {
            const p = line.split(/\s+/);
            vn.push([+p[1], +p[2], +p[3]]);
        } else if (line.startsWith('f ')) {
            const refs = line.trim().split(/\s+/).slice(1).map((tok) => {
                const [vi, , ni] = tok.split('/');
                return {
                    v: v[(+vi > 0 ? +vi - 1 : v.length + +vi)],
                    n: ni ? vn[(+ni > 0 ? +ni - 1 : vn.length + +ni)] : null,
                };
            });
            for (let i = 1; i < refs.length - 1; i++) {
                const tri = [refs[0], refs[i], refs[i + 1]];
                let fallback = null;
                if (tri.some((r) => !r.n)) {
                    // face normal from the triangle's winding
                    const [a, b, c] = tri.map((r) => r.v);
                    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                    fallback = [
                        u[1] * w[2] - u[2] * w[1],
                        u[2] * w[0] - u[0] * w[2],
                        u[0] * w[1] - u[1] * w[0],
                    ];
                    const len = Math.hypot(...fallback) || 1;
                    fallback = fallback.map((x) => x / len);
                }
                for (const r of tri) {
                    positions.push(...r.v);
                    normals.push(...(r.n || fallback));
                }
            }
        }
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
    };
}
