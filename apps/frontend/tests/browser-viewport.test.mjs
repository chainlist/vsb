// The browser backend's viewport query, open and zoomed out: the desktop's index and cluster tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, edgeOf, fresh, put, WORLD, zoneAt } from './browser.mjs';

const ids = (items) => items.map((i) => i.id).sort();

test('the viewport returns absolute positions through nested zones', async () => {
	await fresh();
	await put(zoneAt('Z1', null, 1000, 0, 800, 600), zoneAt('Z2', 'Z1', 100, 100, 400, 300), cardAt('C1', 'Z2', 10, 20), cardAt('C2', null, 0, 0));
	const all = await api.queryViewport(WORLD, 0, null);
	assert.deepEqual(all.zones.map((z) => [z.id, z.x, z.y]), [['Z1', 1000, 0], ['Z2', 1100, 100]]);
	const c1 = all.cards.find((c) => c.id === 'C1');
	assert.deepEqual([c1.x, c1.y], [1110, 120]);
	const c2 = all.cards.find((c) => c.id === 'C2');
	assert.deepEqual([c2.note, c2.resolved], [null, false]);

	const left = await api.queryViewport({ minX: -10, minY: -10, maxX: 200, maxY: 200 }, 0, null);
	assert.deepEqual(ids(left.cards), ['C2']);
	assert.equal(left.zones.length, 0);
	const tiny = await api.queryViewport(WORLD, 500, null);
	assert.equal(tiny.zones.length, 1);
	assert.equal(tiny.cards.length, 0);
});

test('zoomed out, nothing inside a zone comes back', async () => {
	await fresh();
	await put(
		zoneAt('Z1', null, 1000, 0, 800, 600),
		zoneAt('Z2', 'Z1', 100, 100, 400, 300),
		cardAt('IN1', 'Z1', 600, 20),
		cardAt('IN2', 'Z2', 10, 20),
		cardAt('L1', null, 0, 0),
		cardAt('L2', null, 0, 300),
		edgeOf('E1', 'L1', 'L2'),
		edgeOf('E2', 'L1', 'IN2')
	);
	const out = await api.queryViewport(WORLD, 0, 1024);
	assert.deepEqual([ids(out.zones), out.cards, out.edges], [['Z1'], [], []]);
	const open = await api.queryViewport(WORLD, 0, null);
	assert.deepEqual([ids(open.zones), ids(open.cards), ids(open.edges)], [['Z1', 'Z2'], ['IN1', 'IN2', 'L1', 'L2'], ['E1', 'E2']]);
});

test('a card pointing at a missing note is unresolved', async () => {
	await fresh();
	await put(cardAt('C1', null, 0, 0, { note: 'GONE' }));
	const [card] = (await api.queryViewport(WORLD, 0, null)).cards;
	assert.deepEqual([card.note, card.resolved], ['GONE', false]);
});

test('a card lands in the innermost zone holding its center', async () => {
	await fresh();
	await put(zoneAt('Z1', null, 0, 0, 1000, 1000), zoneAt('Z2', 'Z1', 100, 100, 200, 200));
	const zoneOf = async (x, y) => (await api.queryViewport(WORLD, 0, null)).cards.find((c) => c.id === x)?.zone;
	const a = await api.createCard(100, 125, 100, 50);
	const b = await api.createCard(450, 475, 100, 50);
	const c = await api.createCard(-55, -25, 100, 50);
	assert.deepEqual([await zoneOf(a), await zoneOf(b), await zoneOf(c)], ['Z2', 'Z1', null]);
});

test('an edge is found by the box around both its cards', async () => {
	await fresh();
	await put(cardAt('A', null, 0, 0), cardAt('B', null, 400, 300), edgeOf('E', 'A', 'B'));
	const inside = await api.queryViewport({ minX: 450, minY: 0, maxX: 460, maxY: 10 }, 0, null);
	assert.deepEqual([inside.cards.length, ids(inside.edges)], [0, ['E']]);
	const outside = await api.queryViewport({ minX: 501, minY: 0, maxX: 600, maxY: 10 }, 0, null);
	assert.equal(outside.edges.length, 0);
});

test('an item far bigger than the grid is still found', async () => {
	await fresh();
	await put(zoneAt('BIG', null, -200000, -200000, 400000, 400000), cardAt('A', null, -150000, 0), cardAt('B', null, 150000, 0), edgeOf('E', 'A', 'B'));
	const middle = await api.queryViewport({ minX: -10, minY: -10, maxX: 10, maxY: 60 }, 0, null);
	assert.deepEqual([ids(middle.zones), ids(middle.edges)], [['BIG'], ['E']]);
});

/** Each cluster as [column, row, count, box]. */
const clusters = (v) => v.clusters.map((c) => [c.cell[0], c.cell[1], c.count, [c.x, c.y, c.w, c.h]]);

/** Each bundle as [from, to, count, arrow], an end named by its zone or, for a cluster, its box's corner. */
const bundles = (v) => v.bundles.map((b) => [...b.ends.map((e) => e.zone ?? `(${e.x}, ${e.y})`), b.count, b.arrow]);

test('loose cards are counted per cell, never returned', async () => {
	await fresh();
	// Cards are 100 by 50: these have their centers at (-10, -10), (10, 10), (0, 0) and (-210, 0).
	await put(
		cardAt('A', null, -60, -35),
		cardAt('B', null, -40, -15),
		cardAt('C', null, -50, -25),
		cardAt('D', null, -260, -25),
		// A card whose zone is missing sits on the canvas; a card in a zone is not loose.
		cardAt('E', 'GONE', 300, 0),
		zoneAt('Z', null, 1000, 1000, 400, 400),
		cardAt('IN', 'Z', 10, 10)
	);
	// Rounding toward zero would put A with B and C: the cells on either side of 0 are distinct.
	const v = await api.queryViewport(WORLD, 0, 512);
	assert.deepEqual(clusters(v), [
		[-1, -1, 1, [-60, -35, 100, 50]],
		[-1, 0, 1, [-260, -25, 100, 50]],
		[0, 0, 3, [-50, -25, 450, 75]]
	]);
	assert.deepEqual([v.cards, v.edges, ids(v.zones)], [[], [], ['Z']]);
});

test('cells on either side of 0 are distinct, and a cell comes back whole', async () => {
	await fresh();
	// Centers at (-90, -90) and (-10, -10), in cell (-1, -1) of 512; and (110, 10), in cell (0, 0).
	await put(cardAt('A', null, -140, -115), cardAt('B', null, -60, -35), cardAt('C', null, 60, -15));
	const corner = { minX: -5, minY: -5, maxX: -1, maxY: -1 };
	assert.deepEqual(clusters(await api.queryViewport(corner, 0, 512)), [[-1, -1, 2, [-140, -115, 180, 130]]]);
	// A card counts in the cell holding its center only.
	const middle = { minX: 1, minY: 1, maxX: 99, maxY: 99 };
	assert.deepEqual(clusters(await api.queryViewport(middle, 0, 512)), [[0, 0, 1, [60, -15, 100, 50]]]);
	const far = { minX: 600, minY: 600, maxX: 700, maxY: 700 };
	assert.deepEqual(clusters(await api.queryViewport(far, 0, 512)), []);
});

test('clusters follow cards moved, deleted and undone', async () => {
	await fresh();
	await put(cardAt('A', null, 0, 0), cardAt('B', null, 300, 300));
	const at = async () => clusters(await api.queryViewport(WORLD, 0, 1024));
	assert.deepEqual(await at(), [[0, 0, 2, [0, 0, 400, 350]]]);
	const undo = await api.moveCards([{ id: 'B', x: 2100, y: 0 }]);
	assert.deepEqual(await at(), [[0, 0, 1, [0, 0, 100, 50]], [2, 0, 1, [2100, 0, 100, 50]]]);
	const redo = await api.applyStates(undo);
	assert.deepEqual(await at(), [[0, 0, 2, [0, 0, 400, 350]]]);
	await api.applyStates(redo);
	await api.deleteCards(['A', 'B']);
	assert.deepEqual(await at(), []);
});

test('edges are bundled per pair of outermost zones', async () => {
	await fresh();
	await put(
		zoneAt('Z1', null, 0, 0, 1000, 1000),
		zoneAt('Z1a', 'Z1', 100, 100, 500, 500),
		zoneAt('Z2', null, 2000, 0, 1000, 1000),
		zoneAt('Z3', null, 0, 2000, 1000, 1000),
		cardAt('A', 'Z1', 700, 700),
		cardAt('B', 'Z1a', 10, 10),
		cardAt('C', 'Z2', 10, 10),
		cardAt('D', 'Z2', 300, 300),
		cardAt('E', 'Z3', 10, 10),
		// Z1 and Z2: edges both ways. B is in a zone inside Z1, so it counts for Z1.
		edgeOf('E1', 'A', 'C'),
		edgeOf('E2', 'B', 'D'),
		edgeOf('E3', 'D', 'A'),
		// Z3 to Z1: the lone arrowhead stays at Z1, the second end.
		edgeOf('E4', 'E', 'A'),
		// Z2 and Z3, with no arrowhead.
		edgeOf('E5', 'C', 'E', { arrow: 'none' }),
		// Inside Z1: left out.
		edgeOf('E6', 'A', 'B')
	);
	const v = await api.queryViewport(WORLD, 0, 1024);
	assert.deepEqual(bundles(v), [['Z1', 'Z2', 3, 'both'], ['Z3', 'Z1', 1, 'to'], ['Z2', 'Z3', 1, 'none']]);
	const z1 = v.bundles[0].ends[0];
	assert.deepEqual([z1.x, z1.y, z1.w, z1.h], [0, 0, 1000, 1000]);
	assert.equal(v.edges.length, 0);
});

test("a loose card's edges attach to its cluster, seen whole from anywhere", async () => {
	await fresh();
	await put(
		zoneAt('Z', null, 0, 0, 1000, 1000),
		cardAt('A', 'Z', 100, 100),
		// L1 and L2 are in cell (-1, 0) of 1024, L3 in cell (-3, 0).
		cardAt('L1', null, -500, 100),
		cardAt('L2', null, -800, 300),
		cardAt('L3', null, -3000, 0),
		edgeOf('E1', 'L1', 'A'),
		edgeOf('E2', 'L2', 'A'),
		edgeOf('E3', 'L1', 'L3'),
		// Inside one cluster: left out.
		edgeOf('E4', 'L1', 'L2')
	);
	const v = await api.queryViewport(WORLD, 0, 1024);
	assert.deepEqual(bundles(v), [['(-800, 100)', 'Z', 2, 'to'], ['(-800, 100)', '(-3000, 0)', 1, 'to']]);
	const end = v.bundles[0].ends[0];
	assert.deepEqual([end.x, end.y, end.w, end.h], [-800, 100, 400, 250]);

	// Looking at the zone alone, the cluster is off-screen and still its whole self.
	const zone = await api.queryViewport({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, 0, 1024);
	assert.deepEqual(bundles(zone), [['(-800, 100)', 'Z', 2, 'to']]);
});

test('bundles follow restyled, moved and deleted edges', async () => {
	await fresh();
	await put(zoneAt('Z1', null, 0, 0, 1000, 1000), zoneAt('Z2', null, 2000, 0, 1000, 1000), cardAt('A', 'Z1', 10, 10), cardAt('B', 'Z2', 10, 10), edgeOf('E', 'A', 'B'));
	const at = async () => bundles(await api.queryViewport(WORLD, 0, 1024));
	assert.deepEqual(await at(), [['Z1', 'Z2', 1, 'to']]);
	await api.arrowEdges(['E'], 'none');
	assert.deepEqual(await at(), [['Z1', 'Z2', 1, 'none']]);
	// Moved into Z2, both ends are one: no bundle.
	await api.moveCards([{ id: 'A', x: 2500, y: 500 }]);
	assert.deepEqual(await at(), []);
	await api.moveCards([{ id: 'A', x: 10, y: 10 }]);
	await api.deleteEdges(['E']);
	assert.deepEqual(await at(), []);
});

test('only the cell sizes the canvas asks for are kept', async () => {
	await fresh();
	await assert.rejects(api.queryViewport(WORLD, 0, 100), /512, 1024, 2048, 4096/);
});
