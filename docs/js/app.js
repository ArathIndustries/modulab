/**
 * App bootstrap: routes, nav, theme. Fixed startup order: grab the DOM
 * refs, register routes, init the theme, then start the router.
 */
import { router } from './router.js';
import { initTheme } from './theme.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './views/dashboard.js';
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
    .add('sandbox', () => setView('sandbox', renderSandbox))
    .add('dashboard', () => setView('dashboard', renderDashboard))
    .add('about', () => setView('about', renderAbout))
    .default('sandbox')
    .notFound(() => setView('sandbox', renderSandbox));

initTheme();
router.start();

// Auto-start an input source from the URL on any view — used by headless
// verification and by visitors with no hardware. ?manual=1 (sliders,
// optionally &ch0=..&ch1=.. presets) takes precedence over ?demo=1.
const bootParams = new URLSearchParams(window.location.search);
if (bootParams.has('manual')) {
    import('./transports/manual.js').then(({ connectManual }) => stream.connect(connectManual));
} else if (bootParams.has('demo')) {
    stream.connect(connectDemo);
}
