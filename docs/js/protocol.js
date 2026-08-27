/**
 * modulab wire protocol parser — clean-room implementation of BUILD-A-MODULE.md.
 *
 * v0 frames (PowderOfLife-compatible): <ch:val>  e.g. <0:512.0000>
 * v1 additions:                        <h:name:count>  module hello
 *
 * The parser is a byte-stream state machine: transports hand it arbitrary
 * text chunks (frames split across USB packets or BLE notifications are
 * normal) and it emits complete events only.
 */

const MAX_BODY = 128; // garbage guard: no legal frame body approaches this

export class FrameParser {
    /**
     * @param {object} handlers
     * @param {(s: {ch: number, value: number, t: number}) => void} handlers.onSample
     * @param {(h: {name: string, channels: number}) => void} [handlers.onHello]
     * @param {(raw: string) => void} [handlers.onFrame]  raw frame text, for the console
     */
    constructor({ onSample, onHello, onFrame } = {}) {
        this.onSample = onSample;
        this.onHello = onHello;
        this.onFrame = onFrame;
        this._body = '';
        this._active = false;
    }

    feed(text) {
        for (const c of text) {
            if (c === '<') {
                this._active = true;
                this._body = '';
            } else if (c === '>') {
                if (this._active) {
                    this._parse(this._body);
                    this._active = false;
                }
            } else if (this._active) {
                if (this._body.length >= MAX_BODY) {
                    this._active = false; // line noise, not a frame
                } else {
                    this._body += c;
                }
            }
        }
    }

    _parse(body) {
        this.onFrame?.(`<${body}>`);
        if (body.startsWith('h:')) {
            const parts = body.split(':'); // h : name : count
            const channels = Number.parseInt(parts[2], 10);
            if (parts[1] && Number.isFinite(channels)) {
                this.onHello?.({ name: parts[1], channels });
            }
            return;
        }
        if (body.startsWith('err:')) {
            this.onHello?.({ name: body, channels: 0 });
            return;
        }
        const i = body.indexOf(':');
        if (i <= 0) return;
        const ch = Number.parseInt(body.slice(0, i), 10);
        const value = Number.parseFloat(body.slice(i + 1));
        if (Number.isInteger(ch) && ch >= 0 && ch < 64 && Number.isFinite(value)) {
            this.onSample({ ch, value, t: performance.now() });
        }
    }
}
