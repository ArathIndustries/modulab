/**
 * Demo transport — a synthetic two-channel module, no hardware required.
 * Emits the exact same wire frames as real firmware, so it exercises the
 * full parser -> registry -> chart pipeline (and lets visitors without a
 * board see what modulab does).
 */
export function connectDemo({ onData, onStatus }) {
    let t = 0;
    onStatus?.({ state: 'connected', label: 'Fake signal' });
    onData('<h:demo2:2>');

    const id = setInterval(() => {
        t += 0.02;
        const v0 = 511.5 + 460 * Math.sin(t * 0.9) + (Math.random() - 0.5) * 14;
        const v1 = 511.5 + 380 * Math.sin(t * 0.23 + 1.3) + (Math.random() - 0.5) * 22;
        onData(`<0:${v0.toFixed(1)}><1:${v1.toFixed(1)}>`);
    }, 20);

    return {
        disconnect: () => {
            clearInterval(id);
            onStatus?.({ state: 'disconnected' });
        },
    };
}
