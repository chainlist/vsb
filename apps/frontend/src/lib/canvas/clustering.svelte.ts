// Whether, zoomed out, loose cards are counted per cell of a grid and drawn as one marker each, or
// drawn as themselves, the default. Each vault says which in its vault.json.

class Clustering {
	on = $state(false);
}

export const clustering = new Clustering();
