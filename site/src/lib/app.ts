// What the site takes from the app itself, so it follows the app: its name, its highlighters and
// its themes. (Its look comes from the app's Studio theme, which the layout imports.)
import tauri from '../../../src-tauri/tauri.conf.json';
import { COLORS } from '../../../src/lib/canvas/colors.js';

export { THEMES } from '../../../src/lib/theme.svelte.js';

/** The app's name, as it is installed: renaming the app renames the site. */
export const NAME = tauri.productName;

export const REPO = 'chainlist/vsb';

/** A highlighter by its name in the app's list: Yellow, Orange, Pink, Violet, Blue or Green. */
export function highlighter(name: string) {
	const color = COLORS.find(([, n]) => n === name)?.[0];
	if (!color) throw new Error(`no highlighter named ${name}`);
	return color;
}
