// The browser backend's edge edits, inserting on an edge and Tab's linked card: the desktop's edges,
// insert and child tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, edgeOf, file, files, fresh, put, WORLD, zoneAt } from './browser.mjs';

const twoCards = async () => {
	await fresh();
	await put(cardAt('A', null, 0, 0), cardAt('B', null, 400, 300));
};

const ends = async (rect = WORLD) => {
	const { edges } = await api.queryViewport(rect, 0, null);
	assert.equal(edges.length, 1);
	return edges[0].ends.map((e) => [e.x, e.y, e.w, e.h]);
};

test('creating an edge writes it, and undo removes it', async () => {
	await twoCards();
	const created = await api.createEdge('A', 'B');
	assert.deepEqual(await file('edge', created.id), { from: 'A', to: 'B' }, 'no label until there is one');
	assert.deepEqual(await ends(), [[0, 0, 100, 50], [400, 300, 100, 50]]);
	const redo = await api.applyStates(created.undo);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 0);
	await api.applyStates(redo);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 1);
});

test("a drawn edge takes the vault's style for new edges", async () => {
	await twoCards();
	await api.setVaultEdgeStyle({ shape: 'straight', arrow: 'both', stroke: 'solid' });
	const { id } = await api.createEdge('A', 'B');
	assert.deepEqual(await file('edge', id), { from: 'A', to: 'B', shape: 'straight', arrow: 'both' });
});

test('an edge joins two different existing cards once', async () => {
	await twoCards();
	await assert.rejects(api.createEdge('A', 'A'), (e) => typeof e === 'string', 'no loops, and errors are plain strings');
	await assert.rejects(api.createEdge('A', 'GONE'));
	const first = await api.createEdge('A', 'B');
	const again = await api.createEdge('B', 'A');
	assert.deepEqual([again.id, again.undo.length], [first.id, 0]);
	assert.equal(Object.keys(await files()).filter((k) => k.startsWith('edges/')).length, 1);
});

test('labeling an edge writes it, and an empty label removes it', async () => {
	await twoCards();
	const { id } = await api.createEdge('A', 'B');
	const undo = await api.labelEdge(id, '  needs ');
	assert.equal((await file('edge', id)).label, 'needs');
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges[0].label, 'needs');
	const redo = await api.applyStates(undo);
	assert.ok(!('label' in (await file('edge', id))));
	await api.applyStates(redo);
	await api.labelEdge(id, ' ');
	assert.ok(!('label' in (await file('edge', id))));
});

test('deleting edges with one of their cards is undone in one step', async () => {
	await twoCards();
	await put(cardAt('C', null, 800, 0));
	const ab = (await api.createEdge('A', 'B')).id;
	await api.createEdge('B', 'C');
	const before = await files();
	const undo = [...(await api.deleteEdges([ab])), ...(await api.deleteCards(['B']))];
	assert.deepEqual(Object.keys(await files()), ['cards/A', 'cards/C']);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 0);
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 2);
});

test('an edge crossing the viewport is found with both cards off-screen', async () => {
	await fresh();
	await put(cardAt('A', null, 0, 0), cardAt('B', null, 2000, 0));
	await api.createEdge('A', 'B');
	const middle = { minX: 900, minY: -100, maxX: 1100, maxY: 100 };
	assert.equal((await api.queryViewport(middle, 0, null)).cards.length, 0);
	assert.deepEqual((await ends(middle))[1], [2000, 0, 100, 50]);
	assert.equal((await api.queryViewport({ minX: 900, minY: 100, maxX: 1100, maxY: 300 }, 0, null)).edges.length, 0);
});

test('edge ends follow card moves, resizes and zone moves', async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 500, 500), cardAt('A', null, 0, 0), cardAt('B', 'Z', 10, 10));
	await api.createEdge('A', 'B');
	const undo = await api.moveCards([{ id: 'A', x: 200, y: 300 }]);
	await api.resizeCard('A', 200, 300, 400, 100);
	assert.deepEqual((await ends())[0], [200, 300, 400, 100]);
	await api.moveZones([{ id: 'Z', x: 3000, y: 500 }]);
	assert.deepEqual((await ends())[1], [3010, 510, 100, 50]);
	// Found where it now runs, not where it ran.
	assert.equal((await api.queryViewport({ minX: 1100, minY: 0, maxX: 1200, maxY: 50 }, 0, null)).edges.length, 0);
	await api.applyStates(undo);
	assert.deepEqual((await ends())[0], [0, 0, 100, 50]);
});

test('shape, arrow and stroke are written only when not the default', async () => {
	await twoCards();
	await put(edgeOf('OLD', 'A', 'B'));
	let [view] = (await api.queryViewport(WORLD, 0, null)).edges;
	assert.deepEqual([view.shape, view.arrow, view.stroke], ['curved', 'to', 'solid']);
	const undo = await api.shapeEdges(['OLD'], 'angled');
	await api.arrowEdges(['OLD'], 'both');
	const restroke = await api.strokeEdges(['OLD'], 'dotted');
	assert.deepEqual(await file('edge', 'OLD'), { from: 'A', to: 'B', shape: 'angled', arrow: 'both', stroke: 'dotted' });
	[view] = (await api.queryViewport(WORLD, 0, null)).edges;
	assert.deepEqual([view.shape, view.arrow, view.stroke], ['angled', 'both', 'dotted']);
	await api.applyStates(restroke);
	await api.applyStates(undo);
	await api.arrowEdges(['OLD'], 'to');
	assert.deepEqual(await file('edge', 'OLD'), { from: 'A', to: 'B' });
});

/** A zone holding Name above a row of three cards, Name joined to Space by a labeled, styled edge. */
async function row() {
	await fresh();
	await put(
		zoneAt('Z', null, 0, 0, 700, 260),
		cardAt('NAME', 'Z', 300, 60),
		...[
			['OTHERS', 20],
			['SPACE', 340],
			['FRENCH', 500]
		].map(([id, x]) => cardAt(id, 'Z', x, 160)),
		edgeOf('E', 'NAME', 'SPACE', { label: 'needs', shape: 'angled', stroke: 'dashed' })
	);
}

const edgeFiles = async () => Object.entries(await files()).filter(([k]) => k.startsWith('edges/')).map(([, v]) => v);

test('inserting a card splits the edge, moves the row and grows the zone in one step', async () => {
	await row();
	// The halves are the old edge cut in two: the style for new edges is not theirs.
	await api.setVaultEdgeStyle({ shape: 'straight', arrow: 'both', stroke: 'dotted' });
	const before = await files();
	const moves = ['OTHERS', 'SPACE', 'FRENCH'].map((id, i) => ({ id, x: [20, 340, 500][i], y: 410 }));
	const created = await api.insertCard('E', 'Z', { minX: 300, minY: 190, maxX: 540, maxY: 330 }, moves, [], []);
	const n = created.id;
	assert.deepEqual(await file('card', n), { note: null, zone: 'Z', x: 300, y: 190, w: 240, h: 140 });
	assert.deepEqual([(await file('card', 'SPACE')).y, (await file('card', 'NAME')).y], [410, 60]);
	const z = await file('zone', 'Z');
	assert.deepEqual([z.y, z.h], [0, 480]);
	const split = await edgeFiles();
	assert.equal(split.length, 2, 'the old edge is gone');
	assert.deepEqual(split.find((e) => e.to === n), { from: 'NAME', to: n, label: 'needs', shape: 'angled', stroke: 'dashed' });
	assert.deepEqual(split.find((e) => e.from === n), { from: n, to: 'SPACE', shape: 'angled', stroke: 'dashed' });
	await api.applyStates(created.undo);
	assert.deepEqual(await files(), before);
});

test('a card inserted on the canvas joins no zone', async () => {
	await fresh();
	await put(cardAt('A', null, 0, 0), cardAt('B', null, 0, 400), edgeOf('E', 'A', 'B'));
	const { id } = await api.insertCard('E', null, { minX: 0, minY: 150, maxX: 100, maxY: 200 }, [], [], []);
	const card = await file('card', id);
	assert.deepEqual([card.zone, card.x, card.y], [null, 0, 150]);
	assert.deepEqual((await edgeFiles()).map((e) => [e.from, e.to]).sort(), [['A', id], [id, 'B']].sort());
});

test("a child and its edge are one step in the parent's zone, grown to hold it", async () => {
	await fresh();
	await put(zoneAt('Z', null, 100, 0, 600, 260), cardAt('P', 'Z', 20, 60));
	const before = await files();
	const created = await api.addChild('P', { minX: -200, minY: 60, maxX: 40, maxY: 200 });
	assert.deepEqual(await file('card', created.id), { note: null, zone: 'Z', x: 20, y: 60, w: 240, h: 140 });
	const z = await file('zone', 'Z');
	assert.deepEqual([z.x, z.w], [-220, 920]);
	const parent = (await api.queryViewport(WORLD, 0, null)).cards.find((c) => c.id === 'P');
	assert.deepEqual([parent.x, parent.y], [120, 60], 'the parent stays where it was on the canvas');
	assert.deepEqual(await edgeFiles(), [{ from: 'P', to: created.id }]);
	await api.applyStates(created.undo);
	assert.deepEqual(await files(), before);
});

test("a child's edge takes the vault's style for new edges", async () => {
	await fresh();
	await put(cardAt('P', null, 0, 60));
	await api.setVaultEdgeStyle({ shape: 'angled', arrow: 'none', stroke: 'dotted' });
	const { id } = await api.addChild('P', { minX: 400, minY: 60, maxX: 640, maxY: 200 });
	assert.deepEqual(await edgeFiles(), [{ from: 'P', to: id, shape: 'angled', arrow: 'none', stroke: 'dotted' }]);
});

test('a child stays in its parent zone whatever lies under it, and needs its parent', async () => {
	await fresh();
	await put(zoneAt('Z', null, 400, 0, 600, 400), cardAt('P', null, 0, 60));
	const { id } = await api.addChild('P', { minX: 500, minY: 100, maxX: 740, maxY: 240 });
	assert.equal((await file('card', id)).zone, null);
	const before = await files();
	await assert.rejects(api.addChild('GONE', { minX: 0, minY: 0, maxX: 240, maxY: 140 }));
	assert.deepEqual(await files(), before, 'a failed edit writes nothing');
});
