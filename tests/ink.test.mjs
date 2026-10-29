// How strokes of the pen are drawn and touched. `ink` is pure, so Node runs it straight from its
// TypeScript source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lines, outline, simulated, touches } from '../src/lib/canvas/ink.ts';

const stroke = [0, 0, 0.5, 100, 0, 0.5, 100, 100, 0.5];

test('the eraser touches a stroke it passes within its radius of, crossing it or not', () => {
	assert.ok(touches(stroke, 0, 0, { x: 50, y: -50 }, { x: 50, y: 50 }, 2), 'a fast swipe across a side, no point near');
	assert.ok(touches(stroke, 0, 0, { x: 50, y: 6 }, { x: 50, y: 6 }, 8), 'resting 6 units off, radius 8');
	assert.ok(!touches(stroke, 0, 0, { x: 50, y: 10 }, { x: 50, y: 10 }, 8));
	assert.ok(!touches(stroke, 0, 0, { x: 50, y: 50 }, { x: 60, y: 60 }, 8), 'inside the bend, clear of both sides');
	assert.ok(touches(stroke, 1000, 0, { x: 1100, y: 50 }, { x: 1100, y: 50 }, 1), 'offset to its drawing');
	assert.ok(touches([5, 5, 0.5], 0, 0, { x: 0, y: 0 }, { x: 10, y: 0 }, 5), 'a dot');
});

test('a mouse draws thicker slow than fast', () => {
	let slow = 0.5;
	let fast = 0.5;
	for (let i = 0; i < 20; i++) [slow, fast] = [simulated(slow, 2), simulated(fast, 40)];
	assert.ok(slow > 0.5 && fast < 0.5, `${slow} ${fast}`);
	assert.equal(simulated(0.5, 0), 0.5, 'still, it keeps its pressure');
});

test('a stroke is drawn as a closed outline, and a preview as plain lines', () => {
	const d = outline(stroke, 10, 20);
	assert.match(d, /^M[\d.]+ [\d.]+Q.*Z$/);
	assert.equal(outline([]), '');
	assert.equal(lines([{ x: 10, y: 20, strokes: [stroke, [5, 5, 1]] }]), 'M10 20L110 20L110 120M15 25l0 0');
});
