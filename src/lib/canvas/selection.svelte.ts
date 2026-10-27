// Selection and focus on the canvas: the selected cards, zones and edges, and the one item in edit
// mode (a card's text, a zone's name or an edge's label).
import type { EdgeView } from '#lib/api.js';
import { items } from './items.svelte.js';

class Selection {
	ids = $state<string[]>([]);
	editing = $state<string | null>(null);
	/** While cards are selected: them, and every card an edge joins to one of them. Null otherwise. */
	#linked = $derived.by(() => {
		const cards = new Set(this.cards.map((c) => c.id));
		if (!cards.size) return null;
		const linked = new Set(cards);
		for (const e of items.edges) {
			if (cards.has(e.from)) linked.add(e.to);
			if (cards.has(e.to)) linked.add(e.from);
		}
		return linked;
	});

	/** Whether a card dims, so the selected cards' links stand out: cards are selected, and no edge
	 * joins this one to them. */
	dims(cardId: string) {
		return this.#linked !== null && !this.#linked.has(cardId);
	}

	/** Whether an edge dims: cards are selected, and it touches none of them. */
	dimsEdge(edge: EdgeView) {
		return this.#linked !== null && !this.has(edge.id) && !this.has(edge.from) && !this.has(edge.to);
	}

	/** The selected cards among those on the canvas. */
	get cards() {
		return items.cards.filter((c) => this.has(c.id));
	}

	/** The selected zones among those on the canvas. */
	get zones() {
		return items.zones.filter((z) => this.has(z.id));
	}

	/** The selected edges among those on the canvas. */
	get edges() {
		return items.edges.filter((e) => this.has(e.id));
	}

	has(id: string) {
		return this.ids.includes(id);
	}

	only(id: string) {
		this.ids = [id];
	}

	toggle(id: string) {
		this.ids = this.has(id) ? this.ids.filter((i) => i !== id) : [...this.ids, id];
	}

	clear() {
		this.ids = [];
	}
}

export const selection = new Selection();
