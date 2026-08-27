/**
 * Manual transport — on-screen sliders that speak the same wire protocol
 * as real firmware. The simulation can be driven entirely by hand; wiring
 * the BLE board in later changes nothing downstream, because every view
 * only ever sees the stream.
 *
 * URL presets: ?manual=1&ch0=200&ch1=900 (values 0-1023; also how
 * headless verification poses the arm deterministically).
 */

const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4',
    '--series-5', '--series-6', '--series-7', '--series-8'];
const MAX_CHANNELS = 8;
const EMIT_MS = 33; // ~30 Hz steady stream so charts/rates behave like hardware

export function connectManual({ onData, onStatus }) {
    const params = new URLSearchParams(window.location.search);
    const values = [];
    for (let i = 0; i < MAX_CHANNELS; i++) {
        const preset = params.get(`ch${i}`);
        if (i < 2 || preset !== null) {
            values.push(Math.min(1023, Math.max(0, Number(preset ?? 511.5))));
        }
    }

    const panel = document.createElement('div');
    panel.className = 'manual-panel';
    document.body.appendChild(panel);

    function hello() {
        onData(`<h:manual:${values.length}>`);
    }
    function emit() {
        onData(values.map((v, i) => `<${i}:${v.toFixed(1)}>`).join(''));
    }

    function render() {
        panel.innerHTML = `
            <div class="manual-head">
                <span>on-screen sliders</span>
                <button class="manual-add" title="add a knob" ${values.length >= MAX_CHANNELS ? 'disabled' : ''}>+ knob</button>
                <button class="manual-close" title="disconnect">×</button>
            </div>
            ${values.map((v, i) => `
                <label class="manual-row">
                    <span class="series-chip" style="background: var(${SERIES[i % 8]})"></span>
                    <span class="manual-ch">knob ${i}</span>
                    <input type="range" min="0" max="1023" step="1" value="${v}"
                           data-ch="${i}" style="accent-color: var(${SERIES[i % 8]})">
                    <b data-val="${i}">${v.toFixed(0)}</b>
                </label>
            `).join('')}
        `;
        for (const input of panel.querySelectorAll('input[type=range]')) {
            input.addEventListener('input', () => {
                const i = Number(input.dataset.ch);
                values[i] = Number(input.value);
                panel.querySelector(`[data-val="${i}"]`).textContent = input.value;
                emit(); // snappy: emit immediately on top of the steady tick
            });
        }
        panel.querySelector('.manual-add').addEventListener('click', () => {
            if (values.length < MAX_CHANNELS) {
                values.push(511.5);
                hello();
                render();
            }
        });
        panel.querySelector('.manual-close').addEventListener('click', stop);
    }

    let interval = setInterval(emit, EMIT_MS);

    function stop() {
        if (interval) { clearInterval(interval); interval = null; }
        panel.remove();
        onStatus?.({ state: 'disconnected' });
    }

    hello();
    emit();
    render();
    onStatus?.({ state: 'connected', label: 'On-screen sliders' });

    return {
        disconnect: () => {
            if (interval) { clearInterval(interval); interval = null; }
            panel.remove();
        },
    };
}
