// Whether each mindmap is shrunk to fit its card, or its card takes its map's size, the default. Each
// vault says which in its vault.json.

class MindmapFit {
	on = $state(false);
}

export const mindmapFit = new MindmapFit();
