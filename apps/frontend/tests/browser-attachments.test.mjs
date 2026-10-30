// The browser backend's attachments: the desktop's attachments tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, file, fresh, put, WORLD, zoneAt } from './browser.mjs';

const PNG = new TextEncoder().encode('\x89PNG\r\n\x1a\n not really an image').buffer;

test('an image is written under attachments, named after its file', async () => {
	await fresh();
	const first = await api.writeImage('Photo café.PNG', PNG);
	const second = await api.writeImage('C:\\Users\\me\\photo CAFÉ.png', PNG);
	assert.deepEqual([first, second], ['attachments/images/Photo café.png', 'attachments/images/photo CAFÉ 2.png']);
	assert.deepEqual(new Uint8Array(await api.readAttachment(second)), new Uint8Array(PNG));
	assert.equal(await api.writeImage('a:b?.gif', PNG), 'attachments/images/ab.gif');
	await assert.rejects(api.writeImage('notes.txt', PNG));
	await assert.rejects(api.writeImage('no extension', PNG));
});

test('an image card shows its file until it is cleared', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 600, 400));
	const path = await api.writeImage('diagram.png', PNG);
	const placed = await api.placeFile(path, 100, 100, 320, 180);

	const card = await file('card', placed.id);
	assert.deepEqual([card.note, card.file, card.zone, card.x], [null, path, 'Z', 100]);
	const view = (await api.queryViewport(WORLD, 0, null)).cards.find((c) => c.id === placed.id);
	assert.equal(view.file, path);
	// A second card may show the same file.
	await api.placeFile(path, 300, 100, 320, 180);

	await api.clearCard(placed.id);
	const cleared = await file('card', placed.id);
	assert.deepEqual([cleared.note, cleared.file], [null, undefined]);
	// Undoing the placing takes the card away; the image stays.
	await api.applyStates(placed.undo);
	assert.equal(await file('card', placed.id), undefined);
	assert.ok(await api.readAttachment(path));
});

test('only attachments are read or placed', async () => {
	await fresh();
	for (const path of ['notes/Secret.md', 'attachments/../notes/Secret.md', '../Secret.md', '/etc/passwd', 'C:/Windows/win.ini']) {
		await assert.rejects(api.readAttachment(path), path);
		await assert.rejects(api.placeFile(path, 0, 0, 100, 100), path);
	}
	await assert.rejects(api.placeFile('attachments/images/missing.png', 0, 0, 100, 100));
});

test('a pasted image card shows the same file', async () => {
	await fresh();
	const path = await api.writeImage('diagram.png', PNG);
	const placed = await api.placeFile(path, 0, 0, 320, 180);
	const clip = await api.copyItems([placed.id], [], []);
	assert.equal(clip.cards[0].file, path);
	const pasted = await api.pasteItems(clip, 500, 0);
	assert.equal((await file('card', pasted.ids[0])).file, path);

	// A clip from elsewhere naming a file outside the attachments pastes an empty card.
	clip.cards[0].file = '../outside.png';
	const other = await api.pasteItems(clip, 900, 0);
	assert.equal((await file('card', other.ids[0])).file, undefined);
});
