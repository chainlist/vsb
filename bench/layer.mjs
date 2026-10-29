// What the platform layer itself costs on the desktop: the same calls made straight to the Tauri
// module (today's code, as `api.ts` held it before the layer) and through `api.ts`, alternating call
// by call, so drift in the machine's load hits both alike.
//
//   node bench/layer.mjs --port 9224
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { connect } from './cdp.mjs';
import { generate } from './vault.mjs';

async function ab({ vaultId }) {
	const direct = await import('/src/lib/platform/tauri.ts');
	const layer = await import('/src/lib/api.ts');
	await layer.openVault(vaultId);
	const view = (cx, cy) => ({ minX: cx - 1600, minY: cy - 1000, maxX: cx + 1600, maxY: cy + 1000 });
	const { cards } = await layer.queryViewport(view(2000, 1500), 0, null);
	const card = cards.find((c) => c.zone);
	const calls = {
		'viewport 100%': (api, i) => api.queryViewport(view(2000 + (i % 30) * 400, 1500), 4, null),
		'move card': (api, i) => api.moveCards([{ id: card.id, x: card.x + (i % 2) * 20, y: card.y }]),
		search: (api, i) => api.search('strategy interview'.slice(0, 1 + (i % 18)), 0, 50),
		'zone rows': (api) => api.zoneRows(null, 0, 50),
		'unplaced page': (api, i) => api.unplacedNotes((i % 10) * 50, 50)
	};
	const out = {};
	for (const [name, call] of Object.entries(calls)) {
		const times = { direct: [], layer: [] };
		for (let i = 0; i < 200; i++) {
			// Alternate which goes first, so neither always runs on a warmer cache.
			for (const [label, api] of i % 2 ? [['direct', direct], ['layer', layer]] : [['layer', layer], ['direct', direct]]) {
				const t = performance.now();
				await call(api, i);
				times[label].push(performance.now() - t);
			}
		}
		await layer.moveCards([{ id: card.id, x: card.x, y: card.y }]);
		out[name] = times;
	}
	return out;
}

const { values: args } = parseArgs({ options: { port: { type: 'string' } } });
const page = await connect(Number(args.port));
const raw = await page.evaluate(`(${ab})(${JSON.stringify({ vaultId: generate().vaultId })})`);
page.close();
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const table = {};
for (const [name, { direct, layer }] of Object.entries(raw)) {
	const [d, l] = [median(direct), median(layer)];
	table[name] = { n: direct.length, 'direct p50': +d.toFixed(2), 'layer p50': +l.toFixed(2), 'difference ms': +(l - d).toFixed(3) };
}
console.table(table);
const out = new URL('./results/desktop-layer-ab.json', import.meta.url);
writeFileSync(out, JSON.stringify({ label: 'desktop-layer-ab', date: new Date().toISOString(), stats: table }, null, '\t') + '\n');
