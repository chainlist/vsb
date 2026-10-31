// Link cards: a lone web address pasted on the canvas becomes a card showing its page, or a YouTube
// video's player. The page is read first, where the backend can (the desktop), for its title,
// description and image; meanwhile a placeholder stands where the card will land.
import { linkPreview, type Clip, type Frame } from '#lib/api.js';
import { videoOf } from './video.js';

/** A link card's width, and its height with the page's image or without: room for the image in the
 * shape link previews are made for, two lines of title, three of description and the host. */
const W = 320;
const TALL = 320;
const SHORT = 160;
/** A YouTube video's card, lying flat or a Short standing upright: room for its player, two lines of
 * title and the host. */
const FLAT = { w: 480, h: 360 };
const UPRIGHT = { w: 240, h: 520 };

/** The placeholders of the pages being read, in world coordinates, each with its page's host. */
export const reading = $state({ pages: [] as (Frame & { id: number; host: string })[] });

let next = 0;
/** Counts the canvases opened: a page read for one that has closed lands nowhere. */
let opened = 0;

/** Lets go of the pages still being read for the canvas that closes. */
export function forgetReading() {
	opened++;
	reading.pages = [];
}

/** A web page's host, without `www.`; the address itself when it has none. */
export function hostOf(url: string) {
	try {
		return new URL(url).host.replace(/^www\./, '');
	} catch {
		return url;
	}
}

/** The web address a text is, alone, http or https, with nothing else but spaces around it; null for
 * any other text. */
export function webAddress(text: string) {
	const link = text.trim();
	return /^https?:\/\/\S+$/i.test(link) && URL.canParse(link) ? link : null;
}

/** A clip of one link card for `link`, its page read first, to land centered on `at`. Null when the
 * canvas closed meanwhile. A page that cannot be read makes a card without a preview. */
export async function linkClip(link: string, at: { x: number; y: number }): Promise<Clip | null> {
	const [id, canvas] = [next++, opened];
	const video = videoOf(link);
	const size = video ? (video.upright ? UPRIGHT : FLAT) : null;
	const [pw, ph] = size ? [size.w, size.h] : [W, TALL];
	reading.pages.push({ id, x: at.x - pw / 2, y: at.y - ph / 2, w: pw, h: ph, host: hostOf(link) });
	const preview = await linkPreview(link).catch(() => null);
	reading.pages = reading.pages.filter((p) => p.id !== id);
	if (canvas !== opened) return null;
	const { w, h } = size ?? { w: W, h: preview?.image ? TALL : SHORT };
	const card = { id: 'link', zone: null, x: 0, y: 0, w, h, text: null, link, ...(preview && { preview }) };
	return { x: 0, y: 0, w, h, zones: [], cards: [card], drawings: [], edges: [] };
}
