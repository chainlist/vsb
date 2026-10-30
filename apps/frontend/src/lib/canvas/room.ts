// Making room for a card inserted on an edge, like inserting a row: the card sits on the edge's
// middle, and what lies past it along the edge's way moves along until the usual gap is left on
// each side of it. Pure, so Node tests it without the app.
import type { Frame } from '#lib/api.js';

type Point = { x: number; y: number };
/** A card or an inner zone of the zone the card is inserted in. */
export type Node = Frame & { id: string; zone: boolean };

/**
 * Where a card of `size` goes on an edge whose line has its middle at `mid` and leaves its `from`
 * card along `out` (one of the four directions), and how the zone's `nodes` move to make room.
 * Across the edge's way the card is centered on the middle; along it, also, unless that leaves
 * less than `gap` after `from`. The nodes lying wholly past the middle all move along by the same
 * amount, just enough to leave `gap` after the card. With a `grid`, the card lands on it and the
 * nodes move by whole squares, never less than the gap.
 */
export function makeRoom(mid: Point, out: Point, from: Frame, size: { w: number; h: number }, nodes: Node[], gap: number, grid = 0) {
	const across = out.x !== 0;
	const sign = across ? out.x : out.y;
	// Distances along the edge's way, growing in its direction: a box spans from `near` to `far`.
	const along = (f: Frame) => (across ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).map((v) => v * sign);
	const near = (f: Frame) => Math.min(...along(f));
	const far = (f: Frame) => Math.max(...along(f));
	const length = across ? size.w : size.h;
	const middle = (across ? mid.x : mid.y) * sign;
	// On the grid, or on whole world units without one, as a placed card is.
	const unit = grid || 1;
	const up = (v: number) => Math.ceil(v / unit) * unit;
	const start = up(Math.max(middle - length / 2, far(from) + gap));
	const side = Math.round((across ? mid.y - size.h / 2 : mid.x - size.w / 2) / unit) * unit;
	const lead = sign > 0 ? start : -(start + length);
	const card = across ? { x: lead, y: side, ...size } : { x: side, y: lead, ...size };
	const past = nodes.filter((n) => near(n) > middle);
	const by = past.length ? up(Math.max(0, start + length + gap - Math.min(...past.map(near)))) : 0;
	const moves = by ? past.map((n) => ({ ...n, x: n.x + out.x * by, y: n.y + out.y * by })) : [];
	return { card, moves };
}
