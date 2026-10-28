// Where an edge runs between its two cards, in world units. Curved and angled lines leave each card
// square to the side that faces the other card, from the middle of that side, unless that leads
// them through another card and the other pair of sides does not. A straight line runs along the
// line between the cards' centers. Arrowheads sit at `to`, at both cards, or at neither.
import type { Arrow, Frame, Shape } from '#lib/api.js';

type Point = { x: number; y: number };
/** Where a line leaves one card and reaches the other, and its direction at both. */
type Ends = { start: Point; tip: Point; d: Point };

export type Style = { shape: Shape; arrow: Arrow };

/** How a new edge looks. */
export const NEW_EDGE: Style = { shape: 'curved', arrow: 'to' };

const ARROW = { length: 11, width: 10 };
/** The most a curve runs straight out of a card before turning towards the other one. */
const MAX_BEND = 120;
/** How many pieces a curve is cut into to test it against cards. */
const PIECES = 16;

export type Route = {
	/** SVG path of the line, which stops where its arrowheads begin. */
	path: string;
	/** SVG points of each arrowhead. */
	arrows: string[];
	/** The line's halfway point, where its label sits. */
	mid: Point;
};

/** `p` moved `by` along `d`. */
const step = (p: Point, d: Point, by: number) => ({ x: p.x + d.x * by, y: p.y + d.y * by });
const halfway = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const center = (f: Frame) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
const xy = (p: Point) => `${p.x},${p.y}`;

/** An arrowhead with its tip at `tip`, pointing along `d`, `px` world units per pixel. */
function head(tip: Point, d: Point, px: number) {
	const base = step(tip, d, -ARROW.length * px);
	const side = { x: -d.y, y: d.x };
	const half = (ARROW.width / 2) * px;
	return [tip, step(base, side, half), step(base, side, -half)].map(xy).join(' ');
}

/** Along the line between the cards' centers, from border to border. */
function centers(a: Frame, b: Frame): Ends {
	const ca = center(a);
	const cb = center(b);
	const length = Math.hypot(cb.x - ca.x, cb.y - ca.y);
	const d = length ? { x: (cb.x - ca.x) / length, y: (cb.y - ca.y) / length } : { x: 1, y: 0 };
	// From a card's center to its border, along d.
	const reach = (f: Frame) => Math.min(f.w / 2 / Math.abs(d.x), f.h / 2 / Math.abs(d.y));
	return { start: step(ca, d, reach(a)), tip: step(cb, d, -reach(b)), d };
}

/** Through the sides facing each other across (left and right) or down (top and bottom). */
function sides(a: Frame, b: Frame, across: boolean): Ends {
	const ca = center(a);
	const cb = center(b);
	const d = across ? { x: Math.sign(cb.x - ca.x) || 1, y: 0 } : { x: 0, y: Math.sign(cb.y - ca.y) || 1 };
	return { start: step(ca, d, across ? a.w / 2 : a.h / 2), tip: step(cb, d, across ? -b.w / 2 : -b.h / 2), d };
}

/** Whether the segment from `p` to `q` runs through the inside of `f`; along its border is not. */
function crosses(p: Point, q: Point, f: Frame) {
	const dx = q.x - p.x;
	const dy = q.y - p.y;
	// Clipped side by side: how fast the segment moves towards each side, and how far inside it `p` is.
	const limits = [
		[-dx, p.x - f.x],
		[dx, f.x + f.w - p.x],
		[-dy, p.y - f.y],
		[dy, f.y + f.h - p.y]
	];
	let from = 0;
	let to = 1;
	for (const [toward, inside] of limits) {
		if (toward === 0 && inside <= 0) return false;
		if (toward < 0) from = Math.max(from, inside / toward);
		if (toward > 0) to = Math.min(to, inside / toward);
	}
	return from < to;
}

/** Whether a line through these points misses every box. Only boxes meeting the line's bounding
 * box are tested piece by piece. */
function clears(points: Point[], boxes: Frame[]) {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	return boxes
		.filter((f) => f.x < maxX && f.x + f.w > minX && f.y < maxY && f.y + f.h > minY)
		.every((f) => points.every((p, i) => i === 0 || !crosses(points[i - 1], p, f)));
}

/** The line between these ends, and the points it runs through. */
function draw({ start, tip, d }: Ends, { shape, arrow }: Style, px: number) {
	const p = arrow === 'both' ? step(start, d, ARROW.length * px) : start;
	const q = arrow === 'none' ? tip : step(tip, d, -ARROW.length * px);
	const arrows = [
		...(arrow === 'none' ? [] : [head(tip, d, px)]),
		...(arrow === 'both' ? [head(start, { x: -d.x, y: -d.y }, px)] : [])
	];
	const line = (points: Point[], mid: Point) => ({ route: { path: `M${points.map(xy).join(' L')}`, arrows, mid }, points });
	const m = halfway(p, q);
	if (shape === 'straight') return line([p, q], m);
	// Out of one card, across halfway, then into the other, bending at right angles.
	if (shape === 'angled') {
		const bends = d.x ? [{ x: m.x, y: p.y }, { x: m.x, y: q.y }] : [{ x: p.x, y: m.y }, { x: q.x, y: m.y }];
		return line([p, ...bends, q], m);
	}
	const bend = Math.min(MAX_BEND * px, Math.hypot(q.x - p.x, q.y - p.y) / 2);
	const c1 = step(p, d, bend);
	const c2 = step(q, d, -bend);
	const at = (t: number) => {
		const u = 1 - t;
		const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
		return { x: k0 * p.x + k1 * c1.x + k2 * c2.x + k3 * q.x, y: k0 * p.y + k1 * c1.y + k2 * c2.y + k3 * q.y };
	};
	const route = { path: `M${xy(p)} C${xy(c1)} ${xy(c2)} ${xy(q)}`, arrows, mid: at(0.5) };
	return { route, points: Array.from({ length: PIECES + 1 }, (_, i) => at(i / PIECES)) };
}

/** The route between two boxes. Its arrowheads and bends are sized in pixels of `px` world units:
 * 1 for an edge, which zooms with its cards, or one screen pixel for a bundle, which does not.
 * A curved or angled line that would run through one of `obstacles` takes the other pair of sides
 * when that line misses them all. */
export function route(a: Frame, b: Frame, style: Style, px = 1, obstacles: Frame[] = []): Route {
	if (style.shape === 'straight') return draw(centers(a, b), style, px).route;
	// Through the left and right sides when the cards lie further apart across than down, for
	// their sizes; through the top and bottom otherwise.
	const dx = Math.abs(center(b).x - center(a).x);
	const dy = Math.abs(center(b).y - center(a).y);
	const across = dx / (a.w + b.w) >= dy / (a.h + b.h);
	const first = draw(sides(a, b, across), style, px);
	if (clears(first.points, obstacles)) return first.route;
	const other = draw(sides(a, b, !across), style, px);
	return clears(other.points, obstacles) ? other.route : first.route;
}
