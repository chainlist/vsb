// The theme on screen: one set of design tokens per theme (#lib/themes/), picked by the
// data-theme attribute on the root element. Each vault names its own in its vault.json; screens
// outside a vault use the default.

export type Theme = { id: string; name: string };

export const THEMES: Theme[] = [
	{ id: 'studio', name: 'Studio' },
	{ id: 'pad', name: 'Engineering pad' },
	{ id: 'orbit', name: 'Orbit' },
	{ id: 'cairn', name: 'Cairn' }
];

export const DEFAULT_THEME = THEMES[0].id;

class Current {
	id = $state(DEFAULT_THEME);

	/** Shows a theme named by a vault: null, or one this build does not have, is the default. */
	use(id: string | null) {
		this.id = THEMES.some((t) => t.id === id) ? id! : DEFAULT_THEME;
	}
}

export const theme = new Current();
