// Dragging a note from a list onto the canvas, which places its card where it is dropped. A ghost
// of the card follows the pointer, at the canvas's zoom.
import type { Entry } from '#lib/api.js';
import { dropNote } from '#lib/canvas/actions.js';
import { camera } from '#lib/canvas/camera.svelte.js';
import { track } from '#lib/canvas/drag.js';

export type Note = Extract<Entry, { kind: 'note' }>;

/** The note being dragged, if any, and the pointer on screen. */
export const ghost = $state<{ note: Note | null; x: number; y: number }>({ note: null, x: 0, y: 0 });

export function startDrag(down: PointerEvent, note: Note) {
	if (down.button !== 0) return;
	track(down, {
		move(dx, dy) {
			Object.assign(ghost, { note, x: down.clientX + dx, y: down.clientY + dy });
		},
		end(dragged) {
			const { x, y } = ghost;
			ghost.note = null;
			// Only a drop on the canvas places the card, not one back on the panel or on the chrome.
			// The canvas fills the window, so the pointer's window position is its canvas position.
			if (dragged && document.elementFromPoint(x, y)?.closest('.canvas')) dropNote(note.path, camera.toWorld(x, y));
		}
	});
}
