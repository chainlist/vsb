// Takes the site's screenshots: builds a demo vault in the web build through `#lib/api`, as the
// app would, then frames and shoots the canvas over the Chrome DevTools Protocol, into site/shots.
// With `pnpm dev:web` running, and Chrome started on a profile of its own (in a short folder:
// Chrome fails to open IndexedDB under a long path), as the bench does:
//
//   chrome --headless=new --hide-scrollbars --remote-debugging-port=9226 --user-data-dir=<short temp folder>
//   node site/shoot.mjs --port 9226
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { connect } from '../bench/cdp.mjs';

const { values: args } = parseArgs({
	options: { port: { type: 'string' }, app: { type: 'string', default: 'http://localhost:5175/vsb/web/' } }
});
const base = new URL(args.app).pathname;
const out = new URL('./shots/', import.meta.url);
/** The thesis's three zones, in world units: what most shots frame. */
const THESIS = { minX: 0, minY: 0, maxX: 1500, maxY: 660 };

/** Runs in the page: the demo vault, a thesis on sleep and memory, with a reading list, a lab
 * notebook, teaching and meetings around it, so that zoomed out it is a map. Returns its ID and the
 * links across the map, made later so they stay out of the shots of the thesis. */
async function seed({ base }) {
	const api = await import(`${base}src/lib/api.ts`);
	const { createVault } = await import(`${base}src/lib/platform/browser/vaults.ts`);
	const { id } = await createVault('Thesis');
	await api.openVault(id);
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
const { id: vault, links } = await page.evaluate(`(${seed})(${JSON.stringify({ base })})`);

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

for (const theme of ['pad', 'orbit', 'cairn', 'wilds', null]) {
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
page.close();
