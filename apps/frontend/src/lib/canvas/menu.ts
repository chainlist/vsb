// The canvas's right-click menu (./CanvasMenu.svelte). On a card, a zone's name, an edge or a drawing
// it is the selection's, the item selected first unless it already is; anywhere else on the canvas it
// is the paper's, for the spot clicked.
import { selection } from './selection.svelte.js';

/** Whether the right-click on its way up to the canvas met an item. */
let onItem = false;

/** A right-click on an item, before it reaches the canvas. */
export function pick(id: string) {
	if (!selection.has(id)) selection.only(id);
	onItem = true;
}

/** The right-click reaching the canvas at a world point: the spot the paper's menu is for, or null
 * when it met an item. */
export function paperAt(at: { x: number; y: number }) {
	const paper = onItem ? null : at;
	onItem = false;
	return paper;
}
