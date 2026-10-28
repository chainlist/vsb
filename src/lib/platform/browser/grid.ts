// The spatial index the desktop gets from SQLite's R*Tree. Each card, edge and bundle is filed under
// one square of a grid, of a side picked by its size, so the items meeting a rectangle are read with
// a few key ranges: one per column of squares, per side.
import type { Frame, Rect } from '#lib/api.js';

/** An absolute box: minX, minY, maxX, maxY. */
export type Box = [number, number, number, number];

/** Squares of 1024, 4096, 16384 and 65536 world units; anything bigger goes in one bucket. A card
 * fits the smallest, so a window at full zoom spans a few columns of it. */
const BASE = 1024;
const SIDES = 4;
/** Past this many columns, one range reads the whole stripe: one read costs about as much as eight
 * small items. */
const COLUMNS = 16;

/** The square an item is filed under: its side's rank, then the column and row of its top-left
 * corner. An item spans at most this square and the next ones right and down. */
export function gridKey(b: Box): number[] {
	const size = Math.max(b[2] - b[0], b[3] - b[1]);
	for (let rank = 0, side = BASE; rank < SIDES; rank++, side *= 4) {
		if (size <= side) return [rank, Math.floor(b[0] / side), Math.floor(b[1] / side)];
	}
	return [SIDES, 0, 0];
}

/** The key ranges, after `prefix`, holding every item filed by `gridKey` that may meet `r`. */
export function gridRanges(r: Rect, prefix: number[] = []): IDBKeyRange[] {
	const ranges: IDBKeyRange[] = [];
	for (let rank = 0, side = BASE; rank < SIDES; rank++, side *= 4) {
		const [x0, x1] = [Math.floor(r.minX / side) - 1, Math.floor(r.maxX / side)];
		const [y0, y1] = [Math.floor(r.minY / side) - 1, Math.floor(r.maxY / side)];
		if (x1 - x0 >= COLUMNS) {
			ranges.push(IDBKeyRange.bound([...prefix, rank, x0, -Infinity], [...prefix, rank, x1, Infinity]));
			continue;
		}
		for (let x = x0; x <= x1; x++) ranges.push(IDBKeyRange.bound([...prefix, rank, x, y0], [...prefix, rank, x, y1]));
	}
	ranges.push(IDBKeyRange.only([...prefix, SIDES, 0, 0]));
	return ranges;
}

export const meets = (b: Box, r: Rect) => b[2] >= r.minX && b[0] <= r.maxX && b[3] >= r.minY && b[1] <= r.maxY;

/** At least `size` wide or tall. */
export const large = (b: Box, size: number) => b[2] - b[0] >= size || b[3] - b[1] >= size;

/** The box of a frame, never inside out. */
export const boxOf = (f: Frame): Box => [f.x, f.y, f.x + Math.max(f.w, 0), f.y + Math.max(f.h, 0)];

export const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Whether `b` reaches a side of `around`: taking it away may shrink the box around the rest. */
export const touches = (b: Box, around: Box) => b[0] <= around[0] || b[1] <= around[1] || b[2] >= around[2] || b[3] >= around[3];

export const rectOf = (b: Box): Rect => ({ minX: b[0], minY: b[1], maxX: b[2], maxY: b[3] });

/** The rectangle at (x, y) of size w by h; a point when both are 0. */
export const rectAt = (x: number, y: number, w: number, h: number): Rect => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });

/** The smallest rectangle covering both. */
export const cover = (a: Rect, b: Rect): Rect => ({
	minX: Math.min(a.minX, b.minX),
	minY: Math.min(a.minY, b.minY),
	maxX: Math.max(a.maxX, b.maxX),
	maxY: Math.max(a.maxY, b.maxY)
});

export const frameOf = (b: Box): Frame => ({ x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] });
