// What the mouse wheel does on the canvas: zoom around the pointer, the default, or pan. Set for this
// device, the same in every vault.
import type { Wheel } from '#lib/api.js';

class WheelSetting {
	does = $state<Wheel>('zoom');
}

export const wheel = new WheelSetting();
