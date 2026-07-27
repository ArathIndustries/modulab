/**
 * Web Serial transport. Chrome/Edge desktop only (secure context).
 *
 * Hard-won lesson baked in: native-USB boards (Nano 33 BLE) transmit
 * NOTHING until the host asserts DTR. setSignals() below is not optional.
 */
import { CONFIG } from '../config.js';

export function serialSupported() {
    return 'serial' in navigator;
}

export async function connectSerial({ onData, onStatus }) {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: CONFIG.SERIAL_BAUD });
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });

    let running = true;
    const decoder = new TextDecoder();

    (async () => {
        try {
            while (running && port.readable) {
                const reader = port.readable.getReader();
                try {
                    for (;;) {
                        const { value, done } = await reader.read();
                        if (done || !running) break;
                        if (value) onData(decoder.decode(value, { stream: true }));
                    }
                } finally {
                    reader.releaseLock();
                }
            }
        } catch (err) {
            if (running) onStatus?.({ state: 'error', message: err.message });
        } finally {
            try { await port.close(); } catch { /* already closed */ }
            onStatus?.({ state: 'disconnected' });
        }
    })();

    onStatus?.({ state: 'connected', label: 'USB serial' });
    return {
        disconnect: async () => {
            running = false;
            try { await port.readable?.cancel(); } catch { /* reader already gone */ }
        },
    };
}
