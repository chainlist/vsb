// Canvas keyboard shortcuts, bound through the shared key layer while the canvas is mounted.
import type { Binding } from '#lib/keys.js';
import { deleteSelected, editSelected, stopEditing } from './actions.js';
import { batchDialog } from './batchDialog.svelte.js';
import { history } from './history.js';
import { selection } from './selection.svelte.js';

const selected = () => selection.ids.length > 0;

export const shortcuts: Binding[] = [
	{ keys: ['Escape'], inText: true, when: () => selection.editing !== null, run: stopEditing },
	{ keys: ['Escape'], when: selected, run: () => selection.clear() },
	{ keys: ['Enter'], when: () => selection.ids.length === 1, run: editSelected },
	{ keys: ['Delete', 'Backspace'], when: selected, run: deleteSelected },
	{ keys: ['Mod+b'], run: () => batchDialog.open() },
	{ keys: ['Mod+z'], run: () => history.undo() },
	{ keys: ['Mod+Shift+z', 'Mod+y'], run: () => history.redo() }
];
