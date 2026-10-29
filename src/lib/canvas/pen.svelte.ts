// The pen and the eraser, on the rail and on P and E; Escape puts either down. While one is in hand,
// a left drag anywhere on the canvas draws or erases instead of panning, moving or selecting; the
// wheel, a pinch and the middle button still zoom and pan. A stroke is written on release, as one
// undo step; the eraser fades every whole stroke it passes over, and takes them all on release, as
// one undo step.
import { addStroke, eraseStrokes } from '#lib/api.js';
import type { KeyHelp } from '#lib/keys.js';
import { camera } from './camera.svelte.js';
import { history } from './history.js';
import { PEN, simulated, touches } from './ink.js';
import { items } from './items.svelte.js';
import { pointIn } from './zoom.js';

/** The eraser's radius, in screen pixels. */
export const ERASER = 8;

/** The keys that pick up and put down the pen and the eraser, as Settings list them. */
export const DRAWING_KEYS = {
	pen: { keys: ['p'], label: 'Pick up the pen, or put it down' },
	eraser: { keys: ['e'], label: 'Pick up the eraser, or put it down' },
	down: { keys: ['Escape'], label: 'Put the pen or the eraser down' }
} satisfies Record<string, KeyHelp>;

export type Tool = 'pen' | 'eraser';

class Ink {
	/** The tool in hand: the two exclude each other. */
	tool = $state<Tool | null>(null);
	/** The stroke being drawn, in world coordinates, and those released but not yet back from the
	 * backend, so a stroke never blinks out between the two. */
	live = $state.raw<number[] | null>(null);
	pending = $state.raw<number[][]>([]);
	/** The strokes the eraser passed over, by drawing: faded until they go. */
	erased = $state.raw<Record<string, number[]>>({});

	toggle(tool: Tool) {
		this.tool = this.tool === tool ? null : tool;
	}
}

export const ink = new Ink();

/** Starts a stroke or erasing on the canvas element `el`, with the tool in hand. */
export function startInk(down: PointerEvent, el: HTMLElement) {
	const world = (e: PointerEvent) => {
		const p = pointIn(el, e);
		return { ...camera.toWorld(p.x, p.y), screen: p };
	};
	const run = ink.tool === 'pen' ? draw(world) : erase(world);
	run(down);
	// Every point the pointer passed, not only one per frame: a pen moves fast.
	const move = (e: PointerEvent) => {
		for (const p of e.getCoalescedEvents?.() ?? [e]) run(p);
	};
	const up = () => {
		removeEventListener('pointermove', move);
		removeEventListener('pointerup', up);
		removeEventListener('pointercancel', up);
		run(null);
	};
	addEventListener('pointermove', move);
	addEventListener('pointerup', up);
	addEventListener('pointercancel', up);
}

type Where = (e: PointerEvent) => { x: number; y: number; screen: { x: number; y: number } };

/** Draws a stroke, point by point, and writes it once the pointer is released (null). A stylus gives
 * its pressure; a mouse's is simulated from its speed. */
function draw(world: Where) {
	const points: number[] = [];
	let last: { x: number; y: number } | null = null;
	let pressure = 0.5;
	return (e: PointerEvent | null) => {
		if (!e) {
			ink.live = null;
			ink.pending = [...ink.pending, points];
			const done = () => (ink.pending = ink.pending.filter((p) => p !== points));
			return history.edit(async () => (await addStroke(points)).undo).finally(done);
		}
		const p = world(e);
		if (e.pointerType === 'pen') pressure = e.pressure || 0.5;
		else if (last) pressure = simulated(pressure, Math.hypot(p.screen.x - last.x, p.screen.y - last.y));
		last = p.screen;
		points.push(p.x, p.y, pressure);
		ink.live = [...points];
	};
}

/** Fades every whole stroke the eraser passes over, then takes them out once it is released (null). */
function erase(world: Where) {
	let last: { x: number; y: number } | null = null;
	return (e: PointerEvent | null) => {
		if (!e) {
			const erased = Object.entries(ink.erased).map(([id, strokes]) => ({ id, strokes }));
			if (!erased.length) return;
			return history.edit(() => eraseStrokes(erased)).finally(() => (ink.erased = {}));
		}
		const p = world(e);
		const from = last ?? p;
		last = p;
		// The eraser's edge on the ink's edge.
		const r = ERASER / camera.zoom + PEN / 2;
		const [x0, y0, x1, y1] = [Math.min(from.x, p.x) - r, Math.min(from.y, p.y) - r, Math.max(from.x, p.x) + r, Math.max(from.y, p.y) + r];
		let found = false;
		const erased = { ...ink.erased };
		for (const d of items.drawings) {
			if (d.x > x1 || d.y > y1 || d.x + d.w < x0 || d.y + d.h < y0) continue;
			d.strokes.forEach((s, i) => {
				if (erased[d.id]?.includes(i) || !touches(s, d.x, d.y, from, p, r)) return;
				erased[d.id] = [...(erased[d.id] ?? []), i];
				found = true;
			});
		}
		if (found) ink.erased = erased;
	};
}
