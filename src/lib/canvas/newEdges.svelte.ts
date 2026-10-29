// The style every edge the app creates gets, set for each vault in its vault.json: an edge being drawn
// shows its shape and arrowheads.
import type { EdgeStyle } from '#lib/api.js';

class NewEdges {
	style = $state<EdgeStyle>({ shape: 'curved', arrow: 'to', stroke: 'solid' });
}

export const newEdges = new NewEdges();
