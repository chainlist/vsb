// The highlighter colors cards and zones take: one list for both, the same in every theme, kept in
// their files. No color (null) leaves a card on the theme's plain stock and a zone on its gray.

export const COLORS: [string | null, string][] = [
	[null, 'No color'],
	['#f5d76e', 'Yellow'],
	['#f4a261', 'Orange'],
	['#e98a9b', 'Pink'],
	['#a78bdb', 'Violet'],
	['#6fa8dc', 'Blue'],
	['#7cc49a', 'Green']
];

/** The value all of these share, or undefined when they differ or there are none. */
export function shared<T>(values: T[]): T | undefined {
	return values.length && values.every((v) => v === values[0]) ? values[0] : undefined;
}
