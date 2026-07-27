/**
 * Top navigation bar with theme toggle.
 * Seed-B "mutate-container" render convention preserved.
 */
import { toggleTheme, getTheme } from '../theme.js';
import { CONFIG } from '../config.js';

const NAV_ITEMS = [
    { label: 'Dashboard', route: 'dashboard' },
    { label: 'Twin', route: 'twin' },
    { label: 'Sandbox', route: 'sandbox' },
    { label: 'About', route: 'about' },
];

export function renderNav(container, activeRoute) {
    const themeLabel = getTheme() === 'dark' ? 'Light mode' : 'Dark mode';
    const themeIcon = getTheme() === 'dark' ? '☀' : '☾';

    container.innerHTML = `
        <nav class="nav">
            <a class="nav-brand" href="#/dashboard">modulab<span class="nav-version">v${CONFIG.APP_VERSION}</span></a>
            <ul class="nav-links">
                ${NAV_ITEMS.map(item => `
                    <li><a class="nav-link ${activeRoute === item.route ? 'active' : ''}"
                           href="#/${item.route}">${item.label}</a></li>
                `).join('')}
            </ul>
            <div class="nav-actions">
                <a class="btn-icon" href="${CONFIG.REPO_URL}" title="GitHub" target="_blank" rel="noopener">↗</a>
                <button class="btn-icon" id="theme-toggle" title="${themeLabel}">${themeIcon}</button>
            </div>
        </nav>
    `;

    container.querySelector('#theme-toggle').addEventListener('click', () => {
        toggleTheme();
        renderNav(container, activeRoute);
    });
}
