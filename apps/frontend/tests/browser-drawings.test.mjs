// The browser backend's drawings: the desktop's drawings tests. Strokes grouped by where they start,
// each in its own color and width, erased whole or cut, moved, recolored and deleted, kept in zones
// as cards are, and found by the viewport query; the pen as this device keeps it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../src/lib/platform/browser/db.ts';
import { request } from '../src/lib/platform/browser/idb.ts';
import { api, cardAt, edgeOf, file, files, fresh, put, WORLD, zoneAt } from './browser.mjs';

const YELLOW = '#f5d76e';
const MEDIUM = 3;

/** Points as world x, y and pressure 0.5, from [x, y] pairs. */
const stroke = (points) => points.flatMap(([x, y]) => [x, y, 0.5]);

/** A stroke in the ink, at medium width. */
const drawn = async (points) => (await api.addStroke(stroke(points), null, MEDIUM)).id;

const erase = (id, cuts) => ({ id, strokes: cuts.map(([index, pieces]) => ({ index, pieces })) });

const drawingAt = (id, zone, x, y, w, h, strokes, extra = {}) => ({ kind: 'drawing', id, value: { zone, x, y, w, h, strokes, ...extra } });

test('a stroke starts a drawing, its points rounded from its corner', async () => {
	await fresh();
	const { id } = await api.addStroke([10.04, 20.06, 0.333, 30, 5, 0.7, 50, 25, 1.4], null, MEDIUM);
	// The box holds the ink, half the medium width past the points.
	const strokes = [{ points: [1.5, 16.6, 0.33, 21.5, 1.5, 0.7, 41.5, 21.5, 1] }];
	assert.deepEqual(await file('drawing', id), { zone: null, x: 8.5, y: 3.5, w: 43, h: 23, strokes }, 'ink and medium left out');
	await assert.rejects(api.addStroke([1, 2], null, MEDIUM), /points of x, y and pressure/);
	await assert.rejects(api.addStroke([1, 2, 0.5], null, 0), /a stroke has a width/);
});

test('a stroke starting near a drawing joins the nearest and grows its box', async () => {
	await fresh();
	const a = await drawn([[0, 0], [100, 0]]);
	const b = await drawn([[160, 0], [200, 0]]);
	assert.notEqual(a, b, '58.5 units off is too far');
	assert.equal(await drawn([[125, 5], [125, 20]]), a, "24 units from A's box, 34 from B's");
	const undo = await api.addStroke(stroke([[-20, -20], [10, 10]]), null, MEDIUM);
	assert.equal(undo.id, a, "26 units from A's corner");
	const strokes = [{ points: [21.5, 21.5, 0.5, 121.5, 21.5, 0.5] }, { points: [146.5, 26.5, 0.5, 146.5, 41.5, 0.5] }, { points: [1.5, 1.5, 0.5, 31.5, 31.5, 0.5] }];
	assert.deepEqual(await file('drawing', a), { zone: null, x: -21.5, y: -21.5, w: 148, h: 43, strokes }, 'grown left and up');
	await api.applyStates(undo.undo);
	assert.equal((await file('drawing', a)).x, -1.5, 'one undo step per stroke');
	assert.equal(Object.keys(await files()).length, 2);
});

test('strokes of other colors and widths join a drawing, each keeping its own', async () => {
	await fresh();
	const a = await drawn([[0, 0], [100, 0]]);
	assert.equal((await api.addStroke(stroke([[110, 0], [150, 0]]), YELLOW, 8)).id, a);
	// The thick stroke's ink reaches 4 past its points.
	const strokes = [{ points: [1.5, 4, 0.5, 101.5, 4, 0.5] }, { points: [111.5, 4, 0.5, 151.5, 4, 0.5], color: YELLOW, width: 8 }];
	assert.deepEqual(await file('drawing', a), { zone: null, x: -1.5, y: -4, w: 155.5, h: 8, strokes });
	// Recoloring paints every stroke; no color takes them all back to the ink.
	await api.colorItems([], [], [a], '#6fa8dc');
	assert.deepEqual((await file('drawing', a)).strokes.map((s) => s.color), ['#6fa8dc', '#6fa8dc']);
	await api.colorItems([], [], [a], null);
	const after = await file('drawing', a);
	assert.ok(after.strokes.every((s) => !('color' in s)));
	assert.equal(after.strokes[1].width, 8, 'each keeps its width');
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

test('erasing whole strokes shrinks drawings and deletes those left empty, in one step', async () => {
	await fresh();
	const a = await drawn([[0, 0], [100, 0]]);
	await drawn([[-20, -20], [10, 10]]);
	const b = await drawn([[500, 0], [600, 50]]);
	const before = await files();
	const undo = await api.eraseStrokes([erase(a, [[1, []]]), erase(b, [[0, []]])]);
	assert.deepEqual(await file('drawing', a), { zone: null, x: -1.5, y: -1.5, w: 103, h: 3, strokes: [{ points: [1.5, 1.5, 0.5, 101.5, 1.5, 0.5] }] });
	assert.equal(await file('drawing', b), undefined, 'a drawing with no strokes left is deleted');
	assert.ok((await api.queryViewport(WORLD, 0, null)).drawings.every((d) => d.id !== b));
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
});

test('cutting leaves the pieces of a stroke, in its color and width', async () => {
	await fresh();
	const { id } = await api.addStroke(stroke([[0, 0], [50, 0], [100, 0]]), YELLOW, 8);
	assert.deepEqual((await file('drawing', id)).strokes[0].points, [4, 4, 0.5, 54, 4, 0.5, 104, 4, 0.5]);
	// Cut through its middle: two strokes, the drawing's box the same.
	const undo = await api.eraseStrokes([erase(id, [[0, [[4, 4, 0.5, 44.04, 4, 0.504], [64, 4, 0.5, 104, 4, 0.5]]]])]);
	const piece = (points) => ({ points, color: YELLOW, width: 8 });
	const strokes = [piece([4, 4, 0.5, 44, 4, 0.5]), piece([64, 4, 0.5, 104, 4, 0.5])];
	assert.deepEqual(await file('drawing', id), { zone: null, x: -4, y: -4, w: 108, h: 8, strokes });
	await api.applyStates(undo);
	// Cut off its left part: the box shrinks to what is left.
	await api.eraseStrokes([erase(id, [[0, [[64, 4, 0.5, 104, 4, 0.5]]]])]);
	const after = await file('drawing', id);
	assert.deepEqual([after.x, after.w, after.strokes[0].points], [56, 48, [4, 4, 0.5, 44, 4, 0.5]]);
	await assert.rejects(api.eraseStrokes([erase(id, [[0, [[1]]]])]), /points of x, y and pressure/, 'pieces are points too');
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

test('the viewport brings drawings, and zoomed out the loose ones and previews by color', async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 1000, 1000));
	const inside = await drawn([[1100, 100], [1300, 200]]);
	const loose = await drawn([[-500, 0], [-300, 100]]);
	await api.colorItems([], [], [inside], YELLOW);
	await drawn([[1310, 210], [1320, 230]]);
	const first = [1.5, 1.5, 0.5, 201.5, 101.5, 0.5];
	const second = [211.5, 111.5, 0.5, 221.5, 131.5, 0.5];
	const open = await api.queryViewport(WORLD, 0, null);
	const shown = open.drawings.map((d) => [d.id, d.x, d.y, d.strokes]).sort((a, b) => a[1] - b[1]);
	assert.deepEqual(shown, [
		[loose, -501.5, -1.5, [{ points: first }]],
		[inside, 1098.5, 98.5, [{ points: first, color: YELLOW }, { points: second }]]
	]);
	assert.deepEqual((await api.queryViewport(WORLD, 300, null)).drawings, [], 'smaller than the least size');

	const zoomed = await api.queryViewport(WORLD, 0, 1024);
	assert.deepEqual(zoomed.drawings.map((d) => d.id), [loose], 'loose ones only');
	assert.deepEqual(zoomed.clusters, [], 'never counted in clusters');
	const sketch = (strokes) => [{ x: 98.5, y: 98.5, strokes: [strokes] }];
	assert.deepEqual(zoomed.previews[0].inks, [{ color: null, drawings: sketch(second) }, { color: YELLOW, drawings: sketch(first) }], 'its strokes by color');
});

test('deleting and inserting a card reach drawings', async () => {
	await fresh();
	const id = await drawn([[0, 0], [100, 50]]);
	await put(cardAt('A', null, -400, 0), cardAt('B', null, -200, 0), edgeOf('E', 'A', 'B'));
	await api.insertCard('E', null, { minX: -200, minY: 0, maxX: -100, maxY: 50 }, [{ id: 'B', x: 0, y: 0 }], [], [{ id, x: 200, y: 0 }]);
	assert.equal((await file('drawing', id)).x, 200, 'moved along to make room');
	const undo = await api.deleteDrawings([id]);
	assert.equal(await file('drawing', id), undefined);
	await api.applyStates(undo);
	assert.equal((await file('drawing', id)).x, 200);
});

test('drawings written before strokes had colors keep their look', async () => {
	await fresh();
	await put(drawingAt('D', null, 10, 10, 20, 0, [[0, 0, 0.5, 20, 0, 0.5]], { color: '#e98a9b' }));
	assert.deepEqual((await file('drawing', 'D')).strokes, [{ points: [0, 0, 0.5, 20, 0, 0.5], color: '#e98a9b' }], 'read in the new shape');
	assert.deepEqual((await api.queryViewport(WORLD, 0, null)).drawings[0].strokes, [{ points: [0, 0, 0.5, 20, 0, 0.5], color: '#e98a9b' }]);
	await assert.rejects(put(drawingAt('X', null, 0, 0, 0, 0, [['a']])), /strokes/);
});

test('opening a version 3 vault gives each stroke its drawing\'s color', async () => {
	const name = 'vsb-INK';
	const old = indexedDB.open(name, 3);
	old.onupgradeneeded = () => old.result.createObjectStore('drawings', { keyPath: 'id' });
	const v3 = await request(old);
	const tx = v3.transaction('drawings', 'readwrite');
	const legacy = { zone: null, x: 0, y: 0, w: 20, h: 0, color: YELLOW, strokes: [[0, 0, 0.5, 20, 0, 0.5]] };
	tx.objectStore('drawings').put({ id: 'D', file: legacy, zk: '', ax: 0, ay: 0, root: '', g: [[0, 0, 0]] });
	await new Promise((resolve) => (tx.oncomplete = resolve));
	v3.close();
	const v4 = await openDb('INK');
	const record = await request(v4.transaction('drawings').objectStore('drawings').get('D'));
	v4.close();
	assert.deepEqual(record.file, { zone: null, x: 0, y: 0, w: 20, h: 0, strokes: [{ points: [0, 0, 0.5, 20, 0, 0.5], color: YELLOW }] });
});

test('the pen is kept per device, each part left out at its default', async () => {
	const ink = { color: null, width: MEDIUM, eraser: 'stroke' };
	assert.deepEqual(await api.devicePen(), ink, 'the ink, medium, the stroke eraser');
	const device = () => JSON.parse(localStorage.getItem('vsb:device'));
	await api.setDevicePen({ color: YELLOW, width: 8, eraser: 'cut' });
	assert.deepEqual(await api.devicePen(), { color: YELLOW, width: 8, eraser: 'cut' });
	assert.deepEqual(device().pen, { color: YELLOW, width: 8, eraser: 'cut' });
	await api.setDevicePen({ ...ink, width: 1.5 });
	assert.deepEqual(device().pen, { width: 1.5 });
	await api.setDevicePen(ink);
	assert.equal('pen' in device(), false);
});
