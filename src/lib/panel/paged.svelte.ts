// A list beside the canvas, fetched a page at a time as it scrolls, so it never holds the whole of
// what it lists. After each edit to the vault, the lines shown are fetched again.
import { untrack } from 'svelte';
import { items } from '#lib/canvas/items.svelte.js';

/** Lines fetched at a time. */
const PAGE = 50;

type Load<T> = (offset: number, limit: number) => Promise<T[]>;

export class Paged<T> {
	lines = $state<T[]>([]);
	/** Whether more lines may follow. */
	more = $state(false);
	loaded = $state(false);
	#load: Load<T> | undefined;
	#latest = 0;

	/** Lists what `load` returns, starting over whenever it returns another function. Created while
	 * a component starts. */
	constructor(load: () => Load<T>) {
		$effect(() => {
			void items.revision;
			const next = load();
			const fresh = next !== this.#load;
			this.#load = next;
			untrack(() => this.#fetch(0, fresh ? PAGE : Math.max(PAGE, this.lines.length)));
		});
	}

	/** Fetches `limit` lines from `offset` on. Answers to older fetches are dropped. */
	async #fetch(offset: number, limit: number) {
		const query = ++this.#latest;
		const found = await this.#load!(offset, limit);
		if (query !== this.#latest) return;
		this.lines = offset ? [...this.lines, ...found] : found;
		this.more = found.length === limit;
		this.loaded = true;
	}

	/** Attached to the end of the list: fetches the next page once it scrolls into view. */
	atEnd = (end: HTMLElement) => {
		const seen = new IntersectionObserver(([e]) => e.isIntersecting && this.#fetch(this.lines.length, PAGE));
		seen.observe(end);
		return () => seen.disconnect();
	};
}
