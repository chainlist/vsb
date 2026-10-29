// Builds the test vault in a browser through `#lib/api`, as the app would: zones, then cards and
// their notes, then the unplaced notes and the edges. Prints the new vault's ID.
//
//   node bench/generate-browser.mjs --port 9225 --base /vsb/ --name bench-vault
import { parseArgs } from 'node:util';
import { connect } from './cdp.mjs';
import { generate } from './vault.mjs';

async function build({ base, name }) {
	const api = await import(`${base}src/lib/api.ts`);
	const { createVault } = await import(`${base}src/lib/platform/browser/vaults.ts`);
	const plan = generate();
	const { id } = await createVault(name);
	await api.openVault(id);
	const started = performance.now();
	const zones = new Map();
	// Parents come first in the plan, so each zone lands inside its own.
	for (const z of plan.zones) {
		const { id: zone } = await api.createZone(z.abs.x, z.abs.y, z.w, z.h);
		zones.set(z.id, zone);
		await api.renameZone(zone, z.name);
		if (z.color) await api.colorItems([], [zone], z.color);
	}
	const cards = [];
	for (const c of plan.cards) {
		const card = await api.createCard(c.abs.x, c.abs.y, c.w, c.h);
		if (c.note) await api.createNoteForCard(card, c.note.text);
		if (c.color) await api.colorItems([card], [], c.color);
		cards.push(card);
	}
	const placed = new Set(plan.cards.map((c) => c.note).filter(Boolean));
	for (const n of plan.notes.filter((n) => !placed.has(n))) {
		const card = await api.createCard(-100000, -100000, 240, 140);
		await api.createNoteForCard(card, n.text);
		await api.deleteCards([card]);
	}
	for (const e of plan.edges) {
		const { id: edge } = await api.createEdge(cards[e.from], cards[e.to]);
		if (e.arrow !== 'to') await api.arrowEdges([edge], e.arrow);
		if (e.stroke !== 'solid') await api.strokeEdges([edge], e.stroke);
		if (e.shape !== 'curved') await api.shapeEdges([edge], e.shape);
		if (e.label) await api.labelEdge(edge, e.label);
	}
	return { id, seconds: Math.round((performance.now() - started) / 1000) };
}

const { values: args } = parseArgs({ options: { port: { type: 'string' }, base: { type: 'string', default: '/vsb/' }, name: { type: 'string', default: 'bench-vault' } } });
const page = await connect(Number(args.port));
const made = await page.evaluate(`(() => { ${generate}; return (${build})(${JSON.stringify({ base: args.base, name: args.name })}); })()`);
page.close();
console.log(JSON.stringify(made));
