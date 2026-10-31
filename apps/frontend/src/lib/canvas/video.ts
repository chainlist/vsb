// YouTube videos: a link card whose address is a YouTube video's shows its player. The video is told by
// the address alone, so a card's file keeps nothing more for it. The rules are pure, so Node tests them
// straight from this source.

/** A YouTube video: its ID, where it starts in whole seconds, and whether it is a Short, which stands
 * upright (9:16) where other videos lie flat (16:9). */
export type Video = { id: string; start: number; upright: boolean };

/** A video's ID: eleven letters, digits, `-` or `_`. */
const ID = /^[\w-]{11}$/;
/** The hosts whose `watch`, `shorts`, `embed`, `live` and `v` paths name a video. */
const HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];

/** The YouTube video a web address shows: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`,
 * `embed/`, `live/` or `v/`, with its start time (`t` or `start`). Null for any other address. */
export function videoOf(url: string): Video | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
	const host = u.hostname.toLowerCase();
	const [first, second] = u.pathname.split('/').filter(Boolean);
	let id: string | null | undefined;
	if (host === 'youtu.be') id = first;
	else if (HOSTS.includes(host)) id = first === 'watch' ? u.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(first) ? second : null;
	if (!id || !ID.test(id)) return null;
	return { id, start: seconds(u.searchParams.get('t') ?? u.searchParams.get('start')), upright: host !== 'youtu.be' && first === 'shorts' };
}

/** A start time as YouTube writes it, `90`, `90s` or `1h2m30s`, in whole seconds; 0 for none. */
function seconds(t: string | null) {
	const found = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t ?? '');
	if (!found) return 0;
	return Number(found[1] ?? 0) * 3600 + Number(found[2] ?? 0) * 60 + Number(found[3] ?? 0);
}

/** Where the player of a video is: on youtube-nocookie.com, which keeps no cookie until the video
 * plays, playing at once from its start, with related videos from its own channel only. */
export function playerUrl(video: Video) {
	const query = new URLSearchParams({ autoplay: '1', rel: '0' });
	if (video.start) query.set('start', String(video.start));
	return `https://www.youtube-nocookie.com/embed/${video.id}?${query}`;
}
