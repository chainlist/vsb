// Lining up with the cards around: a side or the middle of a card or zone being moved or resized,
// within reach of a side or the middle of another card, is pulled onto it, and a guide shows each
// line they share. Pure, so Node tests it without the app.
import type { Frame } from '#lib/api.js';

/** `x` for lines at an x coordinate, drawn up and down; `y` for lines at a y, drawn across. */
export type Axis = 'x' | 'y';

/** A line boxes share at `at` on its axis, running from `from` to `to` along the other, with a dot
 * where it meets each box. */
export type Guide = { axis: Axis; at: number; from: number; to: number; dots: number[] };

/** A box's start, middle and end on an axis. */
export function lines(b: Frame, axis: Axis) {
	return axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];
}

/** Where a box meets the line at `at` on an axis, along the other: its center when the line runs
 * through its middle, its two corners when along a side, nowhere when it misses. Half a world unit
 * apart counts, as a middle can fall between two. */
function meets(b: Frame, axis: Axis, at: number) {
	const [start, middle, end] = lines(b, axis);
	const [from, center, to] = lines(b, axis === 'x' ? 'y' : 'x');
	if (Math.abs(middle - at) <= 0.5) return [center];
	if (Math.abs(start - at) <= 0.5 || Math.abs(end - at) <= 0.5) return [from, to];
	return [];
}

/** How far to shift `mine` so the nearest of them lands on a line of `others` within `reach`, in
 * whole world units as items lie; undefined when none is within reach. */
export function pull(mine: number[], others: Frame[], axis: Axis, reach: number) {
	let best: number | undefined;
	for (const o of others)
		for (const theirs of lines(o, axis))
			for (const m of mine) {
				const d = theirs - m;
				if (Math.abs(d) <= reach && (best === undefined || Math.abs(d) < Math.abs(best))) best = d;
			}
	return best === undefined ? undefined : Math.round(best);
}

/** The guides along each of `mine`, lines of `box`, that some of `others` share. Each runs between
 * where it meets `box` and those: corner to corner along sides, center to center through middles. */
export function guides(box: Frame, others: Frame[], mine = { x: lines(box, 'x'), y: lines(box, 'y') }) {
	const found: Guide[] = [];
	for (const axis of ['x', 'y'] as const) {
		for (const at of mine[axis]) {
			const sharing = others.flatMap((o) => meets(o, axis, at));
			if (!sharing.length) continue;
			const dots = [...meets(box, axis, at), ...sharing];
			found.push({ axis, at, from: Math.min(...dots), to: Math.max(...dots), dots });
		}
	}
	return found;
}
