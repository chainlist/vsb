// The presentation site: a home page and a download page, prerendered for GitHub Pages at /vsb,
// beside the web app at /vsb/web (../vite.web.config.ts), which the root's `pnpm build:pages` builds
// after it. A package of its own, so its routes and generated types never mix with the app's.
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: { runes: true },
			adapter: adapter({ pages: '../build/pages' }),
			paths: { base: '/vsb' },
			// Not `_app`, as the web build: GitHub Pages leaves out folders starting with an underscore
			// when Jekyll builds it.
			appDir: 'app'
		})
	],
	server: { port: 5176 }
});
