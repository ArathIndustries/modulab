/**
 * Shared stream service — ONE connection, many consumers.
 *
 * Views subscribe for samples/hello/status and unsubscribe on teardown;
 * the transport itself survives route changes, so connecting on the
 * dashboard and switching to the Twin view keeps the data flowing.
 */
import { FrameParser } from './protocol.js';

const sampleSubs = new Set();
const helloSubs = new Set();
const statusSubs = new Set();
const frameSubs = new Set();

const state = {
    transport: null,
    status: { state: 'idle' },
    hello: null,
    connecting: false,
};

const parser = new FrameParser({
    onSample: (s) => { for (const fn of sampleSubs) fn(s); },
    onHello: (h) => {
        state.hello = h;
        for (const fn of helloSubs) fn(h);
    },
    onFrame: (raw) => { for (const fn of frameSubs) fn(raw); },
});

function setStatus(s) {
    state.status = s;
    if (s.state === 'disconnected' || s.state === 'error') {
        state.transport = null;
        state.hello = null;
    }
    for (const fn of statusSubs) fn(s);
}

export const stream = {
    get status() { return state.status; },
    get hello() { return state.hello; },
    get connected() { return state.status.state === 'connected'; },

    async connect(connectFn) {
        if (state.transport || state.connecting) return;
        state.connecting = true;
        try {
            state.transport = await connectFn({
                onData: (text) => parser.feed(text),
                onStatus: setStatus,
            });
        } catch (err) {
            // Cancelling the port/device picker is normal flow, not an error
            if (err.name !== 'NotFoundError') {
                setStatus({ state: 'error', message: err.message });
            }
        } finally {
            state.connecting = false;
        }
    },

    async disconnect() {
        const t = state.transport;
        state.transport = null;
        await t?.disconnect?.();
        setStatus({ state: 'idle' });
    },

    onSample(fn) { sampleSubs.add(fn); return () => sampleSubs.delete(fn); },
    onHello(fn) { helloSubs.add(fn); return () => helloSubs.delete(fn); },
    onStatus(fn) { statusSubs.add(fn); return () => statusSubs.delete(fn); },
    onFrame(fn) { frameSubs.add(fn); return () => frameSubs.delete(fn); },
};
