/**
 * Hash-based SPA router.
 *
 * ORIGIN: extracted from openchambers frontend/js/utils/router.js
 * (Automation_Station/Projects/openchambers). Genericized — the source
 * version has a project-specific "welcome wizard on first visit"
 * localStorage branch in _resolve(); that branch is removed here. The
 * matching/registration mechanics below are unchanged from source.
 *
 * Usage:
 *   router.add('home', renderHome);
 *   router.add('item/:id', renderItemDetail);
 *   router.notFound(renderHome);
 *   router.start();
 *
 * Navigate with plain <a href="#/home"> links, or call router.navigate('home').
 */
class Router {
    constructor() {
        this._routes = [];
        this._notFound = null;
        this._defaultRoute = 'home';
    }

    add(pattern, handler) {
        // Convert pattern like 'item/:id' to regex
        const paramNames = [];
        const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
        this._routes.push({
            regex: new RegExp(`^${regexStr}$`),
            handler,
            paramNames,
        });
        return this;
    }

    notFound(handler) {
        this._notFound = handler;
        return this;
    }

    default(route) {
        this._defaultRoute = route;
        return this;
    }

    start() {
        window.addEventListener('hashchange', () => this._resolve());
        this._resolve();
    }

    navigate(path) {
        window.location.hash = `#/${path}`;
    }

    _resolve() {
        const hash = window.location.hash.slice(2) || this._defaultRoute; // strip '#/'

        for (const route of this._routes) {
            const match = hash.match(route.regex);
            if (match) {
                const params = {};
                route.paramNames.forEach((name, i) => {
                    params[name] = decodeURIComponent(match[i + 1]);
                });
                route.handler(params);
                return;
            }
        }

        if (this._notFound) {
            this._notFound(hash);
        }
    }
}

export const router = new Router();
