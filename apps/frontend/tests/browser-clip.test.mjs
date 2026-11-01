// The browser backend's copying and pasting: the desktop's clip tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cardAt, changed, file, files, fresh, put, WORLD, zoneAt } from './browser.mjs';

/** Zone A on the canvas holding card c1, with text, and zone B, which holds card c2, whose note is
 * missing; card c3 loose beside it, card c4 below. Edges run from c1 to c2, c3 and c4. */
async function scene() {
	await fresh();
	await put(
		zoneAt('A', null, 100, 100, 400, 300),
		zoneAt('B', 'A', 200, 40, 150, 150),
		cardAt('c1', 'A', 20, 60),
		cardAt('c2', 'B', 10, 60, { note: '01ABSENT', color: '#f5d76e' }),
		cardAt('c3', null, 600, 100),
		cardAt('c4', null, 600, 600)
	);
	await api.createNoteForCard('c1', 'Alpha\nbody');
	for (const to of ['c2', 'c3', 'c4']) await api.createEdge('c1', to);
}

// c1 is named too, but it lies inside A and comes with it.
const copied = () => api.copyItems(['c3', 'c1'], ['A'], []);

test('copying gathers zones with what they hold, and the edges between the cards', async () => {
	await scene();
	const clip = await copied();
	assert.deepEqual([clip.x, clip.y, clip.w, clip.h], [100, 100, 600, 300]);
	assert.deepEqual(clip.zones.map((z) => [z.id, z.parent, z.x, z.y]), [['A', null, 0, 0], ['B', 'A', 200, 40]]);
	const cards = clip.cards.map((c) => [c.id, c.zone, c.x, c.y, c.text]).sort();
	assert.deepEqual(cards, [['c1', 'A', 20, 60, 'Alpha\nbody'], ['c2', 'B', 210, 100, null], ['c3', null, 500, 0, null]]);
	assert.equal(clip.cards.find((c) => c.id === 'c2').color, '#f5d76e');
	assert.deepEqual(clip.edges.map((e) => [e.from, e.to]).sort(), [['c1', 'c2'], ['c1', 'c3']]);
});

test('a paste writes new items, new notes and their edges in one step', async () => {
	await scene();
	const clip = await copied();
	const before = await files();
	const pasted = await api.pasteItems(clip, 2000, 0);

	// A and c3 were copied on their own; B, c1 and c2 come inside A.
	assert.equal(pasted.ids.length, 2);
	const now = await files();
	const added = changed(before, now);
	const a = pasted.ids.find((id) => now[`zones/${id}`]);
	assert.deepEqual(now[`zones/${a}`], { name: 'A', parent: null, x: 2000, y: 0, w: 400, h: 300 });
	const c3 = pasted.ids.find((id) => id !== a);
	assert.deepEqual(now[`cards/${c3}`], { note: null, zone: null, x: 2500, y: 0, w: 100, h: 50 });
	assert.deepEqual(['zones/', 'cards/', 'edges/'].map((k) => added.filter((key) => key.startsWith(k)).length), [2, 3, 2]);
	const values = added.map((k) => now[k]);
	const b = values.find((v) => v.parent === a);
	assert.deepEqual([b.name, b.x, b.y], ['B', 200, 40]);

	// c1's copy gets a note of its own with the same text; c2's missing note leaves its copy empty.
	const c1 = values.find((v) => v.note && v.zone === a);
	assert.deepEqual([c1.x, c1.y, await api.readNote(c1.note)], [20, 60, 'Alpha\nbody']);
	assert.equal((await api.search('alpha', 0, 50)).length, 2);
	const c2 = values.find((v) => v.color === '#f5d76e' && v.zone !== 'B');
	assert.deepEqual([c2.note, c2.x, c2.y], [null, 10, 60]);
	for (const edge of added.filter((k) => k.startsWith('edges/')).map((k) => now[k])) {
		assert.ok(![edge.from, edge.to].some((end) => ['c1', 'c2', 'c3', 'c4'].includes(end)));
	}

	// One undo step takes it all away; the new note stays, unplaced.
	await api.applyStates(pasted.undo);
	assert.deepEqual(await files(), before);
	assert.deepEqual((await api.unplacedNotes(0, 50)).map((n) => n.path), ['notes/Alpha 2.md']);
});

test('a paste joins the zone under its middle, which grows to hold it', async () => {
	await fresh();
	await put(zoneAt('Z', null, 0, 0, 300, 200), cardAt('c', null, 1000, 1000));
	const clip = await api.copyItems(['c'], [], []);
	const pasted = await api.pasteItems(clip, 200, 120);
	const card = await file('card', pasted.ids[0]);
	assert.deepEqual([card.zone, card.x, card.y], ['Z', 200, 120]);
	const z = await file('zone', 'Z');
	assert.deepEqual([z.w, z.h], [320, 200], 'a graph-paper square clear of the card on the right');
});

test('a copy never lands inside the zone it copies', async () => {
	await fresh();
	await put(zoneAt('A', null, 0, 0, 400, 300), cardAt('c', 'A', 20, 60));
	const clip = await api.copyItems([], ['A'], []);
	// Its middle lies inside A.
	const pasted = await api.pasteItems(clip, clip.x + 40, clip.y + 40);
	const copy = await file('zone', pasted.ids[0]);
	assert.deepEqual([copy.parent, copy.x, copy.y], [null, 40, 40]);
	const a = await file('zone', 'A');
	assert.deepEqual([a.w, a.h], [400, 300]);
});

test('drawings copy with their strokes', async () => {
	await fresh();
	const { id } = await api.addStroke([0, 0, 0.5, 30, 20, 0.5], '#f5d76e', 8);
	const clip = await api.copyItems([], [], [id]);
	const pasted = await api.pasteItems(clip, 500, 500);
	const [original, copy] = [await file('drawing', id), await file('drawing', pasted.ids[0])];
	assert.deepEqual(copy.strokes, original.strokes);
	assert.deepEqual([copy.x, copy.y], [500, 500]);
});

test('a link card copies with its link and preview, and a clip brings only web pages', async () => {
	await fresh();
	const preview = { title: 'A', description: 'About A', image: 'attachments/links/example.com.png' };
	await put(cardAt('l', null, 0, 0, { w: 320, h: 300, link: 'https://example.com/a', preview }));
	const [view] = (await api.queryViewport(WORLD, 0, null)).cards;
	assert.deepEqual([view.note, view.link, view.preview], [null, 'https://example.com/a', preview]);

	const clip = await api.copyItems(['l'], [], []);
	assert.deepEqual([clip.cards[0].kind, clip.cards[0].text, clip.cards[0].link], ['link', null, 'https://example.com/a']);
	const copy = await file('card', (await api.pasteItems(clip, 500, 0)).ids[0]);
	assert.deepEqual([copy.kind, copy.note, copy.link, copy.preview], ['link', null, 'https://example.com/a', preview]);

	// A preview's image outside the attachments is left out.
	clip.cards[0].preview = { ...preview, image: '../secret.png' };
	const outside = await file('card', (await api.pasteItems(clip, 500, 500)).ids[0]);
	assert.deepEqual(outside.preview, { title: 'A', description: 'About A' });

	// Any other address is left out, with its preview: the copy is an empty card. Nor is one opened.
	clip.cards[0].link = 'javascript:alert(1)';
	const empty = await file('card', (await api.pasteItems(clip, 1000, 0)).ids[0]);
	assert.deepEqual([empty.note, 'kind' in empty, 'link' in empty, 'preview' in empty], [null, false, false, false]);
	await assert.rejects(api.openLink('javascript:alert(1)'), (e) => e === 'not a web link');
	// The browser reads no other site's page.
	assert.equal(await api.linkPreview('https://example.com/a'), null);
});

test('a post-it pastes as a post-it with a note of its own', async () => {
	await fresh();
	const id = await api.createCard(0, 0, 200, 200, 'postit', '#f5d76e');
	const note = await api.createNoteForCard(id, 'Ask Marie');
	const clip = await api.copyItems([id], [], []);
	assert.deepEqual([clip.cards[0].kind, clip.cards[0].text], ['postit', 'Ask Marie']);
	const copy = await file('card', (await api.pasteItems(clip, 500, 0)).ids[0]);
	assert.deepEqual([copy.kind, copy.color], ['postit', '#f5d76e']);
	assert.notEqual(copy.note, note);
	assert.equal(await api.readNote(copy.note), 'Ask Marie');
});

test('a clip from before kinds is told by what its cards show', async () => {
	await fresh();
	const pasted = async (extra) => {
		const card = { id: 'c', zone: null, x: 0, y: 0, w: 100, h: 100, text: null, ...extra };
		return file('card', (await api.pasteItems({ x: 0, y: 0, w: 100, h: 100, zones: [], cards: [card], drawings: [], edges: [] }, 0, 0)).ids[0]);
	};
	assert.equal((await pasted({ file: 'attachments/images/a.png' })).kind, 'image');
	// An image card naming a file outside the attachments shows nothing: it pastes as an empty index card.
	const outside = await pasted({ kind: 'image', file: '../secret.png' });
	assert.deepEqual(['kind' in outside, 'file' in outside], [false, false]);
	// Text on a card that shows no note makes none.
	const link = await pasted({ kind: 'link', link: 'https://example.com', text: 'stray' });
	assert.deepEqual([link.kind, link.note], ['link', null]);
});
