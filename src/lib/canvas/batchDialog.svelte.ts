// The batch dialog, where cards and edges are typed in the batch syntax. Mod+B opens it; the cards
// land on the point the pointer was over, or on the middle of the canvas when it was elsewhere.
import { camera } from './camera.svelte.js';

type Point = { x: number; y: number };

class BatchDialog {
	/** World point the cards land on, while the dialog is open; null while it is closed. */
	at = $state<Point | null>(null);
	/** The pointer over the canvas, in screen coordinates; null when it is elsewhere. */
	pointer: Point | null = null;

	open() {
		const p = this.pointer ?? { x: camera.width / 2, y: camera.height / 2 };
		this.at = camera.toWorld(p.x, p.y);
	}

	close() {
		this.at = null;
	}
}

export const batchDialog = new BatchDialog();
