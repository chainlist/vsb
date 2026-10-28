// Where Tab puts a card's next child. The rules are pure, so Node runs them straight from their
// TypeScript source, with `route` giving each edge's sides as the canvas draws them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { children, firstSpot, lane, slide, ways, WAYS } from '../src/lib/canvas/child.ts';
import { route } from '../src/lib/canvas/route.ts';

const SIZE = { w: 240, h: 140 };
const GAPS = { rank: 80, gap: 40 };
const card = (id, x, y, size = SIZE) => ({ id, x, y, ...size });
const curved = { shape: 'curved', arrow: 'to' };
/** An edge between two cards, routed around the others. */
const link = (from, to, cards, style = curved) => {
	const { out, into } = route(from, to, style, 1, cards.filter((c) => c !== from && c !== to));
	return { from: from.id, to: to.id, ends: [from, to], out, into };
};
/** Where Tab puts the child of `of` on `way`, among `cards`. */
const spot = (of, way, links, cards, grid = 0) =>
	slide(firstSpot(of, way, children(of.id, way, links), SIZE, GAPS, grid), way, cards, GAPS.gap, grid);
const at = (f) => `${f.x},${f.y}`;
/** Whether two boxes come nearer than the gap between children. */
const crowds = (a, b) => a.x < b.x + b.w + GAPS.gap && b.x < a.x + a.w + GAPS.gap && a.y < b.y + b.h + GAPS.gap && b.y < a.y + a.h + GAPS.gap;

test("Kevin's case: an edge arriving on the top of the card puts its child below it", () => {
	const above = card('above', 0, 0);
	const tabbed = card('tabbed', 0, 220);
	const links = [link(above, tabbed, [above, tabbed])];
	assert.deepEqual(ways('tabbed', links), [{ x: 0, y: 1 }]);
	assert.equal(at(spot(tabbed, WAYS.TB, links, [above, tabbed])), '0,440', 'a rank below, aligned with it');
});

test('in the middle of a tree, the outgoing edges decide and the child joins its siblings', () => {
	const root = card('root', 320, -300);
	const middle = card('middle', 320, 0);
	const first = card('first', 640, -100);
	const second = card('second', 640, 80);
	const cards = [root, middle, first, second];
	const links = [link(root, middle, cards), link(middle, first, cards), link(middle, second, cards)];
	assert.deepEqual(links[0].into, { x: 0, y: 1 }, 'the parent arrives on its top');
	assert.deepEqual(ways('middle', links), [{ x: 1, y: 0 }], 'only where its children leave');
	const right = ways('middle', links)[0];
	assert.deepEqual(children('middle', right, links), [first, second]);
	assert.equal(at(spot(middle, right, links, cards)), '640,260', 'a gap under the last sibling, in their column');
});

test('a row of children grows to the right', () => {
	const top = card('top', 0, 0);
	const kids = [card('a', -140, 220), card('b', 140, 220)];
	const cards = [top, ...kids];
	const links = kids.map((k) => link(top, k, cards));
	assert.deepEqual(ways('top', links), [{ x: 0, y: 1 }]);
	assert.equal(at(spot(top, WAYS.TB, links, cards)), '420,220');
});

test('a card without edges follows the builder direction, on the grid when snapping', () => {
	const alone = card('alone', 105, 107);
	assert.deepEqual(ways('alone', []), []);
	assert.equal(at(spot(alone, WAYS.LR, [], [alone])), '425,107', 'a rank to the right, aligned with it');
	assert.equal(at(spot(alone, WAYS.TB, [], [alone], 20)), '100,340', 'below it, on the grid');
	assert.equal(at(spot(alone, WAYS.RL, [], [alone], 20)), '-220,100', 'a rank to the left, on the grid');
	assert.equal(at(spot(alone, WAYS.BT, [], [alone])), '105,-113');
});

test('a taken spot slides along the row to the first free one, never crowding a card', () => {
	const above = card('above', 0, 0);
	const tabbed = card('tabbed', 0, 220);
	const taken = card('taken', 100, 460);
	const next = card('next', 420, 440);
	const far = card('far', 2000, 0, { w: 240, h: 2000 });
	const cards = [above, tabbed, taken, next, far];
	const links = [link(above, tabbed, cards)];
	const first = firstSpot(tabbed, WAYS.TB, [], SIZE, GAPS);
	const lanes = lane(first, WAYS.TB, GAPS.gap);
	assert.ok([taken, next].every((c) => c.x <= lanes.maxX && c.y + c.h >= lanes.minY && c.y <= lanes.maxY), 'the row is searched');
	const placed = spot(tabbed, WAYS.TB, links, cards);
	assert.equal(at(placed), '700,440', 'past both cards, a gap after the second');
	assert.ok(cards.every((c) => !crowds(c, placed)));
	assert.equal(at(spot(tabbed, WAYS.TB, links, cards, 20)), '700,440');
});

test('edges leaving or arriving on several sides open the picker', () => {
	const hub = card('hub', 0, 0);
	const right = card('right', 320, 0);
	const below = card('below', 0, 220);
	const cards = [hub, right, below];
	const out = [link(hub, right, cards), link(hub, below, cards)];
	assert.deepEqual(ways('hub', out), [{ x: 1, y: 0 }, { x: 0, y: 1 }]);
	const left = card('left', -320, 0);
	const top = card('top', 0, -220);
	const into = [link(left, hub, [...cards, left, top]), link(top, hub, [...cards, left, top])];
	assert.deepEqual(ways('hub', into), [{ x: 1, y: 0 }, { x: 0, y: 1 }], 'on past where they arrive');
});

test('a straight edge counts the side it really arrives on', () => {
	const wide = card('wide', 0, 0);
	const tall = card('tall', 300, 400, { w: 60, h: 400 });
	const straight = link(wide, tall, [wide, tall], { shape: 'straight', arrow: 'to' });
	assert.deepEqual([straight.out, straight.into], [{ x: 0, y: 1 }, { x: 1, y: 0 }]);
	assert.deepEqual(ways('tall', [straight]), [{ x: 1, y: 0 }]);
});
