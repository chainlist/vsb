// The theme on screen: one set of design tokens per theme (#lib/themes/), picked by the
// data-theme attribute on the root element. Each vault names its own in its vault.json; screens
// outside a vault use the default. The paper's marks are picked the same way, by data-paper: the
// vault's own pick, or the theme's.

/** How the paper is marked: dots at the grid's crossings, ruled lines, small crosses at the
 * crossings, or nothing. */
export type Paper = 'dots' | 'grid' | 'cross' | 'empty';

export const PAPERS: { id: Paper; name: string }[] = [
	{ id: 'dots', name: 'Dots' },
	{ id: 'grid', name: 'Grid' },
	{ id: 'cross', name: 'Crosses' },
	{ id: 'empty', name: 'Empty' }
];

/** `paper`: how the theme marks its paper until the vault picks otherwise. */
export type Theme = { id: string; name: string; paper: Paper };

export const THEMES: Theme[] = [
	{ id: 'studio', name: 'Studio', paper: 'dots' },
	{ id: 'pad', name: 'Engineering pad', paper: 'grid' },
	{ id: 'orbit', name: 'Orbit', paper: 'grid' },
	{ id: 'cairn', name: 'Cairn', paper: 'dots' },
	{ id: 'wilds', name: 'Outer Wilds', paper: 'dots' }
];

export const DEFAULT_THEME = THEMES[0].id;

class Current {
	id = $state(DEFAULT_THEME);
	/** The paper the vault picked, or null for its theme's. */
	paper = $state<Paper | null>(null);

	/** The paper drawn in a theme: the vault's pick, or the theme's own. */
	paperIn(id: string) {
		return this.paper ?? THEMES.find((t) => t.id === id)!.paper;
	}

	/** Shows a theme and paper named by a vault: null, or one this build does not have, is the
	 * default. */
	use(id: string | null, paper: string | null = null) {
		this.id = THEMES.some((t) => t.id === id) ? id! : DEFAULT_THEME;
		this.paper = PAPERS.find((p) => p.id === paper)?.id ?? null;
	}
}

export const theme = new Current();
