// Whether the zone list's card is open beside the canvas: remembered for each vault on this device,
// in its index, never in a synced file.
import { setUiState } from '#lib/api.js';

/** Its key in the index's state for this device. */
export const ZONE_LIST = 'zone-list';

class ZoneList {
	open = $state(false);

	toggle() {
		this.open = !this.open;
		void setUiState(ZONE_LIST, this.open ? 'open' : 'closed');
	}
}

export const zoneList = new ZoneList();
