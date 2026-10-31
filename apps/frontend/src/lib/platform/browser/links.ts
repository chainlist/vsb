// Links, as on the desktop: web pages a card shows in place of a note, by their address. Pasting a
// lone address on the canvas places one, and Ctrl+click opens it in a new tab; the app never fetches it.

/** Whether an address is a web page's, http or https: a link can come from anywhere, a clip or a note,
 * and opening another scheme could start any program. */
export function isWebLink(url: string) {
	try {
		return ['http:', 'https:'].includes(new URL(url).protocol);
	} catch {
		return false;
	}
}

/** Opens a web page in a new tab, cut off from the app. Any other address is refused. */
export function openLink(url: string) {
	if (!isWebLink(url)) throw new Error('not a web link');
	window.open(url, '_blank', 'noopener');
}
