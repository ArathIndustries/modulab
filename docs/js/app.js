/**
 * App bootstrap: routes, nav, theme. Seed-B bootstrap sequence preserved
 * (DOM refs -> setView -> route registration -> initTheme -> router.start).
 */
import { router } from './router.js';
import { initTheme } from './theme.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTwin } from './views/twin.js';
import { renderSandbox } from './views/sandbox.js';
import { renderAbout } from './views/about.js';
import { stream } from './stream.js';
import { connectDemo } from './transports/demo.js';

const navContainer = document.getElementById('nav-container');
const mainContent = document.getElementById('main-content');

function setView(route, renderFn, params = {}) {
    renderNav(navContainer, route);
    renderFn(mainContent, params);
}

router
    .add('dashboard', () => setView('dashboard', renderDashboard))
    .add('twin', () => setView('twin', renderTwin))
    .add('sandbox', () => setView('sandbox', renderSandbox))
    .add('about', () => setView('about', renderAbout))
    .default('dashboard')
    .notFound(() => setView('dashboard', renderDashboard));

initTheme();
router.start();

// ?demo=1 auto-starts the synthetic module on any view — used by headless
// verification and by visitors with no hardware.
if (new URLSearchParams(window.location.search).has('demo')) {
    stream.connect(connectDemo);
}
