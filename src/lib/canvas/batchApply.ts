// What the batch builder does on Create or Apply: it writes its cards and edges as one undo step,
// then selects the new cards, framing them where they would be hidden or partly off-screen.
import { createBatch, editBatch, type Frame } from '#lib/api.js';
import { layOut, parse, type Direction } from './batch.js';
import { place, wanted, type Edit } from './batchEdit.js';
import { camera } from './camera.svelte.js';
import { history } from './history.js';
import { cover, inside, items, OPEN_ZOOM } from './items.svelte.js';
import { selection } from './selection.svelte.js';

/** What selects new cards landing on these boxes, then frames them when zoomed out, where they
 * would be hidden in a collapsed zone or a cluster, or when they land partly off-screen. Asked
 * before the edit, which can move the camera. */
function landing(boxes: Frame[]) {
	const span = cover(boxes);
	const framed = items.collapsed || !inside(span, camera.visible);
	return (ids: string[]) => {
		selection.ids = ids;
		if (framed) camera.glide(span, OPEN_ZOOM);
	};
}

/** Creates the cards and edges written in the batch syntax, laid out in a direction and centered on a
 * world point, as one undo step, and selects the cards. */
export function createCards(text: string, at: { x: number; y: number }, direction: Direction) {
	const plan = parse(text);
	if (!plan.texts.length) return;
	const boxes = layOut(plan, at, direction);
	const land = landing(boxes);
	return history.edit(async () => {
		const cards = boxes.map((box, i) => ({ ...box, text: plan.texts[i] }));
		const { cards: ids, undo } = await createBatch(at.x, at.y, cards, plan.edges);
		land(ids);
		return undo;
	});
}

/** Applies a text edited in the builder opened on cards of the canvas, as one undo step: the edges
 * between those cards become what it draws, and its new lines new cards, set beside the cards they
 * join and selected. */
export function editCards(edit: Edit, text: string, direction: Direction) {
	const plan = parse(text);
	const { fresh, links } = wanted(plan, edit);
	const boxes = place(plan, edit, fresh, direction);
	const land = boxes.length ? landing(boxes) : null;
	return history.edit(async () => {
		const cards = boxes.map((box, i) => ({ ...box, text: plan.texts[fresh[i]] }));
		const { cards: ids, undo } = await editBatch(edit.scope.zone, edit.scope.cards.map((c) => c.id), cards, links);
		land?.(ids);
		return undo;
	});
}
