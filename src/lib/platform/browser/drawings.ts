// Drawing edits: adding a stroke, erasing strokes, moving and deleting, as on the desktop. Each hands
// target item states to `apply`, so every edit can be undone. Recoloring goes with the cards' and
// zones', in `colorItems`.
import type { Created, Erased, Move } from '#lib/api.js';
import { apply, edit, gone, read, state, type Edit } from './apply.ts';
import { landing } from './cards.ts';
import { rectAt } from './grid.ts';
import { inGrid } from './lookups.ts';
import type { DrawingFile, DrawingRecord } from './records.ts';
import { newId } from './ulid.ts';

/** How near a drawing's box a stroke must start to join it, in world units: two graph-paper squares. */
const REACH = 40;
/** Half the pen's width at middling pressure: a drawing's box holds its ink, not only the line through
 * its points, so a lone dot has a size and shows. */
const INK = 1.5;

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

/** Adds a stroke, its points as world x, y and pressure in turn, kept to a tenth of a unit and a
 * hundredth of the pressure. Starting within REACH of a drawing's box, it joins the nearest, whose box
 * grows to hold it; otherwise it starts a drawing in the innermost zone under its start. */
export async function addStroke(e: Edit, points: number[]): Promise<Created> {
	if (!points.length || points.length % 3) throw new Error('a stroke is points of x, y and pressure');
	const [sx, sy] = points;
	const near = await nearest(e, sx, sy);
	let id: string, drawing: DrawingFile, corner: [number, number];
	if (near) [id, drawing, corner] = [near.id, await read(e, 'drawing', near.id), [near.ax, near.ay]];
	else {
		const at = e.layout.around(rectAt(sx, sy, 0, 0));
		[id, drawing, corner] = [newId(), { zone: at.zone, x: sx - at.x, y: sy - at.y, w: 0, h: 0, strokes: [] }, [sx, sy]];
	}
	const stroke: number[] = [];
	for (let i = 0; i < points.length; i += 3) {
		stroke.push(tenth(points[i] - corner[0]), tenth(points[i + 1] - corner[1]), hundredth(Math.min(1, Math.max(0, points[i + 2]))));
	}
	drawing.strokes = [...drawing.strokes, stroke];
	return { id, undo: await apply(e, [state('drawing', id, fit(drawing))]) };
}

/** Takes strokes out of drawings, as one edit. A drawing's box shrinks to the strokes left, and a
 * drawing left with none is deleted. */
export async function eraseStrokes(e: Edit, erased: Erased[]) {
	const states = await Promise.all(
		erased.map(async ({ id, strokes }) => {
			const drawing = await read(e, 'drawing', id);
			drawing.strokes = drawing.strokes.filter((_, i) => !strokes.includes(i));
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

/** Fits a drawing's box to its ink: its strokes' points, with INK around them. Its corner moves, the
 * points shift back by as much, and its size spans them. */
function fit(drawing: DrawingFile): DrawingFile {
	let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const s of drawing.strokes) {
		for (let i = 0; i < s.length; i += 3) [minX, minY, maxX, maxY] = [Math.min(minX, s[i]), Math.min(minY, s[i + 1]), Math.max(maxX, s[i]), Math.max(maxY, s[i + 1])];
	}
	const [left, top] = [minX - INK, minY - INK];
	const strokes = drawing.strokes.map((s) => s.map((v, i) => (i % 3 === 0 ? tenth(v - left) : i % 3 === 1 ? tenth(v - top) : v)));
	const [w, h] = [tenth(maxX - minX + 2 * INK), tenth(maxY - minY + 2 * INK)];
	return { ...drawing, x: tenth(drawing.x + left), y: tenth(drawing.y + top), w, h, strokes };
}
