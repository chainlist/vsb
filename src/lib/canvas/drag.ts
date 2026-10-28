// Pointer tracking shared by panning, moving, resizing and tapping. Reports the travel since the press
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

/** Runs `then` when a press is released without dragging. The press goes on to the canvas, which
 * pans while it drags. */
export function tap(down: PointerEvent, then: () => void) {
	if (down.button !== 0) return;
	track(down, {
		move() {},
		end(dragged) {
			if (!dragged) then();
		}
	});
}
