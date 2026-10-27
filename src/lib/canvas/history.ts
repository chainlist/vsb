// The one undo history. A step is the list of item states that reverses an edit. Applying it
// returns the states that reverse the undo, which become the redo step, and the other way round.
import { applyStates, type ItemState } from '#lib/api.js';
import { items } from './items.svelte.js';

const LIMIT = 200;

let done: ItemState[][] = [];
let undone: ItemState[][] = [];
let queue = Promise.resolve();

function push(stack: ItemState[][], step: ItemState[]) {
	stack.push(step);
	if (stack.length > LIMIT) stack.shift();
}

/** Runs steps one after another, so quick repeats never interleave, then redraws. */
function enqueue(step: () => Promise<void>) {
	queue = queue
		.then(step)
		.then(() => items.refresh())
		.catch((e) => console.error(e));
	return queue;
}

export const history = {
	reset() {
		done = [];
		undone = [];
	},

	/** Runs an edit that returns the states it replaced, as one undo step. An edit that replaced
	 * nothing is no step. */
	edit(change: () => Promise<ItemState[]>) {
		return enqueue(async () => {
			const step = await change();
			if (!step.length) return;
			push(done, step);
			undone = [];
		});
	},

	undo() {
		return enqueue(async () => {
			const step = done.pop();
			if (step) push(undone, await applyStates(step));
		});
	},

	redo() {
		return enqueue(async () => {
			const step = undone.pop();
			if (step) push(done, await applyStates(step));
		});
	}
};
