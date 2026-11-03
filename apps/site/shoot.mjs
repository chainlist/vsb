// Takes the site's screenshots, into src/lib/shots: builds two demo vaults in the web build through
// `#lib/api`, as the app would, then frames and shoots the canvas over the Chrome DevTools Protocol.
// With `pnpm dev:web` running, and Chrome started on a profile of its own (in a short folder:
// Chrome fails to open IndexedDB under a long path), as the bench does:
//
//   chrome --headless=new --hide-scrollbars --remote-debugging-port=9226 --user-data-dir=<short temp folder>
//   node site/shoot.mjs --port 9226
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { connect } from '../../tools/bench/cdp.mjs';

const { values: args } = parseArgs({
	options: { port: { type: 'string' }, app: { type: 'string', default: 'http://localhost:5175/vsb/web/' } }
});
const base = new URL(args.app).pathname;
const out = new URL('./src/lib/shots/', import.meta.url);
/** The thesis's three zones, in world units: what most shots frame. */
const THESIS = { minX: 0, minY: 0, maxX: 1500, maxY: 660 };
/** The case's cards, in world units. */
const CASE = { minX: 0, minY: 0, maxX: 1560, maxY: 880 };
/** The pages pasted as link cards in the kinds vault: a page, and a YouTube video. */
const PAGES = { page: 'https://en.wikipedia.org/wiki/Hippocampus', video: 'https://www.youtube.com/watch?v=5MuIMqhT8DM' };

/** What the desktop keeps of a page whose address is pasted, read as `apps/desktop/src/links.rs`
 * reads it: its head's title, description and image, Open Graph's tags first, then Twitter's, then
 * plain HTML. The web build reads no page, so the kinds vault takes its link cards' previews from
 * here, the image as base64 with the name it is kept under. */
async function readPage(url) {
	const agent = 'Mozilla/5.0 (compatible; Scree; link preview)';
	const html = await (await fetch(url, { headers: { 'User-Agent': agent, Accept: 'text/html,application/xhtml+xml' } })).text();
	const body = html.search(/<body\b/i);
	const head = body < 0 ? html : html.slice(0, body);
	const metas = [...head.matchAll(/<meta\b([^>]*)>/gi)].map((m) =>
		Object.fromEntries([...m[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((a) => [a[1].toLowerCase(), a[2] ?? a[3] ?? a[4]]))
	);
	const meta = (...keys) => keys.map((k) => metas.find((m) => (m.property ?? m.name)?.toLowerCase() === k && m.content?.trim())?.content).find(Boolean);
	const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
	const decode = (text) =>
		text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, r) =>
			r[0] === '#' ? String.fromCodePoint(parseInt(r.slice(r[1] === 'x' || r[1] === 'X' ? 2 : 1), r[1] === 'x' || r[1] === 'X' ? 16 : 10)) : (named[r] ?? all)
		);
	const clean = (text, max) => {
		const t = text === undefined ? '' : decode(text).split(/\s+/).filter(Boolean).join(' ');
		return !t ? undefined : [...t].length > max ? [...t].slice(0, max - 1).join('').trimEnd() + '…' : t;
	};
	const src = meta('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src');
	let image;
	if (src) {
		const res = await fetch(new URL(decode(src).trim(), url), { headers: { 'User-Agent': agent } });
		const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
		const ext = types[res.headers.get('content-type')?.split(';')[0]];
		if (ext) image = { name: `${new URL(url).host.replace(/^www\./, '')}.${ext}`, bytes: Buffer.from(await res.arrayBuffer()).toString('base64') };
	}
	return {
		title: clean(meta('og:title', 'twitter:title') ?? /<title\b[^>]*>([^<]*)/i.exec(head)?.[1], 200),
		description: clean(meta('og:description', 'twitter:description', 'description'), 500),
		image
	};
}

/** Runs in the page: the demo vault, a thesis on sleep and memory, with a reading list, a lab
 * notebook, teaching and meetings around it, so that zoomed out it is a map. Returns its ID and the
 * links across the map, made later so they stay out of the shots of the thesis. */
async function seed({ base }) {
	const api = await import(`${base}src/lib/api.ts`);
	const { createVault } = await import(`${base}src/lib/platform/browser/vaults.ts`);
	const { id } = await createVault('Thesis');
	await api.openVault(id);
	// A new vault opens on its onboarding until it has been through it.
	await api.setVaultOnboarded();
	// Its map shows loose cards clustered, which a vault does only once it says so.
	await api.setVaultClusterCards(true);
	await api.setDevicePen({ color: '#f4a261', width: 3, eraser: 'stroke' });
	const [yellow, orange, pink, violet, blue, green] = ['#f5d76e', '#f4a261', '#e98a9b', '#a78bdb', '#6fa8dc', '#7cc49a'];

	async function zone(name, x, y, w, h, color = null) {
		const { id } = await api.createZone(x, y, w, h);
		await api.renameZone(id, name);
		if (color) await api.colorItems([], [id], [], color);
		return id;
	}
	async function card(text, x, y, w = 300, h = 120, color = null) {
		const id = await api.createCard(x, y, w, h);
		await api.createNoteForCard(id, text);
		if (color) await api.colorItems([id], [], [], color);
		return id;
	}
	async function edge(from, to, { label, stroke, shape, arrow } = {}) {
		const { id } = await api.createEdge(from, to);
		if (label) await api.labelEdge(id, label);
		if (stroke) await api.strokeEdges([id], stroke);
		if (shape) await api.shapeEdges([id], shape);
		if (arrow) await api.arrowEdges([id], arrow);
	}
	/** A hand-drawn loop around a center, a little past where it started, pressed unevenly. */
	async function loop(cx, cy, rx, ry, color) {
		const points = [];
		for (let t = -2.2; t <= -2.2 + Math.PI * 2 + 0.5; t += 0.04) {
			const wobble = 1 + 0.025 * Math.sin(t * 3) + 0.015 * Math.sin(t * 7);
			const [x, y] = [Math.cos(t) * rx * wobble, Math.sin(t) * ry * wobble];
			const tilt = -0.05;
			points.push(cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt), 0.45 + 0.2 * Math.sin(t * 2));
		}
		await api.addStroke(points, color, 3);
	}
	async function line(from, to, color, width = 3) {
		const points = [];
		for (let i = 0; i <= 12; i++) {
			const t = i / 12;
			points.push(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + Math.sin(t * Math.PI) * 3, 0.4 + 0.3 * Math.sin(t * Math.PI));
		}
		await api.addStroke(points, color, width);
	}

	// The thesis: sources, the ideas they support, and the chapters that argue them.
	await zone('Sources', 0, 0, 420, 660, blue);
	const stickgold = await card('Stickgold 2005\n\nSleep-dependent memory consolidation. Skills learned in the day improve overnight, without more practice.', 40, 80, 340, 140);
	const diekelmann = await card('Diekelmann & Born 2010\n\nThe memory function of sleep. Slow-wave sleep replays new memories; REM may help them settle.', 40, 260, 340, 140);
	const rasch = await card("Rasch & Born 2013\n\nAbout sleep's role in memory. The long review: **start here**.", 40, 440, 340, 140);
	await zone('Ideas', 520, 80, 440, 500, violet);
	const replay = await card('Replay\n\nWhile we sleep, the hippocampus plays the day back to the cortex, which keeps what matters.', 560, 160, 360, 140);
	const naps = await card("Do naps count?\n\nIf replay needs slow-wave sleep, a 90-minute nap should do part of a night's work.", 560, 380, 360, 140, yellow);
	await zone('Chapters', 1060, 0, 440, 660, green);
	const why = await card('1. Why sleep', 1100, 80, 360, 80);
	const consolidation = await card('2. Replay and consolidation', 1100, 200, 360, 80);
	const study = await card('3. The nap study\n\n- 24 students learn word pairs\n- half nap, half stay awake\n- everyone is tested at 6 pm', 1100, 320, 360, 160);
	const meaning = await card('4. What it means', 1100, 520, 360, 80);
	await edge(stickgold, replay, { label: 'evidence' });
	await edge(diekelmann, replay);
	await edge(replay, naps, { stroke: 'dashed', label: 'raises' });
	await edge(replay, consolidation, { label: 'argued in' });
	await edge(naps, study, { label: 'tested in' });
	await edge(why, consolidation, { shape: 'straight' });
	await edge(consolidation, study, { shape: 'straight' });
	await edge(study, meaning, { shape: 'straight' });
	await loop(740, 450, 215, 100, orange);
	await line([52, 534], [122, 532], orange);

	// Around it, what a thesis gathers: enough to make a map when zoomed out.
	const reading = [
		'Sleep spindles and learning', 'REM sleep and emotion', 'A night without sleep', 'Napping in older adults',
		'Memory reconsolidation', 'Targeted memory reactivation', 'Dreams as replay', 'Circadian rhythm basics',
		'Sleep pressure and adenosine', 'Scoring sleep stages', 'EEG for beginners', 'Word-pair tasks',
		'Sleep and the immune system', 'Students and sleep debt', 'Caffeine and slow waves', 'Interference theory',
		'Forgetting curves', 'Hippocampus and cortex', 'Sharp-wave ripples', 'Sleep in rats and birds',
		'Measuring recall', 'Statistics refresher', 'Effect sizes', 'Open data in sleep research'
	];
	await zone('Reading list', -1640, -1120, 1360, 840, yellow);
	const books = [];
	for (const [i, title] of reading.entries())
		books.push(await card(`${title}

Notes to come.`, -1620 + (i % 6) * 220, -1060 + Math.floor(i / 6) * 200, 180, 160));
	await zone('Lab notebook', 1960, -1160, 1520, 1000, blue);
	await zone('Pilot', 2000, -1080, 700, 880);
	await zone('Main run', 2740, -1080, 700, 880);
	const sessions = [];
	for (let i = 0; i < 16; i++) {
		const x = (i < 8 ? 2020 : 2760) + (i % 2) * 340;
		sessions.push(await card(`Session ${i + 1}

Three people. Recordings clean.`, x, -1020 + (Math.floor(i / 2) % 4) * 200, 300, 160));
	}
	await zone('Teaching', -1560, 940, 1120, 920, pink);
	const weeks = [];
	for (let i = 0; i < 12; i++) weeks.push(await card(`Week ${i + 1}`, -1520 + (i % 3) * 360, 1020 + Math.floor(i / 3) * 200, 320, 120));
	await zone('Meetings', 2040, 1000, 1120, 760);
	const meetings = [];
	for (let i = 0; i < 9; i++) meetings.push(await card(`Supervision ${i + 1}`, 2080 + (i % 3) * 360, 1080 + Math.floor(i / 3) * 200, 320, 120));
	// Loose cards, each clump in one cell of the zoomed-out grid (1024 world units), which clusters it.
	const clumps = [];
	for (const [x, y, columns, n] of [[1060, -980, 3, 9], [120, 1100, 3, 6], [2100, 140, 3, 12], [-960, 160, 2, 5]]) {
		const clump = [];
		for (let i = 0; i < n; i++) clump.push(await card(`Thought ${i + 1}`, x + (i % columns) * 260, y + Math.floor(i / columns) * 180, 220, 140));
		clumps.push(clump);
	}
	const links = [
		...books.slice(0, 5).map((b) => [b, rasch]),
		...sessions.slice(8, 12).map((s) => [s, study]),
		...weeks.slice(0, 3).map((w) => [w, replay]),
		...clumps[2].slice(0, 3).map((t) => [t, sessions[0]]),
		...meetings.slice(0, 2).map((m) => [m, meaning]),
		...clumps[0].slice(0, 2).map((t) => [t, books[5]]),
		[books[10], sessions[1]]
	];
	// Notes with no card, for the Unplaced tray.
	for (const text of ['Ask the lab about EEG caps', 'Title ideas', 'Conference deadlines']) {
		const id = await api.createCard(-100000, -100000, 240, 140);
		await api.createNoteForCard(id, text);
		await api.deleteCards([id]);
	}
	return { id, links };
}

/** Runs in the page: draws the links across the map. */
async function link({ base, links }) {
	const api = await import(`${base}src/lib/api.ts`);
	for (const [from, to] of links) await api.createEdge(from, to);
}

/** Runs in the page: the second demo vault, a case on an Investigation board, its suspects and clues
 * joined by red thread to what went missing. Returns its ID. */
async function seedCase({ base }) {
	const api = await import(`${base}src/lib/api.ts`);
	const { createVault } = await import(`${base}src/lib/platform/browser/vaults.ts`);
	const { POSTIT_COLOR } = await import(`${base}src/lib/canvas/colors.ts`);
	const { id } = await createVault('Case');
	await api.openVault(id);
	await api.setVaultOnboarded();
	await api.setVaultTheme('board');
	await api.setVaultEdgeStyle({ shape: 'thread', arrow: 'to', stroke: 'solid' });

	async function card(text, x, y, w = 300, h = 120, kind = 'note', color = null) {
		const id = await api.createCard(x, y, w, h, kind, color);
		await api.createNoteForCard(id, text);
		return id;
	}
	const postit = (text, x, y) => card(text, x, y, 200, 200, 'postit', POSTIT_COLOR);
	async function thread(from, to, label) {
		const { id } = await api.createEdge(from, to);
		if (label) await api.labelEdge(id, label);
	}

	// A thread hangs from the top of each card, over whatever is below: the short notes and the cards
	// a thread reaches from above keep it off most of the writing.
	const manuscript = await card('The missing manuscript\n\nThe only copy.\n\nGone between 9 and 11 pm.', 590, 300, 380, 150);
	const safe = await postit('Who knew the safe code?', 40, 0);
	const editor = await card('The editor\n\nLeft the party at 10.', 0, 300, 340);
	const train = await postit('Check the 10:40 train', 20, 470);
	const ticket = await card('Torn train ticket\n\nLondon, 10:40 pm.', 380, 660);
	const footprints = await card('Muddy footprints\n\nGarden door to study.', 660, 0);
	const nephew = await card('The nephew\n\nIn the garden, he says.', 1260, 40);
	const key = await card('The study key\n\nBack by midnight.', 760, 600, 260, 110);
	const housekeeper = await card('The housekeeper\n\nHolds the other key.', 1260, 760);
	await thread(editor, manuscript, 'motive');
	await thread(nephew, manuscript, 'motive');
	await thread(housekeeper, manuscript, 'access');
	await thread(safe, manuscript);
	await thread(editor, ticket);
	await thread(train, ticket);
	await thread(footprints, nephew, 'garden');
	await thread(key, housekeeper);
	return id;
}

/** Where each scene of the kinds vault starts, in world units, far enough apart to be shot alone. */
const SCENES = { note: 0, postit: 3000, mindmap: 6000, image: 9000, link: 12000 };

/** Runs in the page: the third demo vault, a card of each kind from the thesis, each in a scene of its
 * own along the x axis, for the kinds picker, the link cards with their pages as `readPage` read them.
 * Returns its ID. */
async function seedKinds({ base, scenes, pages }) {
	const api = await import(`${base}src/lib/api.ts`);
	const { createVault } = await import(`${base}src/lib/platform/browser/vaults.ts`);
	const { POSTIT_COLOR } = await import(`${base}src/lib/canvas/colors.ts`);
	const { id } = await createVault('Kinds');
	await api.openVault(id);
	await api.setVaultOnboarded();
	const [pink, green, yellow] = ['#e98a9b', '#7cc49a', '#f5d76e'];

	async function card(text, x, y, w = 300, h = 120, kind = 'note', color = null) {
		const id = await api.createCard(x, y, w, h, kind, color);
		await api.createNoteForCard(id, text);
		return id;
	}
	async function edge(from, to, { label, stroke } = {}) {
		const { id } = await api.createEdge(from, to);
		if (label) await api.labelEdge(id, label);
		if (stroke) await api.strokeEdges([id], stroke);
	}

	// An index card: its first line the title, the rest Markdown.
	let x = scenes.note;
	const stickgold = await card('Stickgold 2005\n\nSkills learned in the day improve overnight, without more practice.', x - 440, 50, 340, 150);
	const replay = await card(
		'Replay\n\nWhile we sleep, the hippocampus plays the day back to the cortex.\n\n- strongest in **slow-wave sleep**\n- carried by *sharp-wave ripples*\n- measured with `EEG`',
		x,
		0,
		380,
		250
	);
	const naps = await card("Do naps count?\n\nIf replay needs slow-wave sleep, a nap should do part of a night's work.", x + 480, 60, 340, 150);
	await api.colorItems([naps], [], [], yellow);
	await edge(stickgold, replay, { label: 'evidence' });
	await edge(replay, naps, { label: 'raises', stroke: 'dashed' });

	// Post-its stuck around the study's card, each in its own color.
	x = scenes.postit;
	await card('3. The nap study\n\n- 24 students learn word pairs\n- half nap, half stay awake\n- everyone is tested at 6 pm', x, 0, 380, 200);
	await card('Book the sleep lab for March', x + 330, -110, 200, 200, 'postit', POSTIT_COLOR);
	await card('Ask the lab about EEG caps', x - 230, 150, 200, 200, 'postit', pink);
	await card('24 students, not 20!', x + 420, 170, 200, 200, 'postit', green);

	// A mindmap: the study planned as a map, its card taking the map's size as it is drawn.
	x = scenes.mindmap;
	await card(
		'# The nap study\n\n## Question\n- Do naps help memory?\n\n## Method\n- 24 students\n- Word pairs at 1 pm\n- Nap or stay awake\n\n## Measures\n- Recall at 6 pm\n- EEG during the nap\n\n## Next\n- Ethics approval\n- Pilot in March\n',
		x,
		0,
		80,
		64,
		'mindmap'
	);

	// An image: a hypnogram of one night, as a chart exported from the sleep lab's software.
	x = scenes.image;
	const [w, h] = [960, 480];
	const chart = new OffscreenCanvas(w, h);
	const g = chart.getContext('2d');
	g.fillStyle = '#ffffff';
	g.fillRect(0, 0, w, h);
	const stages = ['Wake', 'REM', 'N1', 'N2', 'N3'];
	const [left, top, right, bottom] = [110, 80, 920, 400];
	const yOf = (stage) => top + (stage * (bottom - top)) / (stages.length - 1);
	const xOf = (minute) => left + (minute * (right - left)) / 480;
	g.font = '600 26px sans-serif';
	g.fillStyle = '#1f2933';
	g.fillText('Night 1, sleeper 7', left, 46);
	g.font = '20px sans-serif';
	g.fillStyle = '#52606d';
	g.textAlign = 'right';
	g.textBaseline = 'middle';
	g.strokeStyle = '#e4e7eb';
	g.lineWidth = 1;
	for (const [i, name] of stages.entries()) {
		g.fillText(name, left - 16, yOf(i));
		g.beginPath();
		g.moveTo(left, yOf(i));
		g.lineTo(right, yOf(i));
		g.stroke();
	}
	g.textAlign = 'center';
	g.textBaseline = 'top';
	for (let hour = 0; hour <= 8; hour++) g.fillText(`${hour} h`, xOf(hour * 60), bottom + 20);
	// Minutes from lights out and the stage from then: deep sleep early, longer REM toward morning.
	const night = [
		[0, 0], [10, 2], [18, 3], [30, 4], [75, 3], [85, 1], [95, 3], [110, 4], [150, 3], [170, 1], [195, 3], [215, 4], [235, 3],
		[255, 1], [290, 3], [310, 2], [320, 3], [345, 1], [385, 3], [400, 0], [405, 2], [415, 3], [430, 1], [470, 0], [480, 0]
	];
	g.strokeStyle = '#2f6f8f';
	g.lineWidth = 3;
	g.beginPath();
	for (const [i, [minute, stage]] of night.entries()) {
		if (i === 0) {
			g.moveTo(xOf(minute), yOf(stage));
		} else {
			g.lineTo(xOf(minute), yOf(night[i - 1][1]));
			g.lineTo(xOf(minute), yOf(stage));
		}
	}
	g.stroke();
	g.strokeStyle = '#c0392b';
	g.lineWidth = 7;
	for (const [i, [minute, stage]] of night.entries()) {
		if (stage !== 1) continue;
		g.beginPath();
		g.moveTo(xOf(minute), yOf(1));
		g.lineTo(xOf(night[i + 1][0]), yOf(1));
		g.stroke();
	}
	const bytes = await (await chart.convertToBlob({ type: 'image/png' })).arrayBuffer();
	const image = await api.placeFile(await api.writeImage('Hypnogram night 1.png', bytes), x, 0, 480, 240);
	const night1 = await card('Night 1, sleeper 7\n\nDeep sleep in the first two cycles, REM growing toward morning: a textbook night.', x + 580, 40, 340, 160);
	await edge(image.id, night1, { label: 'scored as' });

	// Links: a web address pasted becomes a card showing its page, as the desktop shows it, at the size
	// the desktop gives it (links.svelte.ts); a YouTube video's card is its thumbnail, ready to play.
	x = scenes.link;
	const kept = async ({ title, description, image }) => ({
		...(title && { title }),
		...(description && { description }),
		...(image && { image: await api.writeImage(image.name, Uint8Array.from(atob(image.bytes), (c) => c.charCodeAt(0)).buffer) })
	});
	const link = async (id, y, w, h) => ({ id, kind: 'link', zone: null, x: 0, y, w, h, text: null, link: pages[id].url, preview: await kept(pages[id]) });
	const reading = await card('Read next\n\nBefore the pilot: the background, then the talk that sums it up.', x - 440, 120, 340, 150);
	const pasted = await api.pasteItems(
		{
			x: 0,
			y: 0,
			w: 480,
			h: 630,
			zones: [],
			drawings: [],
			edges: [],
			cards: [await link('page', 0, 320, pages.page.image ? 320 : 160), await link('video', 360, 480, 270)]
		},
		x,
		-120
	);
	await edge(reading, pasted.ids[0], { label: 'background' });
	await edge(reading, pasted.ids[1], { label: 'the talk' });
	return id;
}

const page = await connect(Number(args.port));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits until `expression` is true in the page. */
async function until(expression, timeout = 20000) {
	for (const end = Date.now() + timeout; Date.now() < end; await wait(200))
		if (await page.evaluate(expression).catch(() => false)) return;
	throw new Error(`timed out waiting for ${expression}`);
}
async function go(url) {
	await page.send('Page.navigate', { url });
	await wait(500);
	await until(`document.readyState === 'complete'`);
}
/** Opens the vault's canvas and waits for its cards or zones. */
async function open(path = '') {
	await go(`${args.app}vault/${vault}${path}`);
	await until(`document.querySelector('.card, .zone, .cluster') !== null`);
	await wait(1500);
}
/** Frames a world rectangle as fit does, or centers on a point at a zoom past what fit allows. */
async function view(at) {
	// The canvas may still be loading what it shows: its query then fails, with a plain string.
	for (let attempt = 1; ; attempt++) {
		const failed = await page.evaluate(`(async () => {
			const { camera } = await import('${base}src/lib/canvas/camera.svelte.ts');
			const { items } = await import('${base}src/lib/canvas/items.svelte.ts');
			const at = ${JSON.stringify(at)};
			if ('minX' in at) camera.fit(at);
			else Object.assign(camera, { zoom: at.zoom, x: at.x - camera.width / 2 / at.zoom, y: at.y - camera.height / 2 / at.zoom });
			return items.refresh().then(() => null, String);
		})()`);
		if (!failed) break;
		if (attempt === 5) throw new Error(failed);
		await wait(1000);
	}
	await wait(1000);
}
async function key(key, { code = `Key${key.toUpperCase()}`, ctrl = false } = {}) {
	const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : { Escape: 27 }[key];
	const common = { key, code, windowsVirtualKeyCode: vk, modifiers: ctrl ? 2 : 0 };
	await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
	await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
	await wait(500);
}
async function mouse(x, y) {
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}
/** Clicks the card whose text starts with `title`. */
async function click(title) {
	const { x, y } = await page.evaluate(`(() => {
		const card = [...document.querySelectorAll('.card')].find((c) => c.textContent.trim().startsWith(${JSON.stringify(title)}));
		const r = card.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	})()`);
	await mouse(x, y);
	for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
	await wait(600);
}
async function shoot(name) {
	const { data } = await page.send('Page.captureScreenshot', { format: 'webp', quality: 86 }).then((m) => m.result);
	writeFileSync(new URL(`${name}.webp`, out), Buffer.from(data, 'base64'));
	console.log(`${name}.webp`);
}

await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await go(args.app);
let { id: vault, links } = await page.evaluate(`(${seed})(${JSON.stringify({ base })})`);

await open();
await view(THESIS);
await mouse(1400, 880);
await shoot('canvas');

await click('Replay');
await mouse(1400, 880);
await shoot('links');
await key('Escape', { code: 'Escape' });

await mouse(720, 450);
await key('b', { ctrl: true });
await page.send('Input.insertText', { text: 'Do naps count? -> Pilot study -> Main study --> Write-up\nPilot study .-> Ethics approval\nMain study <=> EEG lab' });
await wait(800);
await shoot('builder');
await key('Escape', { code: 'Escape' });

await view({ x: 904, y: 430, zoom: 1.4 });
await key('p');
await mouse(1400, 880);
await shoot('pen');
await key('p');

// Search opens with the keyboard in its field; Mod+L opens the zone list beside it.
await open('/search');
await view({ x: 740, y: 330, zoom: 0.8 });
await page.send('Input.insertText', { text: 'replay' });
await wait(800);
await key('l', { ctrl: true });
await wait(800);
await shoot('panels');
// The zone list stays open, remembered for the vault: close it again.
await key('l', { ctrl: true });

for (const theme of ['pad', 'orbit', 'cairn', 'wilds', 'board', null]) {
	await page.evaluate(`import('${base}src/lib/api.ts').then((api) => api.setVaultTheme(${JSON.stringify(theme)}))`);
	await open();
	if (!theme) break;
	await view(THESIS);
	await mouse(1400, 880);
	await shoot(`theme-${theme}`);
}

// Zoomed out, the map: zones collapse to previews, loose cards cluster, links bundle.
await page.evaluate(`(${link})(${JSON.stringify({ base, links })})`);
await open();
await view({ x: 730, y: 330, zoom: 0.25 });
await mouse(1400, 880);
await shoot('map');

// The case, on cork and red thread.
await go(args.app);
vault = await page.evaluate(`(${seedCase})(${JSON.stringify({ base })})`);
await open();
await view(CASE);
await mouse(1400, 880);
await shoot('investigation');

// A card of each kind, each scene framed up close, at most 130%. Twice: a mindmap takes its map's size
// as it is drawn.
await go(args.app);
const pages = {};
for (const [id, url] of Object.entries(PAGES)) pages[id] = { url, ...(await readPage(url)) };
vault = await page.evaluate(`(${seedKinds})(${JSON.stringify({ base, scenes: SCENES, pages })})`);
await open();
for (const [kind, x] of Object.entries(SCENES)) {
	for (let pass = 0; pass < 2; pass++) {
		const r = await page.evaluate(`(async () => {
			const api = await import('${base}src/lib/api.ts');
			const { cards } = await api.queryViewport({ minX: ${x - 1500}, minY: -1500, maxX: ${x + 1500}, maxY: 1500 }, 0, null);
			return { minX: Math.min(...cards.map((c) => c.x)), minY: Math.min(...cards.map((c) => c.y)), maxX: Math.max(...cards.map((c) => c.x + c.w)), maxY: Math.max(...cards.map((c) => c.y + c.h)) };
		})()`);
		const zoom = Math.min(1.3, 1200 / (r.maxX - r.minX), 700 / (r.maxY - r.minY));
		await view({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2, zoom });
	}
	await mouse(1400, 880);
	await shoot(`kind-${kind}`);
}
page.close();
