// Selection and focus on the canvas: the selected cards, zones and edges, and the one item in edit
// mode (a card's text, a zone's name or an edge's label).
import { items } from './items.svelte.js';

class Selection {
	ids = $state<string[]>([]);
	editing = $state<string | null>(null);

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
