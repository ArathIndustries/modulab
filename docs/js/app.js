/**
 * App bootstrap: routes, nav, theme. Seed-B bootstrap sequence preserved
 * (DOM refs -> setView -> route registration -> initTheme -> router.start).
 */
import { router } from './router.js';
import { initTheme } from './theme.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAbout } from './views/about.js';

const navContainer = document.getElementById('nav-container');
const mainContent = document.getElementById('main-content');

function setView(route, renderFn, params = {}) {
    renderNav(navContainer, route);
    renderFn(mainContent, params);
}

router
    .add('dashboard', () => setView('dashboard', renderDashboard))
    .add('about', () => setView('about', renderAbout))
    .default('dashboard')
    .notFound(() => setView('dashboard', renderDashboard));

initTheme();
router.start();
