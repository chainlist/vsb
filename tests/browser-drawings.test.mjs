// The browser backend's drawings: the desktop's drawings tests. Strokes grouped by where they start,
// erased, moved, recolored and deleted, kept in zones as cards are, and found by the viewport query.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, edgeOf, file, files, fresh, put, WORLD, zoneAt } from './browser.mjs';

/** Points as world x, y and pressure 0.5, from [x, y] pairs. */
const stroke = (points) => points.flatMap(([x, y]) => [x, y, 0.5]);

const drawn = async (points) => (await api.addStroke(stroke(points))).id;

const drawingAt = (id, zone, x, y, w, h, strokes, extra = {}) => ({ kind: 'drawing', id, value: { zone, x, y, w, h, strokes, ...extra } });

test('a stroke starts a drawing, its points rounded from its corner', async () => {
	await fresh();
	const { id } = await api.addStroke([10.04, 20.06, 0.333, 30, 5, 0.7, 50, 25, 1.4]);
	// The box holds the ink, 1.5 past the points.
	const strokes = [[1.5, 16.6, 0.33, 21.5, 1.5, 0.7, 41.5, 21.5, 1]];
	assert.deepEqual(await file('drawing', id), { zone: null, x: 8.5, y: 3.5, w: 43, h: 23, strokes });
	await assert.rejects(api.addStroke([1, 2]), /points of x, y and pressure/);
});

test('a stroke starting near a drawing joins the nearest and grows its box', async () => {
	await fresh();
	const a = await drawn([[0, 0], [100, 0]]);
	const b = await drawn([[160, 0], [200, 0]]);
	assert.notEqual(a, b, '58.5 units off is too far');
	assert.equal(await drawn([[125, 5], [125, 20]]), a, "24 units from A's box, 34 from B's");
	const undo = await api.addStroke(stroke([[-20, -20], [10, 10]]));
	assert.equal(undo.id, a, "26 units from A's corner");
	const strokes = [[21.5, 21.5, 0.5, 121.5, 21.5, 0.5], [146.5, 26.5, 0.5, 146.5, 41.5, 0.5], [1.5, 1.5, 0.5, 31.5, 31.5, 0.5]];
	assert.deepEqual(await file('drawing', a), { zone: null, x: -21.5, y: -21.5, w: 148, h: 43, strokes }, 'grown left and up');
	await api.applyStates(undo.undo);
	assert.equal((await file('drawing', a)).x, -1.5, 'one undo step per stroke');
	assert.equal(Object.keys(await files()).length, 2);
});

test('a new drawing joins the innermost zone under its start', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 1000, 1000), zoneAt('Z1', 'Z', 100, 100, 400, 400));
	const id = await drawn([[150, 150], [700, 700]]);
	const { zone, x, y, w } = await file('drawing', id);
	assert.deepEqual([zone, x, y, w], ['Z1', 48.5, 48.5, 553]);
	// Strokes added later leave it in its zone, wherever they reach.
	await drawn([[160, 120], [2000, 120]]);
	assert.equal((await file('drawing', id)).zone, 'Z1');
});

test('erasing shrinks drawings and deletes those left empty, in one step', async () => {
	await fresh();
	const a = await drawn([[0, 0], [100, 0]]);
	await drawn([[-20, -20], [10, 10]]);
	const b = await drawn([[500, 0], [600, 50]]);
	const before = await files();
	const undo = await api.eraseStrokes([{ id: a, strokes: [1] }, { id: b, strokes: [0] }]);
	assert.deepEqual(await file('drawing', a), { zone: null, x: -1.5, y: -1.5, w: 103, h: 3, strokes: [[1.5, 1.5, 0.5, 101.5, 1.5, 0.5]] });
	assert.equal(await file('drawing', b), undefined, 'a drawing with no strokes left is deleted');
	assert.ok((await api.queryViewport(WORLD, 0, null)).drawings.every((d) => d.id !== b));
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
});

test('a moved drawing joins the zone under its center', async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 500, 500));
	const id = await drawn([[0, 0], [100, 50]]);
	await api.moveDrawings([{ id, x: 1300, y: 100 }]);
	const { zone, x, y } = await file('drawing', id);
	assert.deepEqual([zone, x, y], ['Z', 300, 100]);
	// Its center past the zone's side: back on the canvas.
	await api.moveDrawings([{ id, x: 1460, y: 100 }]);
	assert.equal((await file('drawing', id)).zone, null);
});

test('zones take in, hold and hand back their drawings, as cards', async () => {
	await fresh();
	const id = await drawn([[100, 100], [200, 150]]);
	const box = { minX: 98.5, minY: 98.5, maxX: 201.5, maxY: 151.5 };
	assert.deepEqual(await api.canvasContents(), box, 'fit frames it');
	const zone = (await api.createZone(50, 50, 300, 300)).id;
	let f = await file('drawing', id);
	assert.deepEqual([f.zone, f.x, f.y], [zone, 48.5, 48.5], 'taken in, in place');
	assert.deepEqual(await api.zoneContents(zone), box);
	await api.resizeZone(zone, 150, 120, 20, 20);
	assert.deepEqual(await api.itemBox('zone', zone), box, 'never smaller than its drawing');
	assert.equal((await file('drawing', id)).x, 0, 'its corner moved: the drawing stays in place');
	assert.equal((await api.zoneNodes(zone)).drawings.length, 1);
	await api.deleteZones([zone]);
	f = await file('drawing', id);
	assert.deepEqual([f.zone, f.x, f.y], [null, 98.5, 98.5], 'handed back in place');
});

test('the viewport brings drawings, and zoomed out the loose ones and previews', async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 1000, 1000));
	const inside = await drawn([[1100, 100], [1300, 200]]);
	const loose = await drawn([[-500, 0], [-300, 100]]);
	await api.colorItems([], [], [inside], '#f5d76e');
	const strokes = [[1.5, 1.5, 0.5, 201.5, 101.5, 0.5]];
	const open = await api.queryViewport(WORLD, 0, null);
	const shown = open.drawings.map((d) => [d.id, d.x, d.y, d.color, d.strokes]).sort((a, b) => a[1] - b[1]);
	assert.deepEqual(shown, [[loose, -501.5, -1.5, null, strokes], [inside, 1098.5, 98.5, '#f5d76e', strokes]]);
	assert.deepEqual((await api.queryViewport(WORLD, 300, null)).drawings, [], 'smaller than the least size');

	const zoomed = await api.queryViewport(WORLD, 0, 1024);
	assert.deepEqual(zoomed.drawings.map((d) => d.id), [loose], 'loose ones only');
	assert.deepEqual(zoomed.clusters, [], 'never counted in clusters');
	assert.deepEqual(zoomed.previews, [{ zone: 'Z', cards: [], zones: [], inks: [{ color: '#f5d76e', drawings: [{ x: 98.5, y: 98.5, strokes }] }] }]);
});

test('recoloring, deleting and inserting a card reach drawings', async () => {
	await fresh();
	const id = await drawn([[0, 0], [100, 50]]);
	await api.colorItems([], [], [id], '#6fa8dc');
	assert.equal((await file('drawing', id)).color, '#6fa8dc');
	await api.colorItems([], [], [id], null);
	assert.ok(!('color' in (await file('drawing', id))), 'back to the ink, left out');

	await put(cardAt('A', null, -400, 0), cardAt('B', null, -200, 0), edgeOf('E', 'A', 'B'));
	await api.insertCard('E', null, { minX: -200, minY: 0, maxX: -100, maxY: 50 }, [{ id: 'B', x: 0, y: 0 }], [], [{ id, x: 200, y: 0 }]);
	assert.equal((await file('drawing', id)).x, 200, 'moved along to make room');

	const undo = await api.deleteDrawings([id]);
	assert.equal(await file('drawing', id), undefined);
	await api.applyStates(undo);
	assert.equal((await file('drawing', id)).x, 200);
});

test('drawings are read as their files, defaults left out', async () => {
	await fresh();
	await put(drawingAt('D', null, 10, 10, 20, 0, [[0, 0, 0.5, 20, 0, 0.5]], { color: null }));
	assert.deepEqual(await file('drawing', 'D'), { zone: null, x: 10, y: 10, w: 20, h: 0, strokes: [[0, 0, 0.5, 20, 0, 0.5]] });
	assert.equal((await api.queryViewport(WORLD, 0, null)).drawings.length, 1);
	await assert.rejects(put(drawingAt('X', null, 0, 0, 0, 0, [['a']])), /strokes/);
});
