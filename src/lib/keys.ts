// The one keyboard layer. Parts of the app declare bindings; a single window listener runs the
// first binding that matches, newest bindings first. Keys read like 'Mod+Shift+z', where Mod is
// Ctrl (Cmd on macOS).

export type Binding = {
	keys: string[];
	run: () => void;
	/** Extra condition, checked when the key is pressed. */
	when?: () => boolean;
	/** Also runs while typing in a text field. */
	inText?: boolean;
};

type Layer = { bindings: Binding[]; modal: boolean };

const layers: Layer[] = [];

/** Whether Mod (Ctrl, or Cmd on macOS) is held, for keys and pointer gestures alike. */
export const isMod = (e: KeyboardEvent | MouseEvent) => e.ctrlKey || e.metaKey;

/** How Mod reads on this platform, in tooltips. */
export const MOD_NAME = /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd' : 'Ctrl';

function combo(e: KeyboardEvent) {
	const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
	const mods = [isMod(e) ? 'Mod' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''];
	return [...mods, key].filter(Boolean).join('+');
}

function typing(target: EventTarget | null) {
	return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

function onKeydown(e: KeyboardEvent) {
	const pressed = combo(e);
	const inText = typing(e.target);
	for (const layer of layers.toReversed()) {
		const binding = layer.bindings.find(
			(b) => b.keys.includes(pressed) && (!inText || b.inText) && (b.when?.() ?? true)
		);
		if (binding) {
			e.preventDefault();
			binding.run();
			return;
		}
		if (layer.modal) return;
	}
}

/** Adds bindings until the returned function is called. A modal layer, for a screen over the
 * canvas, also turns off every binding added before it. */
export function bindKeys(bindings: Binding[], { modal = false } = {}) {
	const layer = { bindings, modal };
	if (!layers.length) addEventListener('keydown', onKeydown);
	layers.push(layer);
	return () => {
		layers.splice(layers.indexOf(layer), 1);
		if (!layers.length) removeEventListener('keydown', onKeydown);
	};
}
