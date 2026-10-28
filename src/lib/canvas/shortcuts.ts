// Canvas keyboard shortcuts, bound through the shared key layer while the canvas is mounted.
import type { Binding } from '#lib/keys.js';
import { deleteSelected, editSelected, stopEditing } from './actions.js';
import { batchDialog } from './batchDialog.svelte.js';
import { history } from './history.js';
import { selection } from './selection.svelte.js';
import { addChildTo } from './tab.svelte.js';

const selected = () => selection.ids.length > 0;
/** The card being edited, or the lone selected card when nothing is: Tab adds a linked card after it. */
const edited = () => selection.cards.find((c) => c.id === selection.editing);
const lone = () => (selection.ids.length === 1 && !selection.editing ? selection.cards[0] : undefined);

export const shortcuts: Binding[] = [
	{ keys: ['Escape'], inText: true, when: () => selection.editing !== null, run: stopEditing },
	{ keys: ['Escape'], when: selected, run: () => selection.clear() },
	{ keys: ['Enter'], when: () => selection.ids.length === 1, run: editSelected },
	{ keys: ['Delete', 'Backspace'], when: selected, run: deleteSelected },
	{ keys: ['Tab'], inText: true, when: () => !!edited(), run: () => addChildTo(edited()!) },
	{ keys: ['Tab'], when: () => !!lone(), run: () => addChildTo(lone()!) },
	{ keys: ['Mod+b'], run: () => batchDialog.open() },
	{ keys: ['Mod+z'], run: () => history.undo() },
	{ keys: ['Mod+Shift+z', 'Mod+y'], run: () => history.redo() }
];
