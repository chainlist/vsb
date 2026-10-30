// Whether the zone list's card is open beside the canvas: remembered for each vault on this device,
// in its index, never in a synced file.
import { SvelteSet } from 'svelte/reactivity';
import { setUiState } from '#lib/api.js';
import type { KeyHelp } from '#lib/keys.js';

/** Its key in the index's state for this device. */
export const ZONE_LIST = 'zone-list';

/** The list's keys once the keyboard is in it, as Settings list them. */
export const ZONE_LIST_KEYS = {
	down: { keys: ['ArrowDown'], label: 'Next zone, or from the find field the first' },
	up: { keys: ['ArrowUp'], label: 'Previous zone, or from the first the find field' },
	unfold: { keys: ['ArrowRight'], label: 'List the zones inside, or once listed go to the first' },
	fold: { keys: ['ArrowLeft'], label: 'Fold them back up, or once folded go to the zone around' },
	leave: { keys: ['Escape'], label: 'Give the keyboard back to the canvas, from a row or the empty field' },
	renamed: { keys: ['Escape'], label: 'Stop renaming a zone, keeping what was typed' }
} satisfies Record<string, KeyHelp>;

class ZoneList {
	open = $state(false);
	/** The zones whose inner zones are listed under their rows; all fold up again as the card closes. */
	unfolded = new SvelteSet<string>();
	/** Whether the card, as it opens, puts the keyboard in its find field: so when Mod+L opens it. */
	focusFind = false;

	toggle(focusFind = false) {
		this.open = !this.open;
		this.focusFind = focusFind;
		if (!this.open) this.unfolded.clear();
		void setUiState(ZONE_LIST, this.open ? 'open' : 'closed');
	}

	/** Lists a zone's inner zones under its row, or folds them back up. */
	unfold(id: string, open = !this.unfolded.has(id)) {
		if (open) this.unfolded.add(id);
		else this.unfolded.delete(id);
	}
}

export const zoneList = new ZoneList();
