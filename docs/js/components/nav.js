/**
 * Top navigation bar with theme toggle. Re-renders the whole bar into its
 * container on every change (route switch, theme toggle) instead of
 * patching individual elements — simplest thing that stays correct for a
 * bar this small.
 */
import { toggleTheme, getTheme } from '../theme.js';
import { CONFIG } from '../config.js';
import { showOrientation } from './orientation.js';

// One product view. The raw instrument panel stays reachable at #/dashboard
// (linked from About and TESTING.md as Diagnostics) but is not a tab; the
// July Twin view was retired — the workspace superseded it.
const NAV_ITEMS = [
    { label: 'Workspace', route: 'sandbox' },
    { label: 'About', route: 'about' },
];

export function renderNav(container, activeRoute) {
    const themeIcon = getTheme() === 'dark' ? '☀' : '☾';

    container.innerHTML = `
        <nav class="nav">
            <a class="nav-brand" href="#/sandbox">modulab<span class="nav-version">v${CONFIG.APP_VERSION}</span></a>
            <ul class="nav-links">
                ${NAV_ITEMS.map(item => `
                    <li><a class="nav-link ${activeRoute === item.route ? 'active' : ''}"
                           href="#/${item.route}">${item.label}</a></li>
                `).join('')}
            </ul>
            <div class="nav-actions">
                <a class="btn-icon" href="${CONFIG.REPO_URL}" title="source on GitHub" target="_blank" rel="noopener">↗</a>
                ${activeRoute === 'sandbox' ? '<button class="btn-icon" id="orient-help" title="how the screen is laid out">?</button>' : ''}
                <button class="btn-icon" id="theme-toggle" title="dark / light">${themeIcon}</button>
            </div>
        </nav>
    `;

    container.querySelector('#theme-toggle').addEventListener('click', () => {
        toggleTheme();
        renderNav(container, activeRoute);
    });
    container.querySelector('#orient-help')?.addEventListener('click', () => showOrientation());
}
