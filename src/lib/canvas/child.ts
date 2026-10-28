// Where Tab puts a card's next child: the way the card's edges already flow, then a free spot that
// way, beside the children already there. Pure, so Node tests it without the app.
import type { EdgeView, Frame } from '#lib/api.js';
import type { Direction } from './batch.js';
import type { Route } from './route.js';

type Point = { x: number; y: number };
type Size = { w: number; h: number };
/** One of the card's edges, with the ways its line leaves its first card and reaches its second, as routed. */
export type Link = Pick<EdgeView, 'from' | 'to' | 'ends'> & Pick<Route, 'out' | 'into'>;
/** Room between cards, in world units: `rank` from a card to its children, `gap` between them. */
export type Gaps = { rank: number; gap: number };

/** The builder's directions as ways across the canvas. */
export const WAYS: Record<Direction, Point> = {
	LR: { x: 1, y: 0 },
	TB: { x: 0, y: 1 },
	RL: { x: -1, y: 0 },
	BT: { x: 0, y: -1 }
};

/** A box's position and length along x or y. */
type Axis = { pos: 'x' | 'y'; len: 'w' | 'h' };
const X: Axis = { pos: 'x', len: 'w' };
const Y: Axis = { pos: 'y', len: 'h' };
const end = (f: Frame, a: Axis) => f[a.pos] + f[a.len];
const middle = (f: Frame, a: Axis) => f[a.pos] + f[a.len] / 2;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
/** Children line up across the way: in a column for a way across, in a row for a way down or up. */
const lineOf = (way: Point) => (way.x ? Y : X);

/** The ways a new child of `card` can go: where the lines of its outgoing edges leave it or, with
 * none, on past where its incoming edges reach it (a line arriving on its top side leads below it).
 * Each way once; none for a card without edges. */
export function ways(card: string, links: Link[]): Point[] {
	const out = links.filter((l) => l.from === card).map((l) => l.out);
	const found = out.length ? out : links.filter((l) => l.to === card).map((l) => l.into);
	return found.filter((w, i) => found.findIndex((v) => same(v, w)) === i);
}

/** The cards `card`'s edges leaving it on `way` reach: its children there. */
export function children(card: string, way: Point, links: Link[]) {
	return links.filter((l) => l.from === card && same(l.out, way)).map((l) => l.ends[1]);
}

/**
 * Where a new child of `size` first goes on `way` from `card`. Beside `others`, its children
 * there, it joins them `gap` after the last of them in reading order, centered on it: below it in a
 * column, right of it in a row. With none, it goes `rank` past the card, centered on it. On a `grid` it
 * lands on the grid, never nearer than those gaps.
 */
export function firstSpot(card: Frame, way: Point, others: Frame[], size: Size, { rank, gap }: Gaps, grid = 0): Frame {
	const line = lineOf(way);
	const flow = line === X ? Y : X;
	// On the grid, or on whole world units without one, as a placed card is.
	const unit = grid || 1;
	const near = (v: number) => Math.round(v / unit) * unit;
	const up = (v: number) => Math.ceil(v / unit) * unit;
	const down = (v: number) => Math.floor(v / unit) * unit;
	const spot = { x: 0, y: 0, ...size };
	const last = others.reduce<Frame | undefined>((l, k) => (l && end(l, line) >= end(k, line) ? l : k), undefined);
	if (last) {
		spot[flow.pos] = near(middle(last, flow) - size[flow.len] / 2);
		spot[line.pos] = up(end(last, line) + gap);
	} else {
		spot[flow.pos] = way.x + way.y > 0 ? up(end(card, flow) + rank) : down(card[flow.pos] - rank - size[flow.len]);
		spot[line.pos] = near(middle(card, line) - size[line.len] / 2);
	}
	return spot;
}

/** `spot` slid on along its column or row (down, or right) until it comes no nearer than `gap` to
 * any of `cards`, landing on a `grid`. */
export function slide(spot: Frame, way: Point, cards: Frame[], gap: number, grid = 0): Frame {
	const line = lineOf(way);
	const unit = grid || 1;
	const close = (at: Frame) =>
		cards.filter((f) => f.x < at.x + at.w + gap && f.x + f.w > at.x - gap && f.y < at.y + at.h + gap && f.y + f.h > at.y - gap);
	let at = spot;
	// Each step passes every card in the way, so it ends once nothing is.
	for (let near = close(at); near.length; near = close(at)) {
		at = { ...at, [line.pos]: Math.ceil((Math.max(...near.map((f) => end(f, line))) + gap) / unit) * unit };
	}
	return at;
}

/** The world rectangle `slide` searches from `spot`: its column or row, from a gap before it on. */
export function lane(spot: Frame, way: Point, gap: number) {
	const across = way.x !== 0;
	return {
		minX: spot.x - gap,
		minY: spot.y - gap,
		maxX: across ? spot.x + spot.w + gap : Number.MAX_VALUE,
		maxY: across ? Number.MAX_VALUE : spot.y + spot.h + gap
	};
}
