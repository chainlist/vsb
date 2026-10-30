// Drawing edits: adding a stroke, erasing, moving and deleting, as on the desktop. Each hands target
// item states to `apply`, so every edit can be undone. Recoloring goes with the cards' and zones', in
// `colorItems`.
import type { Created, Erased, Move, PenStroke } from '#lib/api.js';
import { apply, edit, gone, read, state, type Edit } from './apply.ts';
import { landing } from './cards.ts';
import { rectAt } from './grid.ts';
import { inGrid } from './lookups.ts';
import { MEDIUM, type DrawingFile, type DrawingRecord } from './records.ts';
import { newId } from './ulid.ts';

/** How near a drawing's box a stroke must start to join it, in world units: two graph-paper squares. */
const REACH = 40;

/** Rounded to a tenth, halves up, as the desktop rounds; never -0. */
const tenth = (v: number) => Math.floor(v * 10 + 0.5) / 10 + 0;
const hundredth = (v: number) => Math.floor(v * 100 + 0.5) / 100 + 0;

/** The drawing whose box is nearest a world point, if one lies within REACH of it. Equally near, the
 * oldest. */
async function nearest(e: Edit, x: number, y: number) {
	const found = await inGrid<DrawingRecord>(e.tx.objectStore('drawings'), rectAt(x - REACH, y - REACH, 2 * REACH, 2 * REACH));
	let best: { d: DrawingRecord; far: number } | null = null;
	for (const d of found) {
		const dx = Math.max(d.ax - x, x - (d.ax + Math.max(d.file.w, 0)), 0);
		const dy = Math.max(d.ay - y, y - (d.ay + Math.max(d.file.h, 0)), 0);
		const far = dx * dx + dy * dy;
		if (far <= REACH * REACH && (!best || far < best.far || (far === best.far && d.id < best.d.id))) best = { d, far };
	}
	return best?.d ?? null;
}

/** Adds a stroke in a color (null for the ink) and a width, its points as world x, y and pressure in
 * turn, kept to a tenth of a unit and a hundredth of the pressure. Starting within REACH of a
 * drawing's box, it joins the nearest, whose box grows to hold it, whatever the colors and widths of
 * its strokes; otherwise it starts a drawing in the innermost zone under its start. */
export async function addStroke(e: Edit, points: number[], color: string | null, width: number): Promise<Created> {
	if (!(width > 0) || !Number.isFinite(width)) throw new Error('a stroke has a width');
	if (points.length < 2) throw new Error('a stroke is points of x, y and pressure');
	const [sx, sy] = points;
	const near = await nearest(e, sx, sy);
	let id: string, drawing: DrawingFile, corner: [number, number];
	if (near) [id, drawing, corner] = [near.id, await read(e, 'drawing', near.id), [near.ax, near.ay]];
	else {
		const at = e.layout.around(rectAt(sx, sy, 0, 0));
		[id, drawing, corner] = [newId(), { zone: at.zone, x: sx - at.x, y: sy - at.y, w: 0, h: 0, strokes: [] }, [sx, sy]];
	}
	const stroke: PenStroke = { points: rounded(points, ...corner) };
	if (color !== null) stroke.color = color;
	if (width !== MEDIUM) stroke.width = width;
	drawing.strokes = [...drawing.strokes, stroke];
	return { id, undo: await apply(e, [state('drawing', id, fit(drawing))]) };
}

/** Erases from drawings, as one edit: each stroke passed over goes, whole or for the pieces left of
 * it. A drawing's box shrinks to the ink left, and a drawing left with none is deleted. */
export async function eraseStrokes(e: Edit, erased: Erased[]) {
	const states = await Promise.all(
		erased.map(async ({ id, strokes: cuts }) => {
			const drawing = await read(e, 'drawing', id);
			drawing.strokes = drawing.strokes.flatMap((stroke, i) => {
				const cut = cuts.find((c) => c.index === i);
				return cut ? cut.pieces.map((piece) => ({ ...stroke, points: rounded(piece, 0, 0) })) : [stroke];
			});
			return drawing.strokes.length ? state('drawing', id, fit(drawing)) : gone('drawing', id);
		})
	);
	return apply(e, states);
}

/** Drops drawings at new world positions. Each joins the innermost zone under its center, or the
 * canvas, as a card does. */
export function moveDrawings(e: Edit, moves: Move[]) {
	return edit(e, 'drawing', moves.map((m) => m.id), (drawing, i) => {
		const at = landing(e, moves[i].x, moves[i].y, drawing.w, drawing.h);
		Object.assign(drawing, { zone: at.zone, x: moves[i].x - at.x, y: moves[i].y - at.y });
	});
}

export const deleteDrawings = (e: Edit, ids: string[]) => apply(e, ids.map((id) => gone('drawing', id)));

/** Points as x, y and pressure in turn, from (cx, cy), rounded to a tenth of a unit and a hundredth
 * of the pressure. */
function rounded(points: number[], cx: number, cy: number) {
	if (!points.length || points.length % 3) throw new Error('a stroke is points of x, y and pressure');
	const out: number[] = [];
	for (let i = 0; i < points.length; i += 3) out.push(tenth(points[i] - cx), tenth(points[i + 1] - cy), hundredth(Math.min(1, Math.max(0, points[i + 2]))));
	return out;
}

/** Fits a drawing's box to its ink: each stroke's points, with half the stroke's width around them, so
 * a lone dot has a size and shows. Its corner moves, the points shift back by as much, and its size
 * spans them. */
function fit(drawing: DrawingFile): DrawingFile {
	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const { points: p, width = MEDIUM } of drawing.strokes) {
		const ink = width / 2;
		for (let i = 0; i < p.length; i += 3) {
			[left, top, right, bottom] = [Math.min(left, p[i] - ink), Math.min(top, p[i + 1] - ink), Math.max(right, p[i] + ink), Math.max(bottom, p[i + 1] + ink)];
		}
	}
	const strokes = drawing.strokes.map((s) => ({ ...s, points: s.points.map((v, i) => (i % 3 === 0 ? tenth(v - left) : i % 3 === 1 ? tenth(v - top) : v)) }));
	return { ...drawing, x: tenth(drawing.x + left), y: tenth(drawing.y + top), w: tenth(right - left), h: tenth(bottom - top), strokes };
}
