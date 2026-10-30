// The one owner of the pan and zoom transform: everything converting between world and
// screen coordinates goes through here. Screen coordinates are relative to the canvas element.
import { cubicInOut } from 'svelte/easing';
import type { Rect } from '#lib/api.js';
import { interfaceSize } from '#lib/interfaceSize.svelte.js';
import { motion } from '#lib/motion.js';
import { flight, type View } from './flight.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
/** Room left around content framed by `fit`, in screen pixels at a 100% interface size: clear of
 * the chrome in the corners and down the left edge (its inset, the rail, a gap). */
const FIT_MARGIN = 80;
/** How long a glide takes, in ms: by the length of its path, within bounds. */
const GLIDE = { perStep: 500, min: 250, max: 800 };
/** The zooms the zoom buttons step through, 40% among them, where zones collapse. */
const STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];

class Camera {
	/** World point at the canvas's top-left corner. */
	x = $state(0);
	y = $state(0);
	zoom = $state(1);
	/** Canvas size in screen pixels. */
	width = $state(0);
	height = $state(0);
	/** The pointer over the canvas, in screen coordinates; null when it is elsewhere. */
	pointer: { x: number; y: number } | null = null;
	/** The animation frame of the glide under way, or 0. */
	#gliding = 0;

	reset() {
		this.stop();
		this.x = 0;
		this.y = 0;
		this.zoom = 1;
	}

	toWorld(sx: number, sy: number) {
		return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
	}

	toScreen(wx: number, wy: number) {
		return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
	}

	/** Where something made from the keyboard lands: the world point under the pointer, or the
	 * middle of the canvas when the pointer is elsewhere. */
	pointed() {
		const p = this.pointer ?? { x: this.width / 2, y: this.height / 2 };
		return this.toWorld(p.x, p.y);
	}

	panBy(dx: number, dy: number) {
		this.stop();
		this.x -= dx / this.zoom;
		this.y -= dy / this.zoom;
	}

	/** Zooms by `factor`, keeping the world point under (sx, sy) in place. */
	zoomAt(sx: number, sy: number, factor: number) {
		this.stop();
		const p = this.toWorld(sx, sy);
		this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
		this.x = p.x - sx / this.zoom;
		this.y = p.y - sy / this.zoom;
	}

	/** Zooms to the next step in (1) or out (-1), keeping the middle of the canvas in place. */
	step(way: 1 | -1) {
		const near = (z: number) => Math.abs(z - this.zoom) < 1e-3;
		const next = way > 0 ? STEPS.find((z) => z > this.zoom && !near(z)) : STEPS.findLast((z) => z < this.zoom && !near(z));
		if (next) this.zoomAt(this.width / 2, this.height / 2, next / this.zoom);
	}

	/** Centers a world rectangle on screen, zoomed out until it fits, but never zoomed in past 100%
	 * nor out below `least`. */
	fit(r: Rect, least = MIN_ZOOM) {
		this.stop();
		this.#show(this.#framing(r, least));
	}

	/** Frames a world rectangle as `fit` does, gliding there like a map: a far jump zooms out,
	 * travels and zooms back in. Panning or zooming stops it. */
	glide(r: Rect, least = MIN_ZOOM) {
		this.#fly(this.#framing(r, least));
	}

	/** Glides just far enough to bring a world rectangle on screen, at the same zoom, as clear of the
	 * chrome as `fit` leaves it; centers it when it cannot fit. One already there stays put. */
	reveal(r: Rect) {
		const margin = (FIT_MARGIN * interfaceSize.percent) / 100 / this.zoom;
		const v = this.visible;
		// How far the view moves along one axis to bring the span from `min` to `max` within `lo` to `hi`.
		const by = (min: number, max: number, lo: number, hi: number) =>
			max - min > hi - lo ? (min + max - lo - hi) / 2 : Math.min(0, min - lo) + Math.max(0, max - hi);
		const dx = by(r.minX, r.maxX, v.minX + margin, v.maxX - margin);
		const dy = by(r.minY, r.maxY, v.minY + margin, v.maxY - margin);
		if (!dx && !dy) return;
		const view = this.#view();
		this.#fly({ x: view.x + dx, y: view.y + dy, w: view.w });
	}

	/** Glides to a view, as `glide` describes. */
	#fly(to: View) {
		this.stop();
		const path = flight(this.#view(), to);
		const ms = motion(Math.min(GLIDE.max, Math.max(GLIDE.min, path.length * GLIDE.perStep)));
		const start = performance.now();
		const step = (now: number) => {
			const t = ms ? Math.min(1, (now - start) / ms) : 1;
			this.#show(t < 1 ? path.at(cubicInOut(t)) : to);
			this.#gliding = t < 1 ? requestAnimationFrame(step) : 0;
		};
		this.#gliding = requestAnimationFrame(step);
	}

	/** Stops a glide where it is. */
	stop() {
		cancelAnimationFrame(this.#gliding);
		this.#gliding = 0;
	}

	/** The view that frames a world rectangle, as `fit` describes. */
	#framing(r: Rect, least: number): View {
		const margin = (FIT_MARGIN * interfaceSize.percent) / 100;
		const zoom = Math.min(
			1,
			(this.width - 2 * margin) / (r.maxX - r.minX),
			(this.height - 2 * margin) / (r.maxY - r.minY)
		);
		return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2, w: this.width / Math.max(least, zoom) };
	}

	/** The view on screen: its middle in the world, and its width in world units. */
	#view(): View {
		const w = this.width / this.zoom;
		return { x: this.x + w / 2, y: this.y + this.height / this.zoom / 2, w };
	}

	#show(v: View) {
		this.zoom = this.width / v.w;
		this.x = v.x - v.w / 2;
		this.y = v.y - this.height / this.zoom / 2;
	}

	/** The world rectangle on screen. */
	get visible(): Rect {
		return {
			minX: this.x,
			minY: this.y,
			maxX: this.x + this.width / this.zoom,
			maxY: this.y + this.height / this.zoom
		};
	}

	/** CSS transform that draws world coordinates on screen. */
	get transform() {
		return `scale(${this.zoom}) translate(${-this.x}px, ${-this.y}px)`;
	}
}

export const camera = new Camera();
