// Pointer tracking shared by panning, moving and resizing. Reports the travel since the press
// only once it passes a small threshold, so plain clicks and double-clicks still work.

/** Pointer travel, in pixels, before a press becomes a drag. */
const THRESHOLD = 3;

type Handlers = {
	move(dx: number, dy: number, e: PointerEvent): void;
	end(dragged: boolean): void;
};

export function track(down: PointerEvent, on: Handlers) {
	let dragged = false;
	const move = (e: PointerEvent) => {
		const dx = e.clientX - down.clientX;
		const dy = e.clientY - down.clientY;
		if (!dragged && Math.hypot(dx, dy) < THRESHOLD) return;
		dragged = true;
		on.move(dx, dy, e);
	};
	const up = () => {
		removeEventListener('pointermove', move);
		removeEventListener('pointerup', up);
		removeEventListener('pointercancel', up);
		on.end(dragged);
	};
	addEventListener('pointermove', move);
	addEventListener('pointerup', up);
	addEventListener('pointercancel', up);
}
