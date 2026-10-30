// The web build: the same app on the browser's own backend (the `web` condition of `#platform` in
// package.json), as a static site for GitHub Pages under /vsb. `pnpm dev:web` and `pnpm build:web`
// use it; the desktop keeps vite.config.ts, untouched.
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Every route is served by the fallback page. `build:web` copies it to 404.html, which GitHub
			// Pages serves for any path it does not know, so a link to a vault opens it.
			adapter: adapter({ pages: 'build/web', fallback: 'index.html' }),
			paths: { base: '/vsb' },
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
