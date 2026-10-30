// The presentation site: the home page and the download page, a static site for GitHub Pages at
// /vsb, with the web app beside it at /vsb/web (vite.web.config.ts). `pnpm dev:site` serves it and
// `pnpm build:pages` builds both into build/pages.
//
// Its pages write %name% for the app's name, taken from tauri.conf.json so that renaming the app
// renames the site, %base% for the site's root and %repo% for the GitHub repository, and include
// their shared parts with <!--#include file.html-->.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const base = '/vsb/';
const words: Record<string, string> = {
	name: JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).productName,
	base,
	repo: 'chainlist/vsb'
};

export default defineConfig({
	root: 'site',
	base,
	plugins: [
		{
			name: 'site-words',
			transformIndexHtml: {
				// Before Vite reads the page's own %ENV% words and asset URLs.
				order: 'pre',
				handler: (html) =>
					html
						.replace(/<!--#include (\S+)-->/g, (_, file) => readFileSync(`site/${file}`, 'utf8'))
						.replace(/%(name|base|repo)%/g, (_, word) => words[word])
			}
		}
	],
	// Its own prebundled dependencies, apart from the app's dev servers (see vite.web.config.ts).
	cacheDir: '../node_modules/.vite-site',
	server: { port: 5176 },
	build: {
		outDir: '../build/pages',
		emptyOutDir: true,
		rolldownOptions: { input: { home: 'site/index.html', download: 'site/download/index.html' } }
	}
});
