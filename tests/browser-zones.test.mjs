// The browser backend's zone edits: the desktop's zones tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, changed, edgeOf, file, files, fresh, positions, put, WORLD, zoneAt } from './browser.mjs';

test('drawing a zone takes in what lies fully inside it, and undo gives it back', async () => {
	await fresh();
	await put(cardAt('IN', null, 100, 100), cardAt('EDGE', null, 380, 100), zoneAt('Q', null, 150, 200, 200, 150), cardAt('QC', 'Q', 10, 10), zoneAt('R', null, 350, 300, 200, 200));
	const [before, at] = [await files(), await positions()];
	const created = await api.createZone(50, 50, 400, 400);
	const n = created.id;
	const z = await file('zone', n);
	assert.deepEqual([z.parent, z.x, z.y], [null, 50, 50]);
	const c = await file('card', 'IN');
	assert.deepEqual([c.zone, c.x, c.y], [n, 50, 50]);
	const q = await file('zone', 'Q');
	assert.deepEqual([q.parent, q.x, q.y], [n, 100, 150], 'zones join too');
	assert.equal((await file('card', 'EDGE')).zone, null, 'partly inside stays out');
	assert.equal((await file('zone', 'R')).parent, null);
	assert.deepEqual(await positions(), { ...at, [n]: [50, 50] }, 'nothing moves on screen');
	assert.deepEqual(changed(before, await files()), ['cards/IN', 'zones/Q', `zones/${n}`].sort());
	await api.applyStates(created.undo);
	assert.deepEqual(await files(), before);
	assert.deepEqual(await positions(), at);
});

test('a zone drawn inside a zone nests there and takes in only its siblings', async () => {
	await fresh();
	await put(zoneAt('P', null, 1000, 0, 800, 800), cardAt('C1', 'P', 100, 100), zoneAt('Q', 'P', 250, 250, 300, 300), cardAt('C2', 'Q', 10, 10));
	const { id: n } = await api.createZone(1050, 50, 350, 350);
	const z = await file('zone', n);
	assert.deepEqual([z.parent, z.x, z.y], ['P', 50, 50]);
	const c1 = await file('card', 'C1');
	assert.deepEqual([c1.zone, c1.x, c1.y], [n, 50, 50]);
	assert.equal((await file('card', 'C2')).zone, 'Q');
	assert.equal((await file('zone', 'Q')).parent, 'P');
});

test('moving a zone writes one item and brings its contents and their edges along', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 600, 600), zoneAt('Z2', 'Z', 100, 100, 300, 300), cardAt('C1', 'Z', 450, 450), cardAt('C2', 'Z2', 10, 20), cardAt('D', null, 2000, 0), edgeOf('E', 'C2', 'D'));
	const before = await files();
	const undo = await api.moveZones([{ id: 'Z', x: 1000, y: 500 }]);
	assert.deepEqual(changed(before, await files()), ['zones/Z']);
	const at = await positions();
	assert.deepEqual([at.Z2, at.C1, at.C2, at.D], [[1100, 600], [1450, 950], [1110, 620], [2000, 0]]);
	const [edge] = (await api.queryViewport(WORLD, 0, null)).edges;
	assert.deepEqual(edge.ends[0], { x: 1110, y: 620, w: 100, h: 50 });
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
	assert.deepEqual((await api.queryViewport(WORLD, 0, null)).edges[0].ends[0], { x: 110, y: 120, w: 100, h: 50 });
});

test('dropping a zone inside another nests it, and dragging it out unnests it', async () => {
	await fresh();
	await put(zoneAt('A', null, 0, 0, 1000, 1000), zoneAt('B', null, 2000, 0, 200, 200), cardAt('BC', 'B', 10, 10), cardAt('LOOSE', null, 3010, 10));
	await api.moveZones([{ id: 'B', x: 100, y: 100 }]);
	const b = await file('zone', 'B');
	assert.deepEqual([b.parent, b.x, b.y], ['A', 100, 100]);
	assert.deepEqual((await positions()).BC, [110, 110]);
	// Half out of A is out; landing on a loose card does not capture it.
	await api.moveZones([{ id: 'B', x: 900, y: 0 }]);
	assert.equal((await file('zone', 'B')).parent, null);
	await api.moveZones([{ id: 'B', x: 3000, y: 0 }]);
	assert.equal((await file('card', 'LOOSE')).zone, null);
});

test('a zone never lands inside itself or another zone moving with it', async () => {
	await fresh();
	await put(zoneAt('P', null, 0, 0, 500, 500), zoneAt('K', 'P', 0, 0, 2000, 2000), zoneAt('S1', null, 5000, 0, 100, 100), zoneAt('S2', null, 6000, 0, 1000, 1000));
	await api.moveZones([{ id: 'P', x: 100, y: 100 }]);
	assert.equal((await file('zone', 'P')).parent, null);
	await api.moveZones([
		{ id: 'S1', x: 6100, y: 100 },
		{ id: 'S2', x: 9000, y: 0 }
	]);
	assert.equal((await file('zone', 'S1')).parent, null);
});

test('a zone cannot shrink past its contents, which stay in place', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 1000, 1000), cardAt('C', 'Z', 300, 300), zoneAt('K', 'Z', 600, 600, 200, 200), cardAt('KC', 'K', 150, 150));
	const [before, at] = [await files(), await positions()];
	assert.deepEqual(await api.zoneContents('Z'), { minX: 300, minY: 300, maxX: 850, maxY: 800 });
	const undo = await api.resizeZone('Z', 500, 500, 100, 100);
	const z = await file('zone', 'Z');
	assert.deepEqual([z.x, z.y, z.w, z.h], [300, 300, 550, 500]);
	assert.deepEqual([(await file('card', 'C')).x, (await file('zone', 'K')).x], [0, 300]);
	assert.deepEqual(changed(before, await files()), ['cards/C', 'zones/K', 'zones/Z']);
	assert.deepEqual(await positions(), { ...at, Z: [300, 300] });
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
	// Growing from the bottom-right corner rewrites only the zone.
	await api.resizeZone('Z', 0, 0, 1200, 1100);
	assert.deepEqual(changed(before, await files()), ['zones/Z']);
	assert.equal(await api.zoneContents('C'), null, 'a card holds nothing');
});

test('deleting a zone moves its contents up in place, and undo restores it', async () => {
	await fresh();
	await put(zoneAt('P', null, 1000, 0, 800, 800), zoneAt('Z', 'P', 100, 100, 500, 500), cardAt('C', 'Z', 10, 10), zoneAt('K', 'Z', 50, 50, 200, 200), cardAt('KC', 'K', 5, 5));
	const [before, at] = [await files(), await positions()];
	const undo = await api.deleteZones(['Z']);
	assert.equal(await file('zone', 'Z'), undefined);
	const c = await file('card', 'C');
	assert.deepEqual([c.zone, c.x, c.y], ['P', 110, 110]);
	const k = await file('zone', 'K');
	assert.deepEqual([k.parent, k.x, k.y], ['P', 150, 150]);
	assert.deepEqual(changed(before, await files()), ['cards/C', 'zones/K', 'zones/Z']);
	delete at.Z;
	assert.deepEqual(await positions(), at);
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
});

test('deleting nested zones together moves contents to the nearest zone left', async () => {
	await fresh();
	await put(zoneAt('P', null, 1000, 0, 800, 800), zoneAt('Z1', 'P', 100, 100, 500, 500), zoneAt('Z2', 'Z1', 50, 50, 300, 300), cardAt('C', 'Z2', 10, 10));
	const before = await files();
	const undo = await api.deleteZones(['Z2', 'Z1']);
	const c = await file('card', 'C');
	assert.deepEqual([c.zone, c.x, c.y], ['P', 160, 160]);
	assert.deepEqual((await positions()).C, [1160, 160]);
	// Parents first, so the undo writes Z1 before Z2, which points at it.
	assert.deepEqual(undo.map((u) => u.id), ['Z1', 'Z2', 'C']);
	await api.applyStates(undo);
	assert.deepEqual(await files(), before);
});

test('renaming and recoloring a zone', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 400, 400));
	const undo = await api.renameZone('Z', 'Pricing');
	await api.colorItems([], ['Z'], '#f5d76e');
	const [zone] = (await api.queryViewport(WORLD, 0, null)).zones;
	assert.deepEqual([zone.name, zone.color], ['Pricing', '#f5d76e']);
	await api.colorItems([], ['Z'], null);
	assert.ok(!('color' in (await file('zone', 'Z'))), 'the default color is left out');
	await api.applyStates(undo);
	assert.equal((await file('zone', 'Z')).name, 'Z');
});

test('the canvas contents cover every zone and card', async () => {
	await fresh();
	assert.equal(await api.canvasContents(), null);
	await put(zoneAt('Z', null, 1000, -200, 400, 300), zoneAt('K', 'Z', 350, 0, 200, 100), cardAt('C', null, -50, 40), cardAt('KC', 'K', 10, 250));
	// K overhangs Z to the right, and KC hangs below K.
	assert.deepEqual(await api.canvasContents(), { minX: -50, minY: -200, maxX: 1550, maxY: 100 });
	await api.deleteCards(['C', 'KC']);
	assert.deepEqual(await api.canvasContents(), { minX: 1000, minY: -200, maxX: 1550, maxY: 100 });
});

test('a card or zone frames by its box in the world', async () => {
	await fresh();
	await put(zoneAt('Z1', null, 1000, 0, 800, 600), zoneAt('Z2', 'Z1', 100, 100, 400, 300), cardAt('C', 'Z2', 10, 20));
	assert.deepEqual(await api.itemBox('card', 'C'), { minX: 1110, minY: 120, maxX: 1210, maxY: 170 });
	assert.deepEqual(await api.itemBox('zone', 'Z2'), { minX: 1100, minY: 100, maxX: 1500, maxY: 400 });
	assert.equal(await api.itemBox('card', 'NONE'), null);
	assert.equal(await api.itemBox('zone', 'NONE'), null);
});
