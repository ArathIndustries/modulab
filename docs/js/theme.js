/**
 * Theme toggle with localStorage persistence and OS-preference fallback.
 *
 * ORIGIN: extracted near-verbatim from openchambers
 * frontend/js/utils/theme.js. Only the localStorage key changed.
 */
const STORAGE_KEY = 'seed-b-theme';

export function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

export function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
}

export function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}
