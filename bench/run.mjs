// Runs the scenarios in a running app over CDP and writes their p50 and p95 to bench/results.
//
//   node bench/run.mjs --port 9224 --label desktop-before [--cold] [--base /] [--vault <id>]
//
// See bench/README.md for starting the app copies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { connect } from './cdp.mjs';
import { coldOpen, scenarios } from './scenarios.mjs';
import { generate } from './vault.mjs';

const { values: args } = parseArgs({
	options: {
		port: { type: 'string' },
		label: { type: 'string' },
		cold: { type: 'boolean', default: false },
		base: { type: 'string', default: '/' },
		vault: { type: 'string' }
	}
});

const plan = generate();
const input = { base: args.base, vaultId: args.vault ?? plan.vaultId, search: plan.search };
const page = await connect(Number(args.port));
const call = (fn) => page.evaluate(`(${fn})(${JSON.stringify(input)})`);

const raw = { ...(args.cold ? await call(coldOpen) : {}), ...(await call(scenarios)) };
page.close();

/** The value at a fraction of the sorted times, by nearest rank. */
const rank = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const round = (ms) => Math.round(ms * 100) / 100;
const stats = Object.fromEntries(
	Object.entries(raw).map(([name, times]) => {
		const sorted = [...times].sort((a, b) => a - b);
		return [name, { n: sorted.length, p50: round(rank(sorted, 0.5)), p95: round(rank(sorted, 0.95)), max: round(sorted.at(-1)) }];
	})
);
console.table(stats);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${args.label}.json`, import.meta.url), JSON.stringify({ label: args.label, date: new Date().toISOString(), stats }, null, '\t') + '\n');
