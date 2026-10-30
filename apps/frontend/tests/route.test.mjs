// How curved and angled edges pick their sides around other cards. `route` is pure, so Node runs
// it straight from its TypeScript source, without the app.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { route } from '../src/lib/canvas/route.ts';

const card = (x, y) => ({ x, y, w: 240, h: 140 });
const curved = { shape: 'curved', arrow: 'to' };
const angled = { shape: 'angled', arrow: 'to' };

// A zone holding Name above a row of four cards, each joined from Name.
const name = card(380, 0);
const [others, physics, space, french] = [0, 260, 520, 780].map((x) => card(x, 200));
const row = [others, physics, space, french];
/** Every card but the edge's own two. */
const around = (...ends) => [name, ...row].filter((c) => !ends.includes(c));
/** Where a route's line starts, as "x,y". */
const start = (r) => r.path.slice(1).split(/[ CL]/)[0];

test('a line that would run through a card takes the other pair of sides', () => {
	// Left of Name to right of Others, behind Physics; right of Name to left of French, behind Space.
	assert.equal(start(route(name, others, curved)), '380,70');
	assert.equal(start(route(name, french, curved)), '620,70');
	// Bottom of Name to top of Others, through the gap between the rows.
	for (const to of [others, french]) {
		const r = route(name, to, curved, 1, around(name, to));
		assert.equal(start(r), '500,140');
		assert.ok(r.mid.y > 140 && r.mid.y < 200, `the middle of ${r.path} lies between the rows`);
	}
	assert.equal(start(route(name, others, angled, 1, around(name, others))), '500,140', 'angled lines too');
});

test('a line that misses every card keeps the sides facing each other', () => {
	assert.deepEqual(route(name, physics, curved, 1, around(name, physics)), route(name, physics, curved));
	assert.deepEqual(route(name, others, curved, 1, []), route(name, others, curved));
	const far = [card(5000, 5000)];
	assert.deepEqual(route(name, others, curved, 1, far), route(name, others, curved));
});

test('when neither pair of sides clears, the line keeps the first', () => {
	const a = card(0, 0);
	const b = card(600, 400);
	const wall = { x: 300, y: -1000, w: 100, h: 3000 };
	assert.deepEqual(route(a, b, curved, 1, [wall]), route(a, b, curved));
	assert.deepEqual(route(a, b, angled, 1, [wall]), route(a, b, angled));
});

test('straight lines stay between the centers', () => {
	const straight = { shape: 'straight', arrow: 'to' };
	assert.deepEqual(route(name, others, straight, 1, around(name, others)), route(name, others, straight));
});
