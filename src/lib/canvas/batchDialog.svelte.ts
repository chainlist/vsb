// The batch dialog, where cards and edges are typed in the batch syntax. Mod+B opens it; the cards
// land on the point the pointer was over, or on the middle of the canvas when it was elsewhere.
// Opened on a selected zone or on selected cards, it edits the edges between their cards.
import { batchScope } from '#lib/api.js';
import type { Direction } from './batch.js';
import { opening, type Edit } from './batchEdit.js';
import { camera } from './camera.svelte.js';
import { selection } from './selection.svelte.js';

type Point = { x: number; y: number };

class BatchDialog {
	/** World point the cards land on, while the dialog is open; null while it is closed. */
	at = $state<Point | null>(null);
	/** The pointer over the canvas, in screen coordinates; null when it is elsewhere. */
	pointer: Point | null = null;
	/** Opened on cards of the canvas: them, their edges and the text; null for new cards only. */
	edit = $state<Edit | null>(null);
	/** Which way the edges run in a batch's layout: kept for the batches after one, and for
	 * arranging the selected cards. */
	direction = $state<Direction>('LR');

	/** Opens on the selected zone's cards, at any depth, or on the selected cards; on new cards only
	 * when neither is selected. */
	async open() {
		const p = this.pointer ?? { x: camera.width / 2, y: camera.height / 2 };
		const at = camera.toWorld(p.x, p.y);
		const [zone] = selection.zones;
		if (zone && selection.ids.length === 1) {
			this.edit = opening(await batchScope(zone.id, []), { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 });
		} else {
			const scope = selection.ids.length ? await batchScope(null, selection.ids) : null;
			this.edit = scope?.cards.length ? opening(scope, at) : null;
		}
		this.at = at;
	}

	close() {
		this.at = null;
		this.edit = null;
	}
}

export const batchDialog = new BatchDialog();
