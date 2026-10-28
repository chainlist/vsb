// The browser backend's card edits and undo: the desktop's layout and arrange tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, changed, edgeOf, file, files, fresh, noteCard, positions, put, WORLD, zoneAt } from './browser.mjs';

const withZone = async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 500, 500));
};

test('dropping into a zone joins it and dropping outside leaves it', async () => {
	await withZone();
	const id = await api.createCard(0, 0, 200, 100);
	await api.moveCards([{ id, x: 1100, y: 50 }]);
	assert.deepEqual(await file('card', id), { note: null, zone: 'Z', x: 100, y: 50, w: 200, h: 100 });
	assert.deepEqual((await positions())[id], [1100, 50]);
	await api.moveCards([{ id, x: 300, y: 40 }]);
	assert.deepEqual(await file('card', id), { note: null, zone: null, x: 300, y: 40, w: 200, h: 100 });
});

test('applying the returned states undoes and redoes an edit', async () => {
	await withZone();
	const id = await api.createCard(0, 0, 200, 100);
	const original = await file('card', id);
	const undo = await api.moveCards([{ id, x: 1100, y: 50 }]);
	const moved = await file('card', id);
	const redo = await api.applyStates(undo);
	assert.deepEqual(await file('card', id), original);
	assert.equal((await positions())[id][0], 0, 'the index follows');
	await api.applyStates(redo);
	assert.deepEqual(await file('card', id), moved);
});

test('undoing a placement removes the card', async () => {
	await fresh();
	const id = await api.createCard(0, 0, 200, 100);
	const redo = await api.applyStates([{ kind: 'card', id, value: null }]);
	assert.equal(await file('card', id), undefined);
	assert.equal((await api.queryViewport(WORLD, 0, null)).cards.length, 0);
	await api.applyStates(redo);
	assert.equal((await api.queryViewport(WORLD, 0, null)).cards.length, 1);
});

test('deleting a card removes its edges and keeps its note', async () => {
	await fresh();
	const { card: a } = await noteCard('Kept');
	const b = await api.createCard(400, 0, 200, 100);
	await put(edgeOf('E', a, b));
	const undo = await api.deleteCards([a]);
	assert.deepEqual(Object.keys(await files()), [`cards/${b}`]);
	assert.deepEqual((await api.unplacedNotes(0, 50)).map((n) => n.title), ['Kept']);
	await api.applyStates(undo);
	assert.ok(await file('edge', 'E'));
	assert.ok((await file('card', a)).note);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 1);
	assert.equal((await api.unplacedNotes(0, 50)).length, 0);
});

test('resizing keeps the zone, from any corner', async () => {
	await withZone();
	const id = await api.createCard(1100, 100, 200, 100);
	await api.resizeCard(id, 1100, 100, 320, 180);
	assert.deepEqual(await file('card', id), { note: null, zone: 'Z', x: 100, y: 100, w: 320, h: 180 });
	// The new corner lies outside the zone; the card still belongs to it.
	await api.resizeCard(id, 950, 80, 350, 120);
	assert.deepEqual(await file('card', id), { note: null, zone: 'Z', x: -50, y: 80, w: 350, h: 120 });
	assert.deepEqual((await positions())[id], [950, 80]);
});

test('aligning writes alignment and the default drops it again', async () => {
	await fresh();
	const id = await api.createCard(0, 0, 200, 100);
	await api.alignCards([id], 'center', 'bottom');
	assert.deepEqual([(await file('card', id)).halign, (await file('card', id)).valign], ['center', 'bottom']);
	assert.equal((await api.queryViewport(WORLD, 0, null)).cards[0].halign, 'center');
	await api.alignCards([id], 'left', 'top');
	assert.deepEqual(await file('card', id), { note: null, zone: null, x: 0, y: 0, w: 200, h: 100 });
});

test('clearing an unresolved card makes it empty', async () => {
	await fresh();
	await put(cardAt('C', null, 0, 0, { note: 'GONE' }));
	await api.clearCard('C');
	const [card] = (await api.queryViewport(WORLD, 0, null)).cards;
	assert.deepEqual([card.note, card.resolved], [null, false]);
});

test('deleting both ends of an edge and undoing restores all three', async () => {
	await fresh();
	const a = await api.createCard(0, 0, 200, 100);
	const b = await api.createCard(400, 0, 200, 100);
	await put(edgeOf('E', a, b));
	const undo = await api.deleteCards([a, b]);
	assert.equal(undo.filter((u) => u.value).length, 3);
	assert.deepEqual(await files(), {});
	await api.applyStates(undo);
	assert.equal(Object.keys(await files()).length, 3);
	assert.equal((await api.queryViewport(WORLD, 0, null)).edges.length, 1);
});

test('a card and a zone take one color in one step and lose it again', async () => {
	await withZone();
	const id = await api.createCard(0, 0, 200, 100);
	const undo = await api.colorItems([id], ['Z'], '#f5d76e');
	assert.deepEqual([(await file('card', id)).color, (await file('zone', 'Z')).color], ['#f5d76e', '#f5d76e']);
	const view = await api.queryViewport(WORLD, 0, null);
	assert.deepEqual([view.cards[0].color, view.zones[0].color], ['#f5d76e', '#f5d76e']);
	await api.applyStates(undo);
	assert.ok(!('color' in (await file('card', id))) && !('color' in (await file('zone', 'Z'))));
	await api.colorItems([id], [], '#6fa8dc');
	await api.colorItems([id], [], null);
	assert.ok(!('color' in (await file('card', id))), 'no color leaves the field out again');
});

test('arranged cards stay in their zone, which grows to hold them', async () => {
	await fresh();
	await put(zoneAt('Z', null, 100, 100, 500, 400), cardAt('A', 'Z', 20, 60), cardAt('B', 'Z', 20, 200), cardAt('C', null, -400, 0));
	const before = await files();
	const undo = await api.arrangeItems(
		[
			{ id: 'A', x: 700, y: 160 },
			{ id: 'B', x: 300, y: 40 },
			{ id: 'C', x: -500, y: 20 }
		],
		[]
	);
	const z = await file('zone', 'Z');
	assert.deepEqual([z.x, z.y, z.w, z.h], [100, -20, 720, 520]);
	assert.deepEqual([(await file('card', 'A')).x, (await file('card', 'A')).y], [600, 180]);
	assert.deepEqual([(await file('card', 'B')).x, (await file('card', 'B')).y], [200, 60]);
	assert.deepEqual([(await file('card', 'C')).zone, (await file('card', 'C')).x], [null, -500]);
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
});

test('a zone arranges its cards and its inner zones as blocks', async () => {
	await fresh();
	await put(
		zoneAt('Z', null, 0, 0, 1000, 800),
		zoneAt('Y', 'Z', 500, 100, 300, 300),
		zoneAt('Y2', 'Y', 150, 150, 120, 120),
		cardAt('A', 'Z', 20, 60),
		cardAt('B', 'Z', 20, 300),
		cardAt('C', 'Y', 20, 40),
		cardAt('D', 'Y2', 10, 10),
		cardAt('X', null, -500, 0),
		edgeOf('AC', 'A', 'C'),
		edgeOf('DB', 'D', 'B'),
		edgeOf('CD', 'C', 'D'),
		edgeOf('AX', 'A', 'X')
	);
	const nodes = await api.zoneNodes('Z');
	assert.deepEqual(nodes.nodes.map((n) => [n.id, n.zone, n.x, n.y]), [['A', false, 20, 60], ['B', false, 20, 300], ['Y', true, 500, 100]]);
	assert.deepEqual(nodes.edges.map((e) => [e.from, e.to]), [[0, 2], [2, 1]]);

	const before = await files();
	const undo = await api.arrangeItems(
		[
			{ id: 'A', x: 0, y: 100 },
			{ id: 'B', x: 700, y: 100 }
		],
		[{ id: 'Y', x: 300, y: -100 }]
	);
	const [z, y] = [await file('zone', 'Z'), await file('zone', 'Y')];
	assert.deepEqual([z.x, z.y, z.w, z.h], [-20, -160, 1020, 960]);
	assert.deepEqual([y.parent, y.x, y.y], ['Z', 320, 60]);
	const after = await files();
	for (const kept of ['cards/C', 'cards/D', 'zones/Y2']) assert.deepEqual(after[kept], before[kept]);
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
	assert.deepEqual(changed(before, await files()), []);
});

test('the canvas lists its own cards and zones for making room', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 700, 260), cardAt('NAME', 'Z', 300, 60), cardAt('LOOSE', null, 900, 0));
	const { nodes } = await api.zoneNodes(null);
	assert.deepEqual(nodes.map((n) => [n.id, n.zone]), [['LOOSE', false], ['Z', true]]);
});
