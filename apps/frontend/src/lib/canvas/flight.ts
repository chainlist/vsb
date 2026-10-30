// A map's fly-to between two views: a far jump zooms out, travels and zooms back in, along the path
// that feels shortest (van Wijk and Nuij, "Smooth and efficient zooming and panning", 2003, as d3
// does it). A view is the world point at the middle of the screen and the world width on screen.

export type View = { x: number; y: number; w: number };

/** How far out the path zooms on the way: √2, the paper's and d3's choice. */
const RHO = Math.SQRT2;
const RHO2 = RHO * RHO;
const RHO4 = RHO2 * RHO2;

/** The path from `a` to `b`, from t = 0 to 1, and its length, in steps of zoom by e^RHO. */
export function flight(a: View, b: View) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const d2 = dx * dx + dy * dy;
	// The same middle: only the zoom changes.
	if (d2 < 1e-12) {
		const S = Math.log(b.w / a.w) / RHO;
		return { length: Math.abs(S), at: (t: number) => ({ x: a.x + t * dx, y: a.y + t * dy, w: a.w * Math.exp(RHO * t * S) }) };
	}
	const d = Math.sqrt(d2);
	const b0 = (b.w * b.w - a.w * a.w + RHO4 * d2) / (2 * a.w * RHO2 * d);
	const b1 = (b.w * b.w - a.w * a.w - RHO4 * d2) / (2 * b.w * RHO2 * d);
	const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
	const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
	const S = (r1 - r0) / RHO;
	return {
		length: S,
		at(t: number): View {
			const s = t * S;
			const u = (a.w / (RHO2 * d)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0));
			return { x: a.x + u * dx, y: a.y + u * dy, w: (a.w * Math.cosh(r0)) / Math.cosh(RHO * s + r0) };
		}
	};
}
