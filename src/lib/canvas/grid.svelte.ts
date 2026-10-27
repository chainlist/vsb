// The graph paper under the canvas, and snapping to it: a card or zone being moved lands on a grid
// crossing, and the sides pulled to resize one land on grid lines. Each vault turns snapping on or
// off in its vault.json; it is on by default.

/** World size of a minor graph-paper square; major lines fall every 5 squares. */
export const GRID = 20;

class Snap {
	on = $state(true);
}

export const snap = new Snap();

/** The nearest grid line to a world coordinate. */
export const toGrid = (v: number) => Math.round(v / GRID) * GRID;
