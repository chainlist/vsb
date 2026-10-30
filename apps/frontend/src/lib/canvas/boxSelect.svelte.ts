// Selecting with a box: Shift+drag on the paper, or on a zone's body, draws a box, and every card,
// zone and drawing lying fully inside it joins the selection as the box grows. Mod+A selects
// everything on screen, as a box around the whole window would.
import type { Frame, Rect } from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { track } from './drag.js';
import { inside, items } from './items.svelte.js';
import { selection } from './selection.svelte.js';

/** The box being drawn, in world coordinates; null while none is. */
export const selecting = $state<{ box: Frame | null }>({ box: null });

/** The cards, zones and drawings on the canvas lying fully inside a world rectangle, by ID. */
function within(r: Rect) {
	return [...items.zones, ...items.cards, ...items.drawings]
		.filter((i) => inside({ minX: i.x, minY: i.y, maxX: i.x + i.w, maxY: i.y + i.h }, r))
		.map((i) => i.id);
}

/** Draws a box from a world point. What was selected stays selected, as Shift+click adds; a press
 * that does not drag changes nothing. */
export function startBox(down: PointerEvent, from: { x: number; y: number }) {
	const kept = selection.ids;
	track(down, {
		move(dx, dy) {
			const to = { x: from.x + dx / camera.zoom, y: from.y + dy / camera.zoom };
			const r = { minX: Math.min(from.x, to.x), minY: Math.min(from.y, to.y), maxX: Math.max(from.x, to.x), maxY: Math.max(from.y, to.y) };
			selecting.box = { x: r.minX, y: r.minY, w: r.maxX - r.minX, h: r.maxY - r.minY };
			selection.ids = [...new Set([...kept, ...within(r)])];
		},
		end() {
			selecting.box = null;
		}
	});
}

/** Selects everything lying fully on screen, in place of the selection. */
export function selectAll() {
	selection.ids = within(camera.visible);
}
