// Note text, as the desktop reads it: the title and excerpt drawn on cards, the file name made from
// the title, and the words search matches.

/** Characters kept in an excerpt. */
const EXCERPT_CHARS = 400;
/** Longest file stem made from a title. */
const STEM_CHARS = 80;
/** Names Windows reserves for devices, with or without an extension: kept out of file names, so a
 * vault stays writable as files everywhere. */
const RESERVED = new Set(['CON', 'PRN', 'AUX', 'NUL', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`COM${n}`, `LPT${n}`])]);

/** The first line of the body, without Markdown heading marks. */
export function title(body: string) {
	const line = body.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';
	return line.replace(/^#+/, '').trim();
}

/** The body after the title line, cut to a few hundred characters. */
export function excerpt(body: string) {
	const rest = body.trimStart();
	const cut = rest.indexOf('\n');
	return Array.from(cut < 0 ? '' : rest.slice(cut + 1).trim()).slice(0, EXCERPT_CHARS).join('');
}

/** File stem for a title: characters invalid on Windows are removed. */
export function fileStem(title: string) {
	const kept = Array.from(title.replace(/[<>:"/\\|?*\p{Cc}]/gu, '')).slice(0, STEM_CHARS).join('');
	// Windows drops trailing dots and spaces itself, which would change the name behind the app's back.
	const stem = kept.trim().replace(/[. ]+$/, '');
	if (stem === '') return 'Untitled';
	return RESERVED.has(stem.split('.')[0].toUpperCase()) ? `${stem}_` : stem;
}

/** `<dir>/<stem>.<ext>`, or `<stem> 2.<ext>`, `<stem> 3.<ext>`...: the first path not `taken`. */
export async function freeName(dir: string, stem: string, ext: string, taken: (path: string) => Promise<boolean>) {
	for (let n = 1; ; n++) {
		const path = n === 1 ? `${dir}/${stem}.${ext}` : `${dir}/${stem} ${n}.${ext}`;
		if (!(await taken(path))) return path;
	}
}

/** Whether a file stem already fits a title's stem: `Idea`, or a clash name like `Idea 2`. */
export function stemFits(current: string, stem: string) {
	const number = current.startsWith(`${stem} `) ? current.slice(stem.length + 1) : '';
	return current === stem || (/^\d+$/.test(number) && Number(number) >= 2);
}

/** The words of a text as search compares them: runs of letters and digits, accents and case left out. */
export function tokens(text: string) {
	const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	return folded.split(/[^\p{L}\p{N}]+/u).filter((t) => t !== '');
}

/** Each distinct word, once. */
export const wordSet = (text: string) => [...new Set(tokens(text))];

/** One word typed: what a text must hold for it. A word broken by marks (`l'école`) holds several:
 * all must be there, the last as the start of a word, as typed so far. */
export type Wanted = { whole: string[]; start: string };

/** What was typed, word by word. A run of marks alone is no word. */
export function wanted(text: string): Wanted[] {
	const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).map(tokens);
	return words.filter((t) => t.length).map((t) => ({ whole: t.slice(0, -1), start: t[t.length - 1] }));
}

/** Whether a set of words holds a word typed. */
export const holds = (words: string[], w: Wanted) =>
	w.whole.every((t) => words.includes(t)) && words.some((t) => t.startsWith(w.start));
