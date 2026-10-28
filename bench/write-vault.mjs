// Writes the test vault as files, for the desktop app: node bench/write-vault.mjs <folder>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from './vault.mjs';

const root = process.argv[2];
if (!root) throw new Error('usage: node bench/write-vault.mjs <folder>');
const plan = generate();
rmSync(root, { recursive: true, force: true });
for (const dir of ['notes', '.canvas/zones', '.canvas/cards', '.canvas/edges']) mkdirSync(join(root, dir), { recursive: true });

const json = (path, value) => writeFileSync(join(root, path), JSON.stringify(value, null, 2));
json('.canvas/vault.json', { format: 1, id: plan.vaultId });
for (const n of plan.notes) writeFileSync(join(root, n.file), `---\nid: ${n.id}\n---\n${n.text}`);
for (const z of plan.zones) {
	json(`.canvas/zones/${z.id}.json`, { name: z.name, parent: z.parent, x: z.x, y: z.y, w: z.w, h: z.h, ...(z.color && { color: z.color }) });
}
for (const c of plan.cards) {
	json(`.canvas/cards/${c.id}.json`, { note: c.note?.id ?? null, zone: c.zone, x: c.x, y: c.y, w: c.w, h: c.h, ...(c.color && { color: c.color }) });
}
// Fields at their default are left out, as the app writes them.
for (const e of plan.edges) {
	const style = { label: e.label, shape: e.shape === 'curved' ? null : e.shape, arrow: e.arrow === 'to' ? null : e.arrow, stroke: e.stroke === 'solid' ? null : e.stroke };
	const kept = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== null));
	json(`.canvas/edges/${e.id}.json`, { from: plan.cards[e.from].id, to: plan.cards[e.to].id, ...kept });
}
console.log(JSON.stringify({ id: plan.vaultId, zones: plan.zones.length, cards: plan.cards.length, notes: plan.notes.length, edges: plan.edges.length }));
