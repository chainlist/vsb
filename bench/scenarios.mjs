// The hot paths, timed at the level of `#lib/api`, inside the app's own page. Each function is sent
// to the page as text, so it reaches nothing outside itself but its argument.

/** Opening the vault once, on an index built from nothing (the desktop) or a fresh database. */
export async function coldOpen({ base, vaultId }) {
	const api = await import(`${base}src/lib/api.ts`);
	const t = performance.now();
	await api.openVault(vaultId);
	await api.canvasContents();
	return { 'open (cold)': [performance.now() - t] };
}

export async function scenarios({ base, vaultId, search }) {
	const api = await import(`${base}src/lib/api.ts`);
	const results = {};
	async function time(name, run) {
		const t = performance.now();
		const out = await run();
		(results[name] ??= []).push(performance.now() - t);
		return out;
	}

	// Opening the vault, as the vault route's load does.
	for (let i = 0; i < 10; i++) {
		await time('open', async () => {
			await api.openVault(vaultId);
			await api.canvasContents();
		});
	}

	// Panning a 1600 by 1000 window, a quarter of it per step, querying what the canvas queries:
	// the area around the window grown by half its size on each side.
	const view = (cx, cy, zoom) => ({ minX: cx - 1600 / zoom, minY: cy - 1000 / zoom, maxX: cx + 1600 / zoom, maxY: cy + 1000 / zoom });
	const cellAt = (zoom) => (zoom < 0.4 ? 2 ** Math.ceil(Math.log2(160 / zoom)) : null);
	const across = (zoom, y, steps) => Array.from({ length: steps }, (_, i) => [2000 + (i * 400) / zoom, y]);
	async function pan(name, zoom, path) {
		for (const [cx, cy] of path) await time(name, () => api.queryViewport(view(cx, cy, zoom), 4 / zoom, cellAt(zoom)));
	}
	await pan('viewport 100%', 1, [...across(1, 1500, 60), ...across(1, 30000, 60)]);
	await pan('viewport 40%', 0.4, [...across(0.4, 6000, 40), ...across(0.4, 32000, 40)]);
	await pan('viewport 20%, clusters', 0.2, [...across(0.2, 12000, 30), ...across(0.2, 34000, 30)]);
	await pan('viewport 5%, clusters', 0.05, Array.from({ length: 40 }, (_, i) => [10000 + i * 1000, 23000]));

	// Moving a card and back: 20 in zones, 20 loose.
	const inZones = (await api.queryViewport(view(2000, 1500, 0.4), 0, null)).cards.filter((c) => c.zone);
	const loose = (await api.queryViewport(view(20000, 32000, 0.4), 0, null)).cards.filter((c) => !c.zone);
	for (const c of [...inZones.slice(0, 20), ...loose.slice(0, 20)]) {
		await time('move card', () => api.moveCards([{ id: c.id, x: c.x + 20, y: c.y }]));
		await time('move card', () => api.moveCards([{ id: c.id, x: c.x, y: c.y }]));
	}

	// Search as you type: every prefix of each phrase.
	for (let round = 0; round < 3; round++) {
		for (const phrase of search) {
			for (let i = 1; i <= phrase.length; i++) await time('search', () => api.search(phrase.slice(0, i), 0, 50));
		}
	}

	// The zone list: the outermost zones, then a few zones opened; then finding zones by name.
	for (let round = 0; round < 10; round++) {
		const top = await time('zone rows', () => api.zoneRows(null, 0, 50));
		for (const row of top.filter((z) => z.inner).slice(0, 5)) await time('zone rows', () => api.zoneRows(row.id, 0, 50));
	}
	for (let round = 0; round < 3; round++) {
		for (const word of ['harbor', 'pricing', 'ecole']) {
			for (let i = 1; i <= word.length; i++) await time('zone matches', () => api.zoneMatches(word.slice(0, i), 0, 50));
		}
	}

	// The Unplaced tray, a page at a time.
	for (let round = 0; round < 5; round++) {
		for (let offset = 0; offset < 500; offset += 50) await time('unplaced page', () => api.unplacedNotes(offset, 50));
	}
	return results;
}
