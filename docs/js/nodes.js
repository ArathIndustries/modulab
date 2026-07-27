/**
 * Node graph engine — the PowderOfLife idea, minimally: values flow from
 * channels through connected nodes. Inputs reference 'ch:N' or 'node:<id>';
 * a node may only reference channels or nodes created before it, so
 * insertion order IS evaluation order (acyclic by construction).
 *
 * Kinds:
 *   lerp   — chases its input (PoL LerpNode): v += (in - v) * speed
 *   invert — 1023 - in
 *   mix    — average of two inputs
 */

let counter = 0;

export const NODE_KINDS = {
    lerp: { label: 'lerp (follows)', inputs: 1 },
    invert: { label: 'invert', inputs: 1 },
    mix: { label: 'mix (average)', inputs: 2 },
};

export function createGraph() {
    const nodes = [];

    return {
        nodes,

        add(kind, inputs, params = {}) {
            const node = { id: `n${++counter}`, kind, inputs, params, value: null };
            nodes.push(node);
            return node;
        },

        /** Removes a node and cascades to everything downstream of it. */
        remove(id) {
            const dead = new Set([id]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const n of nodes) {
                    if (dead.has(n.id)) continue;
                    if (n.inputs.some((r) => r.startsWith('node:') && dead.has(r.slice(5)))) {
                        dead.add(n.id);
                        grew = true;
                    }
                }
            }
            for (let i = nodes.length - 1; i >= 0; i--) {
                if (dead.has(nodes[i].id)) nodes.splice(i, 1);
            }
            return [...dead];
        },

        /** One evaluation pass. resolveChannel(ch) -> latest value or undefined. */
        tick(resolveChannel) {
            const byId = new Map(nodes.map((n) => [n.id, n]));
            const resolve = (ref) => (ref.startsWith('ch:')
                ? resolveChannel(Number(ref.slice(3)))
                : byId.get(ref.slice(5))?.value);

            for (const n of nodes) {
                const a = resolve(n.inputs[0]);
                if (a == null) continue;
                if (n.kind === 'lerp') {
                    if (n.value == null) n.value = a;
                    n.value += (a - n.value) * (n.params.speed ?? 0.06);
                } else if (n.kind === 'invert') {
                    n.value = 1023 - a;
                } else if (n.kind === 'mix') {
                    const b = resolve(n.inputs[1]);
                    if (b == null) continue;
                    n.value = (a + b) / 2;
                }
            }
        },
    };
}
