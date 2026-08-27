import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeroDriver, spanDriver, angleOf, MIN_INPUT_TRAVEL } from '../docs/js/scene/calibrate.js';

const close = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('zero: the current input now produces the resting angle', () => {
    // the shipped shoulder driver, pot sitting at raw 481 while the real arm rests at 60°
    const d = { baseline: 60, amplitude: 250, invert: true };
    zeroDriver(d, 481 / 1023, 60);
    close(angleOf(d, 481 / 1023), 60);
    assert.equal(d.invert, true, 'zero alone does not touch direction');
    assert.equal(d.amplitude, 250, 'zero alone does not touch swing');
});

test('zero works without invert and with a negative swing', () => {
    const d = { baseline: -30, amplitude: -250 };
    zeroDriver(d, 0.5, -30);
    close(angleOf(d, 0.5), -30);
});

test('span: a quarter turn measures the sweep and keeps the zero', () => {
    const d = { baseline: 60, amplitude: 250, invert: true };
    const k0 = 481 / 1023;
    zeroDriver(d, k0, 60);
    // real pot sweeps 270° over the full range, wired so more raw = counter-clockwise
    const k1 = k0 + 90 / 270;
    assert.ok(spanDriver(d, k0, k1, 90, 60));
    close(d.amplitude, 270, 0.5);
    assert.equal('invert' in d, false, 'direction folded into amplitude');
    close(angleOf(d, k0), 60);
    close(angleOf(d, k1), 150);
});

test('span: turning the other way gives a negative swing', () => {
    const d = { baseline: 0, amplitude: 90 };
    zeroDriver(d, 0.3, 10);
    assert.ok(spanDriver(d, 0.3, 0.6, -90, 10));
    close(d.amplitude, -300);
    close(angleOf(d, 0.3), 10);
    close(angleOf(d, 0.6), -80);
});

test('span: wiring reversed (raw falls as the part turns +) also works', () => {
    const d = { baseline: 0, amplitude: 250 };
    zeroDriver(d, 0.8, 45);
    assert.ok(spanDriver(d, 0.8, 0.5, 90, 45));
    close(d.amplitude, -300);
    close(angleOf(d, 0.5), 135);
});

test('span refuses noise-sized travel and leaves the driver untouched', () => {
    const d = { baseline: 12.34, amplitude: 250, invert: true };
    const before = JSON.stringify(d);
    assert.equal(spanDriver(d, 0.5, 0.5 + MIN_INPUT_TRAVEL / 2, 90, 0), null);
    assert.equal(JSON.stringify(d), before);
    assert.equal(spanDriver(d, 0.5, NaN, 90, 0), null);
});
