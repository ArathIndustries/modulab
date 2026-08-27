/**
 * Driver calibration — make the on-screen part turn like the real one.
 *
 * A real knob module never matches a typed constant: the printed part is
 * press-fit onto the pot shaft at whatever angle it went on, the wiper's
 * electrical sweep is not exactly 250°, and which leg got 3V3 decides the
 * direction. So `baseline` and `amplitude` are MEASURED from the live
 * input, in two steps, and written back as ordinary driver edits (they
 * live in the draft and export with the scene — never in firmware).
 *
 * The driver equation (engine.js applyDrivers), k = raw / 1023:
 *     angle = baseline + amplitude * (invert ? -k : k)
 *
 *  zeroDriver(d, k, rest)             one point: the input reads k while the
 *                                     real part sits at `rest` (the object's
 *                                     rotationZ) -> solve baseline.
 *  spanDriver(d, k0, k1, turned, rest) two points: the input moved k0 -> k1
 *                                     while the real part turned `turned`°
 *                                     (counter-clockwise on screen = +) ->
 *                                     solve amplitude (sign included, so
 *                                     `invert` is dropped), keep the zero.
 */

/** Below this much input travel a "turn" is noise, not a measurement. */
export const MIN_INPUT_TRAVEL = 0.02; // ≈ 20 raw counts

export function signalOf(d, k) {
    return d.invert ? -k : k;
}

/** What the driver would produce for input k — the engine's equation. */
export function angleOf(d, k) {
    return (d.baseline ?? 0) + (d.amplitude ?? 0) * signalOf(d, k);
}

export function zeroDriver(d, k, restDeg) {
    d.baseline = round2(restDeg - (d.amplitude ?? 0) * signalOf(d, k));
    return d;
}

export function spanDriver(d, k0, k1, turnedDeg, restDeg) {
    const dk = k1 - k0;
    if (!Number.isFinite(dk) || Math.abs(dk) < MIN_INPUT_TRAVEL) return null;
    delete d.invert; // direction now lives in amplitude's sign
    d.amplitude = round2(turnedDeg / dk);
    d.baseline = round2(restDeg - d.amplitude * k0); // re-solve with the rounded swing
    return d;
}

function round2(v) {
    return Math.round(v * 100) / 100;
}
