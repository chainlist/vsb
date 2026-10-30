// How large the controls and panels are drawn on this device, the same in every vault. The root
// carries it as --ui-scale, and every piece of chrome (the .chrome class in app.css) is zoomed by
// it; the canvas's cards, zones and edges never are.

export const INTERFACE_SIZES = [100, 115, 130];

export const DEFAULT_INTERFACE_SIZE = INTERFACE_SIZES[0];

class Current {
	percent = $state(DEFAULT_INTERFACE_SIZE);

	/** Shows a size kept for this device: null, or one this build does not offer, is the default. */
	use(percent: number | null) {
		this.percent = INTERFACE_SIZES.includes(percent!) ? percent! : DEFAULT_INTERFACE_SIZE;
	}
}

export const interfaceSize = new Current();
