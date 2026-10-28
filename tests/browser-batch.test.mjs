// The browser backend's batch creation and builder edits: the desktop's batch and batch_edit tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, edgeOf, file, files, fresh, noteCard, put, WORLD, zoneAt } from './browser.mjs';

const cards = (at) => at.map(([text, x, y]) => ({ text, x, y, w: 240, h: 140 }));
const edge = (from, to) => ({ from, to, arrow: 'to', stroke: 'solid' });
const edgeFiles = async () => Object.entries(await files()).filter(([k]) => k.startsWith('edges/')).map(([, v]) => v);

test('a batch writes a note and a centered card for each text, and its edges, in one step', async () => {
	await fresh();
	const texts = ['Competitor scan', 'Price tiers', 'Customer interviews', 'Pricing risks', 'Open questions'];
	const at = [[0, 90], [320, 180], [640, 180], [320, 0], [0, 270]];
	const batch = await api.createBatch(400, 200, cards(texts.map((t, i) => [t, ...at[i]])), [edge(0, 1), edge(1, 2), edge(0, 3)]);
	assert.equal(batch.cards.length, 5);
	for (const [i, id] of batch.cards.entries()) {
		const card = await file('card', id);
		assert.deepEqual([card.zone, card.x, card.y, card.w, card.h, card.halign, card.valign], [null, ...at[i], 240, 140, 'center', 'center']);
		assert.equal(await api.readNote(card.note), texts[i]);
	}
	const c = batch.cards;
	assert.deepEqual((await edgeFiles()).map((e) => [e.from, e.to]).sort(), [[c[0], c[1]], [c[1], c[2]], [c[0], c[3]]].sort());

	// One undo step takes the cards and edges away; the notes stay, unplaced. Redo brings them back.
	const after = await files();
	const redo = await api.applyStates(batch.undo);
	assert.deepEqual(await files(), {});
	assert.equal((await api.unplacedNotes(0, 50)).length, 5);
	assert.deepEqual((await api.unplacedNotes(0, 50)).map((n) => n.path).sort(), texts.map((t) => `notes/${t}.md`).sort());
	await api.applyStates(redo);
	assert.deepEqual(await files(), after);
	assert.equal((await api.unplacedNotes(0, 50)).length, 0);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 3);
});

test('a batch run inside a zone joins it and grows it, its contents in place', async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 400, 300), cardAt('C', 'Z', 20, 60));
	const [before, original] = [await files(), await file('zone', 'Z')];
	const batch = await api.createBatch(1100, 100, cards([['A', 900, 30], ['B', 1220, 30]]), [edge(0, 1)]);
	const z = await file('zone', 'Z');
	assert.deepEqual([z.x, z.y, z.w, z.h], [880, -30, 600, 330], '20 around the cards, 60 above them for the name');
	const a = await file('card', batch.cards[0]);
	assert.deepEqual([a.zone, a.x, a.y], ['Z', 20, 60]);
	assert.deepEqual((await api.itemBox('card', 'C')), { minX: 1020, minY: 60, maxX: 1120, maxY: 110 }, 'what Z held stays in place');
	await api.applyStates(batch.undo);
	assert.deepEqual(await files(), before);
	// A batch that fits leaves the zone alone.
	const small = await api.createBatch(1200, 200, cards([['Small', 1100, 80]]), []);
	assert.deepEqual(await file('zone', 'Z'), original);
	assert.equal((await file('card', small.cards[0])).zone, 'Z');
});

test('a batch keeps one edge between two cards and refuses what it cannot write', async () => {
	await fresh();
	const two = cards([['A', 0, 0], ['B', 320, 0]]);
	const blank = cards([['A', 0, 0], [' ', 0, 0]]);
	for (const [batch, edges] of [[two, [edge(0, 0)]], [two, [edge(0, 2)]], [blank, []]]) await assert.rejects(api.createBatch(0, 0, batch, edges));
	assert.deepEqual(await api.search('a', 0, 50), [], 'nothing is written for a refused batch');
	const first = { from: 1, to: 0, arrow: 'both', stroke: 'dashed' };
	const batch = await api.createBatch(0, 0, two, [first, edge(0, 1), edge(1, 0)]);
	assert.deepEqual(await edgeFiles(), [{ from: batch.cards[1], to: batch.cards[0], arrow: 'both', stroke: 'dashed' }]);
});

/** Cards A, B, C, D and X with notes titled by their names, and edges: A to B labeled and angled, B
 * and C with no heads and dashed, C and A both ways and dotted, A to X. */
async function linked() {
	await fresh();
	const id = {};
	for (const [i, name] of ['A', 'B', 'C', 'D', 'X'].entries()) id[name] = (await noteCard(`${name}\nMore lines.`, i * 300, 0)).card;
	await put(
		edgeOf('E1', id.A, id.B, { label: 'needs', shape: 'angled' }),
		edgeOf('E2', id.B, id.C, { arrow: 'none', stroke: 'dashed' }),
		edgeOf('E3', id.C, id.A, { arrow: 'both', stroke: 'dotted' }),
		edgeOf('E4', id.A, id.X)
	);
	return id;
}

const link = (from, to, arrow, stroke) => ({ from, to, arrow, stroke });

test('the builder opens with a zone at any depth by title, or with the selected cards', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 2000, 2000), zoneAt('Z2', 'Z', 100, 100, 800, 800));
	const A = (await noteCard('Alpha', 1000, 100)).card;
	const B = (await noteCard('Beta', 110, 110)).card;
	const E = await api.createCard(1500, 1500, 100, 50);
	const X = (await noteCard('Xeno', 0, -500)).card;
	await put(edgeOf('AB', A, B), edgeOf('AX', A, X), edgeOf('BE', B, E));
	assert.deepEqual([(await file('card', A)).zone, (await file('card', B)).zone], ['Z', 'Z2']);

	const zone = await api.batchScope('Z', []);
	assert.deepEqual(zone.cards.map((c) => [c.id, c.title, c.x, c.y]), [[A, 'Alpha', 1000, 100], [B, 'Beta', 110, 110]]);
	assert.deepEqual(zone.edges.map((e) => e.id), ['AB']);
	assert.equal(zone.zone, 'Z');

	const one = await api.batchScope(null, [X]);
	assert.deepEqual(one.cards.map((c) => c.id), [X, A]);
	assert.deepEqual(one.edges.map((e) => e.id), ['AX']);
	assert.equal(one.zone, null);
	assert.equal((await api.batchScope(null, [B])).zone, 'Z2');
	assert.equal((await api.batchScope(null, [A, B])).zone, null);
	const picked = await api.batchScope(null, [B, E]);
	assert.deepEqual(picked.cards.map((c) => c.id), [A, B]);
	assert.deepEqual(picked.edges.map((e) => e.id), ['AB']);
});

test('a text left as written changes nothing', async () => {
	const id = await linked();
	const scope = [id.A, id.B, id.C, id.D];
	const written = [link({ card: id.A }, { card: id.B }, 'to', 'solid'), link({ card: id.B }, { card: id.C }, 'none', 'solid'), link({ card: id.A }, { card: id.C }, 'both', 'dotted')];
	assert.deepEqual(await api.planLinks(scope, written), { removed: [], restyled: [], created: [] });
	const before = await files();
	const batch = await api.editBatch(null, scope, [], written);
	assert.deepEqual(batch.undo, []);
	assert.deepEqual(await files(), before);
});

test('the text removes, restyles and creates edges and adds cards in one step', async () => {
	const id = await linked();
	const scope = [id.A, id.B, id.C, id.D];
	const links = [
		link({ card: id.B }, { card: id.A }, 'to', 'solid'),
		link({ card: id.C }, { card: id.A }, 'both', 'dotted'),
		link({ card: id.A }, { card: id.D }, 'to', 'dashed'),
		link({ card: id.C }, { new: 0 }, 'to', 'double')
	];
	assert.deepEqual(await api.planLinks(scope, links), { removed: ['E2'], restyled: [['E1', 0]], created: [2, 3] });
	const before = await files();
	const batch = await api.editBatch(null, scope, [{ text: 'Delta', x: 900, y: 300, w: 240, h: 140 }], links);
	assert.deepEqual(await file('edge', 'E1'), { from: id.B, to: id.A, label: 'needs', shape: 'angled' });
	assert.equal(await file('edge', 'E2'), undefined);
	const after = await files();
	for (const kept of ['edges/E3', 'edges/E4']) assert.deepEqual(after[kept], before[kept]);
	const fresh = Object.entries(after).filter(([k]) => k.startsWith('edges/') && !(k in before)).map(([, v]) => [v.from, v.to, v.stroke]);
	assert.deepEqual(fresh.sort(), [[id.A, id.D, 'dashed'], [id.C, batch.cards[0], 'double']].sort());
	await api.applyStates(batch.undo);
	assert.deepEqual(await files(), before);
});

test('links join two different cards of the batch', async () => {
	const id = await linked();
	const scope = [id.A, id.B, id.C, id.D];
	for (const bad of [link({ card: id.A }, { card: id.X }, 'to', 'solid'), link({ card: id.A }, { new: 1 }, 'to', 'solid'), link({ card: id.A }, { card: id.A }, 'to', 'solid')]) {
		await assert.rejects(api.editBatch(null, scope, [], [bad]));
	}
});
