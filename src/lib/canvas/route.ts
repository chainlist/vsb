// Where an edge runs between its two cards, in world units. Curved and angled lines leave each card
// square to the side that faces the other card, from the middle of that side; a straight line runs
// along the line between the cards' centers. Arrowheads sit at `to`, at both cards, or at neither.
import type { Arrow, Frame, Shape } from '#lib/api.js';

type Point = { x: number; y: number };

export type Style = { shape: Shape; arrow: Arrow };

/** How a new edge looks. */
export const NEW_EDGE: Style = { shape: 'curved', arrow: 'to' };

const ARROW = { length: 11, width: 10 };
/** The most a curve runs straight out of a card before turning towards the other one. */
const MAX_BEND = 120;

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

/** Where the line leaves `a` and reaches `b`, and its direction at both. */
function ends(a: Frame, b: Frame, shape: Shape) {
	const ca = center(a);
	const cb = center(b);
	const dx = cb.x - ca.x;
	const dy = cb.y - ca.y;
	if (shape === 'straight') {
		const length = Math.hypot(dx, dy);
		const d = length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
		// From a card's center to its border, along d.
		const reach = (f: Frame) => Math.min(f.w / 2 / Math.abs(d.x), f.h / 2 / Math.abs(d.y));
		return { start: step(ca, d, reach(a)), tip: step(cb, d, -reach(b)), d };
	}
	// Through the left and right sides when the cards lie further apart across than down, for
	// their sizes; through the top and bottom otherwise.
	const across = Math.abs(dx) / (a.w + b.w) >= Math.abs(dy) / (a.h + b.h);
	const d = across ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
	return { start: step(ca, d, across ? a.w / 2 : a.h / 2), tip: step(cb, d, across ? -b.w / 2 : -b.h / 2), d };
}

/** The route between two boxes. Its arrowheads and bends are sized in pixels of `px` world units:
 * 1 for an edge, which zooms with its cards, or one screen pixel for a bundle, which does not. */
export function route(a: Frame, b: Frame, { shape, arrow }: Style, px = 1): Route {
	const { start, tip, d } = ends(a, b, shape);
	const p = arrow === 'both' ? step(start, d, ARROW.length * px) : start;
	const q = arrow === 'none' ? tip : step(tip, d, -ARROW.length * px);
	const arrows = [
		...(arrow === 'none' ? [] : [head(tip, d, px)]),
		...(arrow === 'both' ? [head(start, { x: -d.x, y: -d.y }, px)] : [])
	];
	if (shape === 'straight') return { path: `M${xy(p)} L${xy(q)}`, arrows, mid: halfway(p, q) };
	if (shape === 'angled') {
		// Out of one card, across halfway, then into the other, bending at right angles.
		const m = halfway(p, q);
		const path = d.x ? `M${xy(p)} H${m.x} V${q.y} H${q.x}` : `M${xy(p)} V${m.y} H${q.x} V${q.y}`;
		return { path, arrows, mid: m };
	}
	const bend = Math.min(MAX_BEND * px, Math.hypot(q.x - p.x, q.y - p.y) / 2);
	const c1 = step(p, d, bend);
	const c2 = step(q, d, -bend);
	return {
		path: `M${xy(p)} C${xy(c1)} ${xy(c2)} ${xy(q)}`,
		arrows,
		mid: { x: (p.x + 3 * c1.x + 3 * c2.x + q.x) / 8, y: (p.y + 3 * c1.y + 3 * c2.y + q.y) / 8 }
	};
}
