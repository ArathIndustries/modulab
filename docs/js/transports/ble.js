/**
 * Web Bluetooth transport. Chrome/Edge desktop + Android Chrome.
 * Not supported by iOS Safari — the dashboard says so instead of failing silently.
 */
import { CONFIG } from '../config.js';

export function bleSupported() {
    return 'bluetooth' in navigator;
}

export async function connectBle({ onData, onStatus }) {
    const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [CONFIG.BLE_SERVICE_UUID] }],
    });

    const decoder = new TextDecoder();
    device.addEventListener('gattserverdisconnected', () => {
        onStatus?.({ state: 'disconnected' });
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(CONFIG.BLE_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CONFIG.BLE_FRAME_CHAR_UUID);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
        onData(decoder.decode(event.target.value));
    });

    onStatus?.({ state: 'connected', label: `Bluetooth (${device.name || 'device'})` });
    return {
        disconnect: () => { try { device.gatt.disconnect(); } catch { /* already gone */ } },
    };
}
