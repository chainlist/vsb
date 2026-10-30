// The browser backend's previews of collapsed zones: the desktop's previews tests, and the upgrade
// that gives a version 1 vault's zones the cards they hold.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../src/lib/platform/browser/db.ts';
import { request } from '../src/lib/platform/browser/idb.ts';
import { api, cardAt, fresh, put, WORLD, zoneAt } from './browser.mjs';

/** Each preview as [zone, cards by color with "stock" for none, inner zones], boxes as [x, y, w, h]. */
const previews = (v) =>
	v.previews.map((p) => [p.zone, p.cards.map((t) => [t.color ?? 'stock', t.boxes.map((f) => [f.x, f.y, f.w, f.h])]), p.zones.map((f) => [f.x, f.y, f.w, f.h])]);

/** Z1 holds A (yellow) and B, an inner zone Z1a holding C (blue), and in it Z1b holding D. Z2 is
 * empty; L is loose. */
async function nested() {
	await fresh();
	await put(
		zoneAt('Z1', null, 1000, 0, 1000, 1000),
		zoneAt('Z1a', 'Z1', 100, 500, 400, 300),
		zoneAt('Z1b', 'Z1a', 10, 100, 200, 150),
		zoneAt('Z2', null, 3000, 0, 500, 500),
		cardAt('A', 'Z1', 50, 60, { color: '#f5d76e' }),
		cardAt('B', 'Z1', 300, 60),
		cardAt('C', 'Z1a', 20, 20, { color: '#6fa8dc' }),
		cardAt('D', 'Z1b', 5, 5),
		cardAt('L', null, -500, 0)
	);
}

test('a collapsed zone previews its cards by color and its inner zones, at any depth', async () => {
	await nested();
	const stock = ['stock', [[300, 60, 100, 50], [115, 605, 100, 50]]];
	const blue = ['#6fa8dc', [[120, 520, 100, 50]]];
	const yellow = ['#f5d76e', [[50, 60, 100, 50]]];
	const inner = [[100, 500, 400, 300], [110, 600, 200, 150]];
	assert.deepEqual(previews(await api.queryViewport(WORLD, 0, 1024)), [['Z1', [stock, blue, yellow], inner]], 'an empty zone has none; loose cards are clusters');
	assert.deepEqual((await api.queryViewport(WORLD, 0, null)).previews, [], 'open zones show their cards themselves');
});

test('a preview holds what meets the area and is large enough', async () => {
	await nested();
	const corner = { minX: 1000, minY: 0, maxX: 1250, maxY: 200 };
	assert.deepEqual(previews(await api.queryViewport(corner, 0, 1024)), [['Z1', [['#f5d76e', [[50, 60, 100, 50]]]], []]]);
	// Far out, cards smaller than a few pixels on screen are left out, bigger zones stay.
	assert.deepEqual(previews(await api.queryViewport(WORLD, 120, 4096)), [['Z1', [], [[100, 500, 400, 300], [110, 600, 200, 150]]]]);
});

test('a preview moves with its zone and follows its cards', async () => {
	await nested();
	const before = previews(await api.queryViewport(WORLD, 0, 1024));
	await api.moveZones([{ id: 'Z1', x: 5000, y: 2000 }]);
	assert.deepEqual(previews(await api.queryViewport(WORLD, 0, 1024)), before, "in the zone's coordinates");
	// A card moved out of the zone leaves its preview; one moved within it moves in it.
	await api.moveCards([
		{ id: 'A', x: 0, y: 0 },
		{ id: 'B', x: 5100, y: 2100 }
	]);
	const [[, cards]] = previews(await api.queryViewport(WORLD, 0, 1024));
	assert.deepEqual(cards, [['stock', [[100, 100, 100, 50], [115, 605, 100, 50]]], ['#6fa8dc', [[120, 520, 100, 50]]]]);
	// The zone list and framing count from the same cards.
	assert.equal((await api.zoneRows(null, 0, 50)).find((z) => z.id === 'Z1').cards, 3);
	assert.deepEqual(await api.zoneContents('Z1'), { minX: 5100, minY: 2100, maxX: 5500, maxY: 2800 });
});

test("opening a version 1 vault gives each zone the cards it holds", async () => {
	const name = 'vsb-OLD';
	// A version 1 database: zones kept how many cards they held, and the box around them.
	const old = indexedDB.open(name, 1);
	old.onupgradeneeded = () => {
		old.result.createObjectStore('zones', { keyPath: 'id' });
		old.result.createObjectStore('cards', { keyPath: 'id' }).createIndex('zk', 'zk');
	};
	const v1 = await request(old);
	const tx = v1.transaction(['zones', 'cards'], 'readwrite');
	tx.objectStore('zones').put({ id: 'Z', file: { name: 'Z', parent: null, x: 0, y: 0, w: 500, h: 500 }, own: 2, cbox: [10, 10, 220, 160] });
	tx.objectStore('cards').put({ id: 'A', zk: 'Z', file: { note: null, zone: 'Z', x: 10, y: 10, w: 100, h: 50 } });
	tx.objectStore('cards').put({ id: 'B', zk: 'Z', file: { note: null, zone: 'Z', x: 120, y: 110, w: 100, h: 50, color: '#6fa8dc' } });
	tx.objectStore('cards').put({ id: 'L', zk: '', file: { note: null, zone: null, x: 900, y: 0, w: 100, h: 50 } });
	await new Promise((resolve) => (tx.oncomplete = resolve));
	v1.close();
	const v2 = await openDb('OLD');
	const zone = await request(v2.transaction('zones').objectStore('zones').get('Z'));
	v2.close();
	assert.deepEqual(zone, { id: 'Z', file: { name: 'Z', parent: null, x: 0, y: 0, w: 500, h: 500 }, held: { A: [10, 10, 100, 50, null], B: [120, 110, 100, 50, '#6fa8dc'] } });
});
