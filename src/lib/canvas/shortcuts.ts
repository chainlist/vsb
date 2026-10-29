// Canvas keyboard shortcuts, bound through the shared key layer while the canvas is mounted.
import type { Binding, KeyHelp } from '#lib/keys.js';
import { deleteSelected, editSelected, fitAll, stopEditing } from './actions.js';
import { batchDialog, BUILDER_KEYS } from './batchDialog.svelte.js';
import { history } from './history.js';
import { DRAWING_KEYS, ink } from './pen.svelte.js';
import { selection } from './selection.svelte.js';
import { addChildTo } from './tab.svelte.js';

/** The canvas's keys, as Settings list them. */
export const CANVAS_KEYS = {
	clear: { keys: ['Escape'], label: 'Clear the selection' },
	edit: { keys: ['Enter'], label: "Edit the selected card, edge's label or zone's name" },
	remove: { keys: ['Delete', 'Backspace'], label: 'Delete the selection' },
	child: { keys: ['Tab'], label: 'Add a linked card after the selected card' },
	undo: { keys: ['Mod+z'], label: 'Undo' },
	redo: { keys: ['Mod+Shift+z', 'Mod+y'], label: 'Redo' },
	fit: { keys: ['Mod+1'], label: 'Fit everything on the canvas' }
} satisfies Record<string, KeyHelp>;

/** While a card, an edge's label or a zone's name is edited. */
export const EDITING_KEYS = {
	stop: { keys: ['Escape'], label: 'Stop editing, keeping what was typed' },
	child: { keys: ['Tab'], label: 'Add a linked card after the card being edited' }
} satisfies Record<string, KeyHelp>;

const selected = () => selection.ids.length > 0;
/** The card being edited, or the lone selected card when nothing is: Tab adds a linked card after it. */
const edited = () => selection.cards.find((c) => c.id === selection.editing);
const lone = () => (selection.ids.length === 1 && !selection.editing ? selection.cards[0] : undefined);

export const shortcuts: Binding[] = [
	{ ...EDITING_KEYS.stop, inText: true, when: () => selection.editing !== null, run: stopEditing },
	{ ...DRAWING_KEYS.off, when: () => ink.on, run: () => (ink.on = false) },
	{ ...CANVAS_KEYS.clear, when: selected, run: () => selection.clear() },
	{ ...CANVAS_KEYS.edit, when: () => selection.ids.length === 1, run: editSelected },
	{ ...CANVAS_KEYS.remove, when: selected, run: deleteSelected },
	{ ...EDITING_KEYS.child, inText: true, when: () => !!edited(), run: () => addChildTo(edited()!) },
	{ ...CANVAS_KEYS.child, when: () => !!lone(), run: () => addChildTo(lone()!) },
	{ ...BUILDER_KEYS.open, run: () => batchDialog.open() },
	{ ...CANVAS_KEYS.undo, run: () => history.undo() },
	{ ...CANVAS_KEYS.redo, run: () => history.redo() },
	{ ...CANVAS_KEYS.fit, run: fitAll },
	{ ...DRAWING_KEYS.pen, run: () => ink.toggle() },
	{ ...DRAWING_KEYS.eraser, run: () => ink.eraser() }
];
