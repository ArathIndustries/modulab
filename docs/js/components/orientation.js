/**
 * Orientation panel — names the four HUD corners of the workspace. Opens
 * automatically on a visitor's first visit (localStorage flag) and any
 * time from the nav's ? button (workspace route only, see nav.js).
 *
 * label -> value descriptives only, never sentences (owner's rule).
 */
const STORAGE_KEY = 'modulab-oriented';

const ROWS = [
    ['top left', 'Connect', 'USB · Bluetooth · Demo signal · Manual sliders'],
    ['top right', 'Scene', 'Reset · Edit — changes the scene, not needed to use it'],
    ['bottom left', 'Readings', 'knob values (raw) · part angles (°), live'],
    ['bottom right', 'Camera', 'drag orbit · wheel zoom · right-drag pan'],
    ['with a board', 'Match my rig', 'appears after connecting · two clicks per part'],
];

let openPanel = null; // { backdrop, close } while mounted, else null

function markOriented() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable */ }
}

function hasSeenOrientation() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

/** Show the panel unconditionally (nav ? button). */
export function showOrientation() {
    if (openPanel) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'orient-backdrop';
    backdrop.innerHTML = `
        <div class="orient-card" role="dialog" aria-modal="true" aria-label="How the screen is laid out">
            <button class="orient-x" title="Close">×</button>
            <div class="orient-title">modulab · how the screen is laid out</div>
            <div class="orient-grid">
                ${ROWS.map(([place, name, what]) => `
                    <span class="orient-place">${place}</span>
                    <span class="orient-name">${name}</span>
                    <span class="orient-what">${what}</span>
                `).join('')}
            </div>
            <div class="orient-footer">
                <button class="btn" id="orient-gotit">Got it</button>
                <span class="orient-reopen">reopen · ? in the top bar</span>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    function close() {
        markOriented();
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('hashchange', close);
        backdrop.remove();
        openPanel = null;
    }
    function onKey(e) {
        if (e.key === 'Escape') close();
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.orient-x').addEventListener('click', close);
    backdrop.querySelector('#orient-gotit').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close); // don't strand the modal if the route changes

    openPanel = { backdrop, close };
}

/** Show only if this visitor has never closed it before (first visit). */
export function maybeShowOrientation() {
    if (hasSeenOrientation()) return;
    showOrientation();
}
