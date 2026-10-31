// Lining a moved or resized card up with the cards around it. `align` is pure, so Node runs it
// straight from its TypeScript source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guides, lines, pull } from '../src/lib/canvas/align.ts';

const box = (x, y, w = 240, h = 140) => ({ x, y, w, h });

test('a box has a start, a middle and an end on each axis', () => {
	assert.deepEqual(lines(box(100, 40), 'x'), [100, 220, 340]);
	assert.deepEqual(lines(box(100, 40), 'y'), [40, 110, 180]);
});

test('the nearest shared line within reach wins, whichever lines meet', () => {
	const others = [box(0, 0), box(600, 0, 100)];
	// Its left is 7 short of the first card's right, its middle 3 past the second's left.
	assert.equal(pull(lines(box(233, 300, 740), 'x'), others, 'x', 8), -3);
	assert.equal(pull(lines(box(233, 300, 740), 'x'), others, 'x', 2), undefined);
});

test('a middle falling between two world units is pulled to a whole one', () => {
	const others = [box(0, 0, 241)];
	// Their middle is at 120.5: the card's middle lands half a unit from it.
	const by = pull([125], others, 'x', 8);
	assert.ok(Number.isInteger(by));
	assert.ok(Math.abs(125 + by - 120.5) <= 0.5);
});

test('nothing around, nothing pulls', () => {
	assert.equal(pull([0, 50, 100], [], 'x', 8), undefined);
});

test('a guide runs past the box and every card sharing its line, with dots at their ends', () => {
	// Above shares its left, below its middle, and the far card nothing.
	const moved = box(0, 300);
	const above = box(0, 0, 100);
	const below = box(60, 600, 120);
	const far = box(500, 900);
	const found = guides(moved, [above, below, far]);
	assert.deepEqual(found, [
		{ axis: 'x', at: 0, from: 0, to: 440, dots: [300, 440, 0, 140] },
		{ axis: 'x', at: 120, from: 300, to: 740, dots: [300, 440, 600, 740] }
	]);
});

test('guides across: a shared top and a shared middle', () => {
	const moved = box(0, 0, 100, 100);
	const right = box(300, 0, 100, 40);
	const further = box(600, 30, 100, 40);
	const found = guides(moved, [right, further]);
	assert.deepEqual(found, [
		{ axis: 'y', at: 0, from: 0, to: 400, dots: [0, 100, 300, 400] },
		{ axis: 'y', at: 50, from: 0, to: 700, dots: [0, 100, 600, 700] }
	]);
});

test('only the lines asked for count, as the sides pulled while resizing', () => {
	const resized = box(0, 300);
	const above = box(0, 0);
	assert.deepEqual(guides(resized, [above], { x: [240], y: [] }).map((g) => g.at), [240]);
	assert.deepEqual(guides(resized, [above], { x: [], y: [440] }), []);
});

test('lines a unit apart are not shared', () => {
	assert.deepEqual(guides(box(1, 300), [box(0, 0)]), []);
});
