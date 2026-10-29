// Pen mode, on the rail and on P; Escape leaves it. In it the hand holds the pen or an eraser, picked in
// the pen bar or with E: the stroke eraser takes out whole strokes, the cutting eraser only what it
// passes over. A left drag anywhere on the canvas draws or erases instead of panning, moving or
// selecting; the wheel, a pinch and the middle button still zoom and pan. A stroke is written on
// release, as one undo step; an eraser shows what it takes at once, and takes it all on release, as
// one undo step. The pen's color, width and eraser are kept on this device.
import { addStroke, eraseStrokes, setDevicePen, type Eraser, type Pen } from '#lib/api.js';
import { failure } from '#lib/failure.svelte.js';
import type { KeyHelp } from '#lib/keys.js';
import { camera } from './camera.svelte.js';
import { history } from './history.js';
import { cut, MEDIUM, simulated, touches } from './ink.js';
import { items } from './items.svelte.js';
import { pointIn } from './zoom.js';

/** The eraser's radius, in screen pixels. */
export const ERASER = 8;

/** The keys of pen mode, as Settings list them. */
export const DRAWING_KEYS = {
	pen: { keys: ['p'], label: 'Turn pen mode on or off, with the tool last in hand' },
	eraser: { keys: ['e'], label: 'Take the eraser last used, or go back to the pen' },
	off: { keys: ['Escape'], label: 'Leave pen mode' }
} satisfies Record<string, KeyHelp>;

/** What the hand holds: the pen, or one of the two erasers. */
export type Tool = 'pen' | Eraser;

class Ink {
	/** Whether pen mode is on. */
	on = $state(false);
	/** Whether the hand holds an eraser rather than the pen. */
	erasing = $state(false);
	/** The pen's color, width and eraser, as this device keeps them. */
	pen = $state<Pen>({ color: null, width: MEDIUM, eraser: 'stroke' });
	/** The stroke being drawn, in world coordinates, and those released but not yet back from the
	 * backend, so a stroke never blinks out between the two; each with its color and width. */
	live = $state.raw<Drawn | null>(null);
	pending = $state.raw<Drawn[]>([]);
	/** What the eraser passed over, by drawing and stroke: null for a whole stroke, faded until it
	 * goes; for a cut one, the pieces left of it. */
	erased = $state.raw<Record<string, Record<number, number[][] | null>>>({});

	/** The tool in hand. */
	get tool(): Tool {
		return this.erasing ? this.pen.eraser : 'pen';
	}

	/** P: pen mode on or off, with the tool last in hand. */
	toggle() {
		this.on = !this.on;
	}

	/** E: the eraser last used, from anywhere; again, back to the pen. */
	eraser() {
		this.erasing = !(this.on && this.erasing);
		this.on = true;
	}

	/** Takes a tool from the pen bar; an eraser's kind is kept for next time. */
	take(tool: Tool) {
		this.erasing = tool !== 'pen';
		if (tool !== 'pen') this.keep({ eraser: tool });
	}

	/** A color or a width picked goes back to the pen, with it. */
	choose(change: Partial<Pick<Pen, 'color' | 'width'>>) {
		this.erasing = false;
		this.keep(change);
	}

	/** The pen's last write: each waits for the one before, so quick picks land in order. */
	#kept = Promise.resolve();

	/** Changes the pen and keeps it on this device. */
	keep(change: Partial<Pen>) {
		this.pen = { ...this.pen, ...change };
		const pen = $state.snapshot(this.pen);
		this.#kept = this.#kept.then(() => setDevicePen(pen)).catch(failure.report);
	}
}

type Drawn = { points: number[]; color: string | null; width: number };

export const ink = new Ink();

/** Starts a stroke or erasing on the canvas element `el`, with the tool in hand. */
export function startInk(down: PointerEvent, el: HTMLElement) {
	const world = (e: PointerEvent) => {
		const p = pointIn(el, e);
		return { ...camera.toWorld(p.x, p.y), screen: p };
	};
	const run = ink.tool === 'pen' ? draw(world) : erase(world, ink.tool);
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

/** Draws a stroke in the pen's color and width, point by point, and writes it once the pointer is
 * released (null). A stylus gives its pressure; a mouse's is simulated from its speed. */
function draw(world: Where) {
	const { color, width } = ink.pen;
	const points: number[] = [];
	let last: { x: number; y: number } | null = null;
	let pressure = 0.5;
	return (e: PointerEvent | null) => {
		if (!e) {
			const drawn = { points, color, width };
			ink.live = null;
			ink.pending = [...ink.pending, drawn];
			const done = () => (ink.pending = ink.pending.filter((p) => p !== drawn));
			return history.edit(async () => (await addStroke(points, color, width)).undo).finally(done);
		}
		const p = world(e);
		if (e.pointerType === 'pen') pressure = e.pressure || 0.5;
		else if (last) pressure = simulated(pressure, Math.hypot(p.screen.x - last.x, p.screen.y - last.y));
		last = p.screen;
		points.push(p.x, p.y, pressure);
		ink.live = { points: [...points], color, width };
	};
}

/** Erases what the eraser passes over, whole strokes or cutting them, shown at once, then takes it
 * out once it is released (null). */
function erase(world: Where, kind: Eraser) {
	let last: { x: number; y: number } | null = null;
	return (e: PointerEvent | null) => {
		if (!e) {
			const erased = Object.entries(ink.erased).map(([id, cuts]) => ({
				id,
				strokes: Object.entries(cuts).map(([index, pieces]) => ({ index: Number(index), pieces: pieces ?? [] }))
			}));
			if (!erased.length) return;
			return history.edit(() => eraseStrokes(erased)).finally(() => (ink.erased = {}));
		}
		const p = world(e);
		const from = last ?? p;
		last = p;
		const reach = ERASER / camera.zoom;
		const [x0, y0, x1, y1] = [Math.min(from.x, p.x) - reach, Math.min(from.y, p.y) - reach, Math.max(from.x, p.x) + reach, Math.max(from.y, p.y) + reach];
		const erased = { ...ink.erased };
		let found = false;
		for (const d of items.drawings) {
			// A drawing's box holds its ink.
			if (d.x > x1 || d.y > y1 || d.x + d.w < x0 || d.y + d.h < y0) continue;
			d.strokes.forEach((s, i) => {
				const was = erased[d.id]?.[i];
				if (was === null) return;
				// The eraser's edge on the ink's edge.
				const r = reach + (s.width ?? MEDIUM) / 2;
				let now: number[][] | null | undefined;
				if (kind === 'stroke') now = touches(s.points, d.x, d.y, from, p, r) ? null : undefined;
				else {
					const pieces = (was ?? [s.points]).map((piece) => cut(piece, d.x, d.y, from, p, r));
					if (pieces.some((c) => c !== null)) now = pieces.flatMap((c, k) => c ?? [(was ?? [s.points])[k]]);
				}
				if (now === undefined) return;
				erased[d.id] = { ...erased[d.id], [i]: now };
				found = true;
			});
		}
		if (found) ink.erased = erased;
	};
}
