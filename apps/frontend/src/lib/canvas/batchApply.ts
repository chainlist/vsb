// What the batch builder does on Create or Apply: it writes its cards and edges as one undo step,
// then selects the new cards, framing them where they would be hidden or partly off-screen.
import { createBatch, editBatch } from '#lib/api.js';
import { landing } from './actions.js';
import { layOut, parse, type Direction } from './batch.js';
import { place, wanted, type Edit } from './batchEdit.js';
import { history } from './history.js';

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
