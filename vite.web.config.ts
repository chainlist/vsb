// The web build: the same app on the browser's own backend (the `web` condition of `#platform` in
// package.json), as a static site for GitHub Pages under /vsb/web, beside the presentation site
// (vite.site.config.ts) at /vsb. `pnpm dev:web` and `pnpm build:web` use it; the desktop keeps
// vite.config.ts, untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';

const base = '/vsb/web';
// Every route is served by the fallback page.
const pages = adapter({ pages: 'build/pages/web', fallback: 'index.html' });

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: {
				...pages,
				async adapt(builder) {
					await pages.adapt(builder);
					// GitHub Pages serves the site's one 404.html for any path it does not know: the app's
					// page, so a link to a vault opens it. A path outside the app goes to the site's home
					// before the app starts, which would send the browser there itself and get this page
					// again, forever.
					const page = readFileSync('build/pages/web/index.html', 'utf8');
					const guard = `<script>if (!location.pathname.startsWith('${base}/')) { stop(); location.replace('/vsb/'); }</script>`;
					writeFileSync('build/pages/404.html', page.replace('<head>', `<head>\n\t\t${guard}`));
				}
			},
			paths: { base },
			// Not `_app`: GitHub Pages leaves out folders starting with an underscore when Jekyll builds it.
			appDir: 'app'
		})
	],
	// Its own prebundled dependencies: its conditions differ from the desktop's, so sharing
	// node_modules/.vite would replace the desktop dev server's while it runs, and the files it has not
	// served yet would fail with "Outdated Optimize Dep".
	cacheDir: 'node_modules/.vite-web',
	resolve: { conditions: ['web', ...defaultClientConditions] },
	environments: { ssr: { resolve: { conditions: ['web', ...defaultServerConditions] } } }
});
