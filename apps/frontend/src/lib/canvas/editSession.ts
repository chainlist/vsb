// One edit of one card, following the spec's rules: save about a second after the last
// keystroke and when the edit ends; the first save with content creates the note.
import { createNoteForCard, discardNote, renameNote, saveNote } from '#lib/api.js';

const SAVE_DELAY = 1000;

/** The last edit to end, done once it has saved and applied the blur rules. */
let ended = Promise.resolve();

/** Waits for the last edit that ended to be done. */
export const finished = () => ended;

export function editSession(
	cardId: string,
	noteId: string | null,
	initial: string,
	onError: (error: unknown) => void,
	onConflict: () => void
) {
	let text = initial;
	let saved = initial;
	let created = false;
	// The note changed outside the app: it stays as it is and this edit writes nothing more.
	let conflict = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let queue = Promise.resolve();

	/** Runs `step` after every step already queued, so saves never overlap. */
	function then(step: () => Promise<void>) {
		queue = queue.then(step).catch(onError);
		return queue;
	}

	function save() {
		clearTimeout(timer);
		return then(async () => {
			const body = text;
			if (body === saved || conflict) return;
			if (noteId) {
				if (!(await saveNote(noteId, body))) {
					conflict = true;
					return onConflict();
				}
			} else if (body.trim()) {
				noteId = await createNoteForCard(cardId, body);
				created = true;
			}
			saved = body;
		});
	}

	return {
		input(value: string) {
			text = value;
			clearTimeout(timer);
			timer = setTimeout(save, SAVE_DELAY);
		},

		/** Saves, then applies the blur rules. */
		finish() {
			save();
			ended = then(async () => {
				// An empty card that is still empty stays an empty card.
				if (!noteId || conflict) return;
				// A note created in this edit and emptied again goes away; an older note is kept.
				if (created && !text.trim()) await discardNote(cardId, noteId);
				else await renameNote(noteId);
			});
			return ended;
		}
	};
}
