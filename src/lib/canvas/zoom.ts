// Zooming like a map: the mouse wheel, two fingers on a trackpad and a pinch all zoom around the
// pointer. Chromium reports a pinch as a wheel turned with Ctrl held, WebKit as gesture events
// carrying the scale since it began. Zooming must stop the page from scrolling or zooming itself,
// which a passive listener cannot do.
import { camera } from './camera.svelte.js';

/** Zoom per pixel of wheel travel. A pinch moves a few pixels per event where a mouse notch moves
 * 100, so it zooms faster, to follow the fingers. */
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.01;

type Point = { x: number; y: number };

/** Where a pointer is over the canvas element, in the camera's screen coordinates. */
export function pointIn(el: HTMLElement, e: { clientX: number; clientY: number }): Point {
	const box = el.getBoundingClientRect();
	return { x: e.clientX - box.left, y: e.clientY - box.top };
}

// A mouse wheel turns by notches, which Chromium and WebKit report as multiples of 120 in the
// legacy wheelDelta, and Firefox in lines. A trackpad scrolls and pinches by the pixel.
function notched(e: WheelEvent) {
	const { wheelDeltaY } = e as WheelEvent & { wheelDeltaY?: number };
	return e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || (!!wheelDeltaY && wheelDeltaY % 120 === 0);
}

/** Zooms the camera with the wheel and pinches over the canvas element `el`. After a wheel turn
 * with no button held, `under` gets the pointer: what lies under it changed without it moving.
 * Returns what removes the listeners. */
export function zoomOn(el: HTMLElement, under: (p: Point) => void) {
	/** The scale reached by the WebKit pinch under way, or null. */
	let pinch: number | null = null;
	const onwheel = (e: WheelEvent) => {
		e.preventDefault();
		if (pinch !== null) return;
		const p = pointIn(el, e);
		// Ctrl+wheel on a mouse still turns by notches, at the wheel's pace.
		const rate = e.ctrlKey && !notched(e) ? PINCH_ZOOM : WHEEL_ZOOM;
		camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * rate));
		if (!e.buttons) under(p);
	};
	const onstart = (e: Event) => {
		e.preventDefault();
		pinch = 1;
	};
	const onchange = (e: Event) => {
		e.preventDefault();
		const g = e as Event & { scale: number; clientX: number; clientY: number };
		const p = pointIn(el, g);
		camera.zoomAt(p.x, p.y, g.scale / (pinch ?? 1));
		pinch = g.scale;
	};
	const onend = (e: Event) => {
		e.preventDefault();
		pinch = null;
	};
	const listeners = [
		['wheel', onwheel],
		['gesturestart', onstart],
		['gesturechange', onchange],
		['gestureend', onend]
	] as const;
	for (const [type, on] of listeners) el.addEventListener(type, on as EventListener, { passive: false });
	return () => {
		for (const [type, on] of listeners) el.removeEventListener(type, on as EventListener);
	};
}
