// Making room for a card inserted on an edge. `makeRoom` is pure, so Node runs it straight from
// its TypeScript source, with `route` giving the edge's middle and way as the canvas draws them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRoom } from '../src/lib/canvas/room.ts';
import { route } from '../src/lib/canvas/route.ts';

const SIZE = { w: 240, h: 140 };
const GAP = 80;
const GRID = 20;
const card = (id, x, y, zone = false) => ({ id, zone, x, y, ...SIZE });
const curved = { shape: 'curved', arrow: 'to' };
/** Each move as "id x,y". */
const moved = (moves) => moves.map((m) => `${m.id} ${m.x},${m.y}`);

// Kevin's zone: Name above a row of four cards, Name joined to Space below it.
const name = card('name', 420, 60);
const rowAt = (y) => ['others', 'physics', 'space', 'french'].map((id, i) => card(id, 20 + 260 * i, y));

test('inserting between Name and Space moves the whole row down, the card a gap after Name', () => {
	const row = rowAt(260);
	const { mid, out } = route(name, row[2], curved, 1, row.filter((c) => c.id !== 'space'));
	assert.deepEqual(out, { x: 0, y: 1 });
	const { card: placed, moves } = makeRoom(mid, out, name, SIZE, [name, ...row], GAP, GRID);
	assert.deepEqual(placed, { x: 480, y: 280, ...SIZE }, 'centered across the edge, a gap below Name');
	assert.deepEqual(moved(moves), ['others 20,500', 'physics 280,500', 'space 540,500', 'french 800,500']);
	assert.equal(500 - (placed.y + placed.h), GAP, 'a gap above the row too');
});

test('with room enough, the card sits on the middle and nothing moves', () => {
	const row = rowAt(800);
	const { mid, out } = route(name, row[2], curved);
	const { card: placed, moves } = makeRoom(mid, out, name, SIZE, [name, ...row], GAP, GRID);
	assert.deepEqual(placed, { x: 480, y: 440, ...SIZE });
	assert.deepEqual(moves, []);
});

test('an edge running up moves what lies above, by whole squares', () => {
	const from = card('from', 0, 500);
	const to = card('to', 0, 200);
	const above = card('above', 0, 0);
	const beside = card('beside', 400, 550);
	const { card: placed, moves } = makeRoom({ x: 120, y: 425.5 }, { x: 0, y: -1 }, from, SIZE, [from, to, above, beside], GAP, GRID);
	assert.deepEqual(placed, { x: 0, y: 280, ...SIZE });
	assert.deepEqual(moved(moves), ['to 0,60', 'above 0,-140']);
});

test('an edge running across moves cards and inner zones to its right', () => {
	const left = card('left', 0, 0);
	const right = card('right', 300, 0);
	const zone = card('inner', 600, -50, true);
	const { mid, out } = route(left, right, curved);
	const { card: placed, moves } = makeRoom(mid, out, left, SIZE, [left, right, zone], GAP, GRID);
	assert.deepEqual(placed, { x: 320, y: 0, ...SIZE });
	assert.deepEqual(moved(moves), ['right 640,0', 'inner 940,-50']);
	assert.equal(moves[1].zone, true, 'a zone moves as one block');
});

test('without a grid, positions are whole units and moves exact', () => {
	const from = card('from', 0, 65);
	const to = card('to', 0, 260);
	const { card: placed, moves } = makeRoom({ x: 120, y: 227 }, { x: 0, y: 1 }, from, SIZE, [from, to], GAP, 0);
	assert.deepEqual(placed, { x: 0, y: 285, ...SIZE });
	assert.deepEqual(moved(moves), ['to 0,505']);
});
