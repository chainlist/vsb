// How strokes of the pen are drawn, touched and cut. `ink` is pure, so Node runs it straight from its
// TypeScript source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cut, lines, outline, simulated, touches } from '../src/lib/canvas/ink.ts';

const stroke = [0, 0, 0.5, 100, 0, 0.5, 100, 100, 0.5];
const xs = (points) => points.filter((_, i) => i % 3 === 0);

test('the eraser touches a stroke it passes within its radius of, crossing it or not', () => {
	assert.ok(touches(stroke, 0, 0, { x: 50, y: -50 }, { x: 50, y: 50 }, 2), 'a fast swipe across a side, no point near');
	assert.ok(touches(stroke, 0, 0, { x: 50, y: 6 }, { x: 50, y: 6 }, 8), 'resting 6 units off, radius 8');
	assert.ok(!touches(stroke, 0, 0, { x: 50, y: 10 }, { x: 50, y: 10 }, 8));
	assert.ok(!touches(stroke, 0, 0, { x: 50, y: 50 }, { x: 60, y: 60 }, 8), 'inside the bend, clear of both sides');
	assert.ok(touches(stroke, 1000, 0, { x: 1100, y: 50 }, { x: 1100, y: 50 }, 1), 'offset to its drawing');
	assert.ok(touches([5, 5, 0.5], 0, 0, { x: 0, y: 0 }, { x: 10, y: 0 }, 5), 'a dot');
});

test('the cutting eraser leaves the pieces on either side of where it passed', () => {
	const line = [0, 0, 0.5, 100, 0, 0.5];
	const pieces = cut(line, 0, 0, { x: 50, y: 0 }, { x: 50, y: 0 }, 6);
	assert.equal(pieces.length, 2);
	// Cut finely, every half radius or less: the gap is where the eraser was, within half a radius,
	// not at the line's ends.
	const [left, right] = [xs(pieces[0]), xs(pieces[1])];
	assert.deepEqual([left.at(0), right.at(-1)], [0, 100]);
	assert.ok(left.at(-1) > 41 && left.at(-1) < 44 && right.at(0) > 56 && right.at(0) < 59, `${left.at(-1)} ${right.at(0)}`);
	assert.ok(pieces.flat().filter((_, i) => i % 3 === 2).every((p) => p === 0.5), 'pressure follows');
	assert.equal(cut(line, 0, 0, { x: 50, y: 20 }, { x: 60, y: 20 }, 5), null, 'not touched');
	assert.deepEqual(cut(line, 1000, 0, { x: 1100, y: 0 }, { x: 1100, y: 0 }, 5).map((p) => xs(p).at(0)), [0], 'offset to its drawing; its end cut off');
	assert.deepEqual(cut([5, 5, 0.5], 0, 0, { x: 0, y: 5 }, { x: 10, y: 5 }, 2), [], 'a dot goes whole');
	assert.deepEqual(cut(line, 0, 0, { x: -10, y: 1 }, { x: 110, y: 1 }, 3), [], 'swept along it, all of it goes');
});

test('a mouse draws thicker slow than fast', () => {
	let slow = 0.5;
	let fast = 0.5;
	for (let i = 0; i < 20; i++) [slow, fast] = [simulated(slow, 2), simulated(fast, 40)];
	assert.ok(slow > 0.5 && fast < 0.5, `${slow} ${fast}`);
	assert.equal(simulated(0.5, 0), 0.5, 'still, it keeps its pressure');
});

test('a stroke is drawn as a closed outline at its width, and a preview as plain lines', () => {
	const span = (d) => {
		const ys = [...d.matchAll(/[MQ ]?(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
		return Math.max(...ys) - Math.min(...ys);
	};
	const thin = outline([0, 0, 0.5, 100, 0, 0.5], 1.5);
	const thick = outline([0, 0, 0.5, 100, 0, 0.5], 8);
	assert.match(thick, /^M[\d.-]+ [\d.-]+Q.*Z$/);
	assert.ok(span(thick) > 3 * span(thin), `${span(thin)} ${span(thick)}`);
	assert.equal(outline([]), '');
	assert.equal(lines([{ x: 10, y: 20, strokes: [stroke, [5, 5, 1]] }]), 'M10 20L110 20L110 120M15 25l0 0');
});
