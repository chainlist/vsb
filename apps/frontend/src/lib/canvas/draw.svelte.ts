// Drawing with Mod+drag, Mod being Ctrl (Cmd on macOS): from a card, an edge to the card it is
// released on; anywhere else on the paper, a zone, which takes in the cards and zones fully inside
// it. The draft follows the pointer; the item is created on release.
import { createEdge, createZone, type CardView, type Frame } from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { track } from './drag.js';
import { MIN } from './gestures.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { selection } from './selection.svelte.js';

type Point = { x: number; y: number };

/** The zone or the edge being drawn, in world coordinates. An edge's draft ends at the card it
 * would connect to, or at the pointer. */
export const draft = $state<{ box: Frame | null; link: [Frame, Frame] | null }>({ box: null, link: null });

/** Starts drawing from a world point. */
export function startDraw(down: PointerEvent, from: Point) {
	const card = items.cardAt(from);
	if (card) connect(down, card, from);
	else drawZone(down, from);
}

function drawZone(down: PointerEvent, from: Point) {
	track(down, {
		move(dx, dy) {
			const to = { x: from.x + dx / camera.zoom, y: from.y + dy / camera.zoom };
			const x = Math.round(Math.min(from.x, to.x));
			const y = Math.round(Math.min(from.y, to.y));
			draft.box = { x, y, w: Math.round(Math.max(from.x, to.x)) - x, h: Math.round(Math.max(from.y, to.y)) - y };
		},
		end() {
			const box = draft.box;
			draft.box = null;
			if (!box || box.w < MIN.w || box.h < MIN.h) return;
			// Drawn inside a collapsed zone, the new zone would land in it, hidden.
			const within = (z: Frame) => box.x >= z.x && box.y >= z.y && box.x + box.w <= z.x + z.w && box.y + box.h <= z.y + z.h;
			if (items.collapsed && items.zones.some(within)) return;
			// Like a placed card, the new zone opens for editing: its name.
			history.edit(async () => {
				const { id, undo } = await createZone(box.x, box.y, box.w, box.h);
				selection.only(id);
				selection.editing = id;
				return undo;
			});
		}
	});
}

/** Releasing on the card it started from, or on the paper, connects nothing. */
function connect(down: PointerEvent, card: CardView, from: Point) {
	let target: CardView | undefined;
	track(down, {
		move(dx, dy) {
			const to = { x: from.x + dx / camera.zoom, y: from.y + dy / camera.zoom };
			target = items.cardAt(to);
			if (target?.id === card.id) target = undefined;
			draft.link = [card, target ?? { ...to, w: 0, h: 0 }];
		},
		end() {
			draft.link = null;
			if (!target) return;
			const to = target.id;
			history.edit(async () => {
				const { id, undo } = await createEdge(card.id, to);
				selection.only(id);
				return undo;
			});
		}
	});
}
