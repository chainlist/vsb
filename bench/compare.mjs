// Prints the p50 and p95 of several result files side by side: node bench/compare.mjs <label>...
// A label without a number takes the median of its runs (label-1, label-2, ...).
import { existsSync, readFileSync } from 'node:fs';

const load = (label) => JSON.parse(readFileSync(new URL(`./results/${label}.json`, import.meta.url))).stats;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function runs(label) {
	if (existsSync(new URL(`./results/${label}.json`, import.meta.url))) return [load(label)];
	const found = [];
	for (let i = 1; existsSync(new URL(`./results/${label}-${i}.json`, import.meta.url)); i++) found.push(load(`${label}-${i}`));
	return found;
}
const labels = process.argv.slice(2);
const sets = labels.map(runs);
const names = [...new Set(sets.flatMap((s) => s.flatMap(Object.keys)))];
const table = {};
for (const name of names) {
	table[name] = {};
	labels.forEach((label, i) => {
		const got = sets[i].map((s) => s[name]).filter(Boolean);
		if (!got.length) return;
		table[name][`${label} p50`] = median(got.map((g) => g.p50));
		table[name][`${label} p95`] = median(got.map((g) => g.p95));
	});
}
console.table(table);
