// The one keyboard layer. Parts of the app declare bindings; a single window listener runs the
// first binding that matches, newest bindings first. Keys read like 'Mod+Shift+z', where Mod is
// Ctrl (Cmd on macOS).

export type Binding = {
	keys: string[];
	run: () => void;
	/** Extra condition, checked when the key is pressed. */
	when?: () => boolean;
	/** Also runs while typing in a text field, or in a part that takes its own keys (data-own-keys). */
	inText?: boolean;
};

/** A key as Settings > Keyboard lists it, with what it does. Bindings take their keys from these, so
 * the list is what is bound. */
export type KeyHelp = { keys: string[]; label: string };

type Layer = { bindings: Binding[]; modal: boolean };

const layers: Layer[] = [];

/** Whether Mod (Ctrl, or Cmd on macOS) is held, for keys and pointer gestures alike. */
export const isMod = (e: KeyboardEvent | MouseEvent) => e.ctrlKey || e.metaKey;

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** How Mod reads on this platform, in tooltips. */
export const MOD_NAME = MAC ? 'Cmd' : 'Ctrl';

/** How Alt reads on this platform. */
export const ALT_NAME = MAC ? 'Option' : 'Alt';

const NAMES: Record<string, string> = {
	Mod: MOD_NAME,
	Alt: ALT_NAME,
	Escape: 'Esc',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→'
};

/** How a key reads on this platform, in tooltips and settings: Mod+Shift+z as Ctrl+Shift+Z. */
export const keyName = (key: string) =>
	key
		.split('+')
		.map((part) => NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part))
		.join('+');

function combo(e: KeyboardEvent) {
	const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
	const mods = [isMod(e) ? 'Mod' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''];
	return [...mods, key].filter(Boolean).join('+');
}

/** Whether keys go to a text field, or to a part marked data-own-keys, such as the zone list once the
 * keyboard is in it: the canvas's keys are off there, as while typing. */
function typing(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || target.matches('input, textarea, select') || target.closest('[data-own-keys]') !== null)
	);
}

/** Whether a key was pressed in an open menu, which takes its own keys: Escape, Enter or Delete
 * there never reach the canvas. */
function inMenu(target: EventTarget | null) {
	return target instanceof Element && target.closest('[role="menu"]') !== null;
}

function onKeydown(e: KeyboardEvent) {
	if (inMenu(e.target)) return;
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
