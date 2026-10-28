// The browser backend's notes, vaults and device settings: the desktop's session and note tests,
// and what only the browser has: vaults by name, and one tab per vault.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, createVault, file, fresh, noteCard, put, WORLD, zoneAt } from './browser.mjs';

test('placing a card saves an empty card, in its zone with relative coordinates', async () => {
	await fresh();
	await put(zoneAt('Z', null, 500, 500, 400, 400));
	const loose = await api.createCard(10, 20, 200, 80);
	assert.deepEqual(await file('card', loose), { note: null, zone: null, x: 10, y: 20, w: 200, h: 80 });
	const inside = await api.createCard(600, 650, 100, 50);
	const card = await file('card', inside);
	assert.deepEqual([card.zone, card.x, card.y], ['Z', 100, 150]);
	assert.deepEqual((await api.itemBox('card', inside)).minX, 600);
});

test('the first save writes the note, then points the card at it', async () => {
	await fresh();
	const card = await api.createCard(0, 0, 200, 80);
	const note = await api.createNoteForCard(card, 'Competitor scan\n\nPrices');
	assert.equal((await file('card', card)).note, note);
	assert.equal(await api.readNote(note), 'Competitor scan\n\nPrices');
	const [view] = (await api.queryViewport(WORLD, 0, null)).cards;
	assert.deepEqual([view.title, view.excerpt, view.resolved], ['Competitor scan', 'Prices', true]);
	await assert.rejects(api.createNoteForCard(card, 'again'));
});

test('saving redraws the card; a title clash adds a number', async () => {
	await fresh();
	const first = await noteCard('Idea');
	const second = await noteCard('Idea', 300, 0);
	const paths = async () => (await api.search('idea', 0, 50)).map((e) => e.path).sort();
	assert.deepEqual(await paths(), ['notes/Idea 2.md', 'notes/Idea.md']);
	assert.equal(await api.saveNote(first.note, 'Idea\nNew body'), true);
	const view = (await api.queryViewport(WORLD, 0, null)).cards.find((c) => c.id === first.card);
	assert.equal(view.excerpt, 'New body');
	assert.ok(second);
});

test('discarding empties the card, then deletes the note', async () => {
	await fresh();
	const { card, note } = await noteCard('x');
	await assert.rejects(api.discardNote(card, note), /not empty/, 'a note with content is never discarded');
	await api.saveNote(note, '  \n');
	await api.discardNote(card, note);
	assert.equal((await file('card', card)).note, null);
	await assert.rejects(api.readNote(note), /note not found/);
	assert.deepEqual(await api.unplacedNotes(0, 50), []);
});

test('renaming follows the title, keeps a clash name and takes a change of case', async () => {
	await fresh();
	const { note } = await noteCard('Draft');
	const path = async (id) => (await api.search(id, 0, 50)).find((e) => e.kind === 'note')?.path;
	await api.saveNote(note, 'Final plan\nmore');
	assert.equal(await path('final'), 'notes/Draft.md', 'no rename on save');
	await api.renameNote(note);
	assert.equal(await path('final'), 'notes/Final plan.md');
	await api.renameNote(note);
	assert.equal(await path('final'), 'notes/Final plan.md');

	await noteCard('Idea');
	const clash = await noteCard('Idea');
	await api.renameNote(clash.note);
	const lower = await noteCard('plan', 0, 500);
	await api.saveNote(lower.note, 'Plan');
	await api.renameNote(lower.note);
	assert.deepEqual((await api.search('idea', 0, 50)).map((e) => e.path).sort(), ['notes/Idea 2.md', 'notes/Idea.md']);
	const plans = (await api.search('plan', 0, 50)).map((e) => e.path).sort();
	assert.deepEqual(plans, ['notes/Final plan.md', 'notes/Plan.md'], 'a case change of its own name');
});

test('a file name leaves out what Windows cannot hold', async () => {
	await fresh();
	const { note } = await noteCard('# What? A <plan>: CON.');
	assert.deepEqual((await api.search('what', 0, 50)).map((e) => e.path), ['notes/What A plan CON.md']);
	await noteCard('CON');
	assert.deepEqual((await api.search('con', 0, 50)).map((e) => e.path).sort(), ['notes/CON_.md', 'notes/What A plan CON.md']);
	assert.ok(note);
});

test('vaults are chosen by name, most recent first, and a name already used opens that vault', async () => {
	const a = await createVault('Work notes');
	const b = await createVault('Garden');
	assert.deepEqual((await api.listVaults()).slice(0, 2).map((v) => v.name), ['Garden', 'Work notes']);
	assert.equal((await createVault('work NOTES')).id, a.id);
	assert.equal(a.path, '', 'a browser vault has no folder');
	await api.openVault(b.id);
	assert.equal((await api.listVaults())[0].id, b.id);
	await assert.rejects(api.openVault('NOPE'), /unknown vault/);
});

test("a vault's theme and snapping are its own, left out at their default", async () => {
	const a = await fresh();
	assert.deepEqual([await api.vaultTheme(), await api.vaultSnap()], [null, true]);
	await api.setVaultTheme('orbit');
	await api.setVaultSnap(false);
	await fresh();
	assert.deepEqual([await api.vaultTheme(), await api.vaultSnap()], [null, true]);
	await api.openVault(a);
	assert.deepEqual([await api.vaultTheme(), await api.vaultSnap()], ['orbit', false]);
	await api.setVaultTheme(null);
	await api.setVaultSnap(true);
	assert.deepEqual([await api.vaultTheme(), await api.vaultSnap()], [null, true]);
});

test("the interface size is the device's, the same in every vault", async () => {
	assert.equal(await api.deviceInterfaceSize(), null);
	await api.setDeviceInterfaceSize(130);
	await fresh();
	assert.equal(await api.deviceInterfaceSize(), 130);
	await api.setDeviceInterfaceSize(null);
	assert.equal(await api.deviceInterfaceSize(), null);
});

test('a vault open in another tab is refused here', async () => {
	// Web Locks, as two tabs see them: a lock held elsewhere is not available.
	const held = new Set();
	Object.defineProperty(globalThis.navigator, 'locks', {
		configurable: true,
		value: { request: async (name, _options, run) => (held.has(name) ? run(null) : (held.add(name), run({ name }))) }
	});
	try {
		const { id } = await createVault('Shared');
		await api.openVault(id);
		const other = await createVault('Elsewhere');
		held.add(`vsb-vault-${other.id}`);
		await assert.rejects(api.openVault(other.id), /open in another tab/);
		assert.ok(await api.queryViewport(WORLD, 0, null), 'the vault open here stays open');
	} finally {
		delete globalThis.navigator.locks;
	}
});
