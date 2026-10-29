// How long the canvas takes to show the zoomed-out map: from asking for it to the next frame painted
// (the query, then reading the answer, updating the page and painting it), the longest the main
// thread is held meanwhile (what a user could feel as a stall), and how many elements it draws. The
// canvas is emptied first each time, so every zone, preview, cluster and bundle is drawn anew, as
// when zooming out from open zones.
//
//   node bench/render.mjs --port 9224 --label desktop-render-after-1 [--base /vsb/] [--vault <id>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { connect } from './cdp.mjs';
import { generate } from './vault.mjs';

async function render({ base }) {
	const { camera } = await import(`${base}src/lib/canvas/camera.svelte.ts`);
	const { items } = await import(`${base}src/lib/canvas/items.svelte.ts`);
	/** Resolves once the next frame is painted. */
	const painted = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
	/** The longest gap between two turns of the main thread while `run` runs. */
	async function held(run) {
		const ch = new MessageChannel();
		let [last, worst, live] = [performance.now(), 0, true];
		ch.port1.onmessage = () => {
			const now = performance.now();
			worst = Math.max(worst, now - last);
			last = now;
			if (live) ch.port2.postMessage(0);
		};
		ch.port2.postMessage(0);
		await run();
		live = false;
		return worst;
	}
	const results = {};
	const record = (name, ms) => (results[name] ??= []).push(ms);
	for (const [name, zoom, y] of [['20%', 0.2, 12000], ['5%', 0.05, 23000]]) {
		for (let i = 0; i < 10; i++) {
			const cx = 2000 + (i * 400) / zoom;
			camera.zoom = zoom;
			camera.x = cx - camera.width / 2 / zoom;
			camera.y = y - camera.height / 2 / zoom;
			// The canvas's own query for the new view lands first; then each run starts from nothing.
			await items.refresh();
			items.reset();
			await painted();
			const asked = performance.now();
			const block = await held(async () => {
				await items.refresh();
				await painted();
			});
			record(`shown ${name}`, performance.now() - asked);
			record(`main thread ${name}`, block);
			record(`elements ${name}`, document.querySelectorAll('.world *').length);
		}
	}
	return results;
}

const { values: args } = parseArgs({ options: { port: { type: 'string' }, label: { type: 'string' }, base: { type: 'string', default: '/' }, vault: { type: 'string' } } });
const vault = args.vault ?? generate().vaultId;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** The scenario on the vault's canvas, opened as the app opens it. The dev server may reload the page
 * the first time the canvas loads, while it bundles what the canvas needs: then it runs again. */
async function run() {
	for (let attempt = 1; ; attempt++) {
		const page = await connect(Number(args.port));
		try {
			if (!page.url.includes(`/vault/${vault}`)) {
				await page.evaluate(`location.href = '${args.base}vault/${vault}'`).catch(() => {});
				await wait(8000);
				continue;
			}
			return await page.evaluate(`(${render})(${JSON.stringify({ base: args.base })})`);
		} catch (e) {
			if (attempt === 3) throw e;
			await wait(5000);
		} finally {
			page.close();
		}
	}
}
const raw = await run();
const rank = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const stats = Object.fromEntries(
	Object.entries(raw).map(([name, values]) => {
		const sorted = [...values].sort((a, b) => a - b);
		return [name, { n: sorted.length, p50: Math.round(rank(sorted, 0.5) * 100) / 100, p95: Math.round(rank(sorted, 0.95) * 100) / 100, max: Math.round(sorted.at(-1) * 100) / 100 }];
	})
);
console.table(stats);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${args.label}.json`, import.meta.url), JSON.stringify({ label: args.label, date: new Date().toISOString(), stats }, null, '\t') + '\n');
