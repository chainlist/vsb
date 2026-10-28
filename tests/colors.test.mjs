// The color palette cards and zones share, and how a selection's shared value reads.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLORS, shared } from '../src/lib/canvas/colors.ts';

test('one palette: no color first, then the seven highlighters', () => {
	assert.deepEqual(COLORS[0], [null, 'No color']);
	assert.equal(COLORS.length, 7);
	assert.ok(COLORS.slice(1).every(([value]) => /^#[0-9a-f]{6}$/.test(value)));
});

test('a value shared by every item, or undefined for a mixed selection', () => {
	assert.equal(shared(['#f5d76e', '#f5d76e']), '#f5d76e');
	assert.equal(shared([null, null]), null, 'no color is a value of its own');
	assert.equal(shared([null, '#f5d76e']), undefined);
	assert.equal(shared([]), undefined);
});
