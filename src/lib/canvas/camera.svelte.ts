// The one owner of the pan and zoom transform: everything converting between world and
// screen coordinates goes through here. Screen coordinates are relative to the canvas element.
import type { Rect } from '#lib/api.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
/** Room left around content framed by `fit`, in screen pixels. */
const FIT_MARGIN = 64;

class Camera {
	/** World point at the canvas's top-left corner. */
	x = $state(0);
	y = $state(0);
	zoom = $state(1);
	/** Canvas size in screen pixels. */
	width = $state(0);
	height = $state(0);

	reset() {
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

	panBy(dx: number, dy: number) {
		this.x -= dx / this.zoom;
		this.y -= dy / this.zoom;
	}

	/** Zooms by `factor`, keeping the world point under (sx, sy) in place. */
	zoomAt(sx: number, sy: number, factor: number) {
		const p = this.toWorld(sx, sy);
		this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
		this.x = p.x - sx / this.zoom;
		this.y = p.y - sy / this.zoom;
	}

	/** Centers a world rectangle on screen, zoomed out until it fits, but never zoomed in past 100%
	 * nor out below `least`. */
	fit(r: Rect, least = MIN_ZOOM) {
		const zoom = Math.min(
			1,
			(this.width - 2 * FIT_MARGIN) / (r.maxX - r.minX),
			(this.height - 2 * FIT_MARGIN) / (r.maxY - r.minY)
		);
		this.zoom = Math.max(least, zoom);
		this.x = (r.minX + r.maxX - this.width / this.zoom) / 2;
		this.y = (r.minY + r.maxY - this.height / this.zoom) / 2;
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
