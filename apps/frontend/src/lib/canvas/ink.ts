// How strokes of the pen are drawn, touched and cut: each stroke is its points as x, y and pressure in
// turn, drawn by perfect-freehand as an outline that thickens with the pressure. Pure, so Node tests
// it without the app.
import { getStroke } from 'perfect-freehand';

type Point = { x: number; y: number };

/** The pen's widths in world units, at middling pressure: thinner pressed lightly, thicker pressed
 * hard. Medium is a stroke's width unless its file says otherwise. */
export const WIDTHS: [number, string][] = [
	[1.5, 'Thin'],
	[3, 'Medium'],
	[8, 'Thick']
];
export const MEDIUM = 3;

/** Screen pixels a mouse moves between two events at which its line is thinnest: it has no pressure,
 * so the line follows its speed, as perfect-freehand simulates it, thicker when slow. */
const FAST = 16;
const RATE = 0.275;

/** The pressure a mouse's next point is given, from the last one's and how far it moved on screen. */
export function simulated(last: number, moved: number) {
	const speed = Math.min(1, moved / FAST);
	return Math.min(1, last + (1 - speed - last) * speed * RATE);
}

/** A stroke's outline at a width, as an SVG path. While it is being drawn (`last` false), its end is
 * left open to follow the pointer. */
export function outline(stroke: number[], width = MEDIUM, last = true) {
	const points: number[][] = [];
	for (let i = 0; i < stroke.length; i += 3) points.push([stroke[i], stroke[i + 1], stroke[i + 2]]);
	const ring = getStroke(points, { size: width, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last });
	if (!ring.length) return '';
	// Through the middles of the ring's sides, curving at its corners.
	const at = (i: number) => ring[i % ring.length];
	const round = (v: number) => Math.round(v * 100) / 100;
	let d = `M${round(ring[0][0])} ${round(ring[0][1])}Q`;
	for (let i = 0; i < ring.length; i++) {
		const [[x0, y0], [x1, y1]] = [at(i), at(i + 1)];
		d += `${round(x0)} ${round(y0)} ${round((x0 + x1) / 2)} ${round((y0 + y1) / 2)} `;
	}
	return `${d}Z`;
}

/** Strokes as one path of plain lines, each offset by its own (x, y): a collapsed zone's preview
 * draws all its drawings of a color with one stroked path. */
export function lines(drawings: { x: number; y: number; strokes: number[][] }[]) {
	let d = '';
	for (const { x, y, strokes } of drawings) {
		for (const s of strokes) {
			for (let i = 0; i < s.length; i += 3) d += `${i ? 'L' : 'M'}${x + s[i]} ${y + s[i + 1]}`;
			// A lone point is a dot: a line to itself, drawn with round caps.
			if (s.length === 3) d += `l0 0`;
		}
	}
	return d;
}

/** The distance from a point to a segment. */
function toSegment(p: Point, a: Point, b: Point) {
	const [dx, dy] = [b.x - a.x, b.y - a.y];
	const length = dx * dx + dy * dy;
	const t = length ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
	return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Which side of the line through `o` and `a` the point `b` lies on. */
const side = (o: Point, a: Point, b: Point) => Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));

/** The distance between two segments: none when they cross. */
function between(a: Point, b: Point, c: Point, d: Point) {
	if (side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0) return 0;
	return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b));
}

/** Whether the eraser, moving from `a` to `b` with radius `r`, passes over a stroke whose points are
 * offset by (dx, dy). All in world units. */
export function touches(stroke: number[], dx: number, dy: number, a: Point, b: Point, r: number) {
	let last: Point | null = null;
	for (let i = 0; i < stroke.length; i += 3) {
		const p = { x: stroke[i] + dx, y: stroke[i + 1] + dy };
		if (between(a, b, last ?? p, p) <= r) return true;
		last = p;
	}
	return false;
}

/** What is left of a stroke once a cutting eraser, moving from `a` to `b` with radius `r`, passed over
 * it, its points offset by (dx, dy): null when it did not touch it, else the pieces on either side of
 * each cut, each its own points, none when it took it all. The parts of the stroke it crosses are cut
 * finely first, so a cut falls where it passed, not at the nearest point. A lone point left at a cut's
 * edge is let go: a dot nobody drew. All in world units.
 */
export function cut(stroke: number[], dx: number, dy: number, a: Point, b: Point, r: number): number[][] | null {
	const fine: number[] = [];
	for (let i = 0; i < stroke.length; i += 3) {
		if (i) {
			const [p, q] = [{ x: stroke[i - 3] + dx, y: stroke[i - 2] + dy }, { x: stroke[i] + dx, y: stroke[i + 1] + dy }];
			const steps = between(a, b, p, q) <= r ? Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (r / 2)) : 1;
			for (let k = 1; k < steps; k++) {
				const t = k / steps;
				fine.push(stroke[i - 3] + (stroke[i] - stroke[i - 3]) * t, stroke[i - 2] + (stroke[i + 1] - stroke[i - 2]) * t, stroke[i - 1] + (stroke[i + 2] - stroke[i - 1]) * t);
			}
		}
		fine.push(stroke[i], stroke[i + 1], stroke[i + 2]);
	}
	const pieces: number[][] = [];
	let piece: number[] = [];
	let touched = false;
	for (let i = 0; i < fine.length; i += 3) {
		if (toSegment({ x: fine[i] + dx, y: fine[i + 1] + dy }, a, b) > r) piece.push(fine[i], fine[i + 1], fine[i + 2]);
		else {
			touched = true;
			pieces.push(piece);
			piece = [];
		}
	}
	pieces.push(piece);
	return touched ? pieces.filter((p) => p.length > 3) : null;
}
