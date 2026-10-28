// The browser backend's lists: search, the Unplaced tray, the zone list and the device's state per
// vault: the desktop's search, unplaced and zone_list tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, fresh, looseNote, noteCard, put, tick, zoneAt } from './browser.mjs';

/** What a search finds: zone names and note titles, in order, with whether each note is placed. */
const found = async (text) => (await api.search(text, 0, 50)).map((e) => (e.kind === 'zone' ? [`zone ${e.name}`, false] : [e.title, e.card !== null]));
const titles = async (text) => (await found(text)).map(([t]) => t);

test('search matches every word as the start of a word, zones first, case and accents ignored', async () => {
	await fresh();
	await looseNote('Competitor scan\n\nPrice tiers');
	await looseNote('Hiring plan\n\nTwo engineers');
	await looseNote("Notes sur l'École\n\nRentrée");
	await put(zoneAt('Z', null, 0, 0, 500, 500, { name: 'Pricing strategy' }));
	assert.deepEqual(await titles('pric'), ['zone Pricing strategy', 'Competitor scan']);
	assert.deepEqual(await titles('PRICE tiers'), ['Competitor scan']);
	assert.deepEqual(await titles('tiers hiring'), [], 'every word must be there');
	assert.deepEqual(await titles('ecole rentree'), ["Notes sur l'École"]);
	assert.deepEqual(await titles("l'éc"), ["Notes sur l'École"], 'a word broken by marks');
	for (const text of ['', '   ', '-- !!', '"price', 'price AND', 'title:x', '^plan*']) await api.search(text, 0, 50);
	assert.equal((await api.search('plan', 0, 1)).length, 1);
	assert.equal((await api.search('plan', 1, 1)).length, 0);
});

test('a title match ranks above a match in the text alone', async () => {
	await fresh();
	await looseNote('Notes\n\nabout pricing');
	await looseNote('Pricing\n\nnotes');
	assert.deepEqual(await titles('pricing'), ['Pricing', 'Notes']);
});

test('search follows saves and tells placed notes', async () => {
	await fresh();
	await looseNote('Loose alpha');
	const { note } = await noteCard('Draft\nalpha');
	assert.deepEqual(await found('alpha'), [['Loose alpha', false], ['Draft', true]]);
	await api.saveNote(note, 'Draft\nbeta');
	assert.deepEqual(await titles('alpha'), ['Loose alpha']);
	assert.deepEqual(await titles('beta'), ['Draft']);
});

test('search follows zone names through edits and undo', async () => {
	await fresh();
	const { id } = await api.createZone(0, 0, 400, 300);
	await api.renameZone(id, 'Pricing');
	assert.deepEqual(await titles('pricing'), ['zone Pricing']);
	await api.renameZone(id, 'Hiring');
	assert.deepEqual(await titles('pricing'), []);
	const undo = await api.deleteZones([id]);
	assert.deepEqual(await titles('hiring'), []);
	await api.applyStates(undo);
	assert.deepEqual(await titles('hiring'), ['zone Hiring']);
});

test('the tray lists notes with no card, newest first, a page at a time', async () => {
	await fresh();
	const placed = await noteCard('Placed');
	await looseNote('Orphan\n\nIts cards were deleted');
	await tick();
	await looseNote('New idea\n\nWritten in the tray');
	const tray = async () => (await api.unplacedNotes(0, 50)).map((e) => e.title);
	assert.deepEqual(await tray(), ['New idea', 'Orphan']);
	assert.deepEqual(await api.unplacedNotes(0, 1), [{ kind: 'note', path: 'notes/New idea.md', title: 'New idea', excerpt: 'Written in the tray', card: null }]);
	assert.equal((await api.unplacedNotes(1, 1)).length, 1);
	assert.equal((await api.unplacedNotes(2, 1)).length, 0);
	await tick();
	await api.saveNote(placed.note, 'Placed\nedited last');
	await api.deleteCards([placed.card]);
	assert.deepEqual(await tray(), ['Placed', 'New idea', 'Orphan']);
});

test('placing a note gives it a card in one undo step, and no second one', async () => {
	await fresh();
	await put(zoneAt('Z', null, 1000, 0, 500, 500));
	await looseNote('Idea\nbody');
	const [{ path }] = await api.unplacedNotes(0, 50);
	const placed = await api.placeNote(path, 1100, 100, 240, 140);
	assert.equal((await api.queryViewport({ minX: 1100, minY: 100, maxX: 1101, maxY: 101 }, 0, null)).cards[0].zone, 'Z');
	assert.equal((await api.unplacedNotes(0, 50)).length, 0);
	const again = await api.placeNote(path, 0, 0, 240, 140);
	assert.deepEqual([again.id, again.undo.length], [placed.id, 0]);
	const redo = await api.applyStates(placed.undo);
	assert.deepEqual((await api.unplacedNotes(0, 50)).map((n) => n.path), [path], 'back in the tray');
	await api.applyStates(redo);
	assert.equal((await api.unplacedNotes(0, 50)).length, 0);
	await assert.rejects(api.placeNote('notes/missing.md', 0, 0, 240, 140));
});

/** Each row as [name, has inner zones, cards held]. */
const rows = async (parent, offset = 0, limit = 50) => (await api.zoneRows(parent, offset, limit)).map((z) => [z.name, z.inner, z.cards]);

test('the zone list shows a level at a time, by name, with cards counted at any depth', async () => {
	await fresh();
	await put(
		zoneAt('beta', null, 0, 0, 1000, 1000),
		zoneAt('Inner', 'beta', 100, 100, 300, 300),
		zoneAt('Deep', 'Inner', 10, 10, 100, 100),
		zoneAt('Alpha', null, 2000, 0, 500, 500),
		// Its parent is missing: it sits on the canvas.
		zoneAt('Gamma', 'MISSING', 5000, 0, 100, 100),
		cardAt('C1', 'beta', 500, 500),
		cardAt('C2', 'Inner', 150, 150),
		cardAt('C3', 'Deep', 5, 5),
		cardAt('C4', null, -500, 0),
		cardAt('C5', 'Alpha', 10, 10)
	);
	assert.deepEqual(await rows(null), [['Alpha', false, 1], ['beta', true, 3], ['Gamma', false, 0]]);
	assert.deepEqual(await rows('beta'), [['Inner', true, 2]]);
	assert.deepEqual(await rows('Inner'), [['Deep', false, 1]]);
	assert.deepEqual(await rows('Deep'), []);
	assert.deepEqual(await rows(null, 1, 1), [['beta', true, 3]]);
	assert.deepEqual(await rows(null, 3), []);
	const [deep] = await api.zoneRows('Inner', 0, 50);
	assert.deepEqual([deep.id, deep.x, deep.y, deep.w, deep.h], ['Deep', 110, 110, 100, 100]);
	// Counts follow cards moved out and deleted.
	await api.moveCards([{ id: 'C3', x: -900, y: 0 }]);
	await api.deleteCards(['C1']);
	assert.deepEqual(await rows(null), [['Alpha', false, 1], ['beta', true, 1], ['Gamma', false, 0]]);
});

test('finding zones by word starts at any depth, ignoring case and accents', async () => {
	await fresh();
	const zone = (id, name, parent) => zoneAt(id, parent, 0, 0, 400, 400, { name });
	await put(zone('Q3', 'Q3 plan', null), zone('PR', 'Pricing risks', 'Q3'), zone('PT', 'pricing', null), zone('EL', 'Éléments de prix', 'PR'), zone('SP', 'Supprime', null), cardAt('C1', 'EL', 10, 10));
	const names = async (text, offset = 0, limit = 50) => (await api.zoneMatches(text, offset, limit)).map((z) => z.name);
	assert.deepEqual(await names('pri'), ['pricing', 'Pricing risks', 'Éléments de prix']);
	assert.deepEqual(await names('risk pri'), ['Pricing risks']);
	assert.deepEqual(await names('elements'), ['Éléments de prix']);
	assert.equal((await api.zoneMatches('risks', 0, 50))[0].cards, 1);
	assert.deepEqual(await names('pri', 1, 1), ['Pricing risks']);
	assert.deepEqual(await names('  '), []);
	assert.deepEqual(await names('->'), []);
});

test("the device's state for a vault is kept with it", async () => {
	const id = await fresh();
	assert.equal(await api.uiState('zone-list'), null);
	await api.setUiState('zone-list', 'open');
	await api.setUiState('zone-list', 'closed');
	await fresh();
	assert.equal(await api.uiState('zone-list'), null, 'another vault has its own');
	await api.openVault(id);
	assert.equal(await api.uiState('zone-list'), 'closed');
});
