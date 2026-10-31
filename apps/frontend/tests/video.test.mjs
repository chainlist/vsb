// Which addresses a link card plays as a YouTube video, and from where. The rules are pure, so Node runs
// them straight from their TypeScript source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerUrl, videoOf } from '../src/lib/canvas/video.ts';

const ID = 'dQw4w9WgXcQ';
const flat = (start = 0) => ({ id: ID, start, upright: false });

test('every shape of a video address names the same video', () => {
	for (const url of [
		`https://www.youtube.com/watch?v=${ID}`,
		`https://youtube.com/watch?feature=share&v=${ID}`,
		`https://m.youtube.com/watch?v=${ID}`,
		`https://music.youtube.com/watch?v=${ID}&list=RD${ID}`,
		`http://www.youtube.com/watch?v=${ID}`,
		`https://youtu.be/${ID}?si=abc`,
		`https://www.youtube.com/embed/${ID}`,
		`https://www.youtube-nocookie.com/embed/${ID}`,
		`https://www.youtube.com/live/${ID}`,
		`https://www.youtube.com/v/${ID}`
	]) {
		assert.deepEqual(videoOf(url), flat(), url);
	}
});

test('a Short stands upright', () => {
	assert.deepEqual(videoOf(`https://www.youtube.com/shorts/${ID}`), { id: ID, start: 0, upright: true });
	assert.deepEqual(videoOf(`https://youtu.be/shorts`), null);
});

test('a start time carries over, however YouTube writes it', () => {
	assert.deepEqual(videoOf(`https://youtu.be/${ID}?t=90`), flat(90));
	assert.deepEqual(videoOf(`https://www.youtube.com/watch?v=${ID}&t=90s`), flat(90));
	assert.deepEqual(videoOf(`https://www.youtube.com/watch?v=${ID}&t=1h2m30s`), flat(3750));
	assert.deepEqual(videoOf(`https://www.youtube.com/embed/${ID}?start=12`), flat(12));
	assert.deepEqual(videoOf(`https://www.youtube.com/watch?v=${ID}&t=soon`), flat());
});

test('anything else is no video', () => {
	for (const url of [
		'https://www.youtube.com/',
		'https://www.youtube.com/@RickAstleyYT',
		`https://www.youtube.com/playlist?list=PL${ID}`,
		'https://www.youtube.com/watch?v=tooshort',
		`https://www.youtube.com.example.com/watch?v=${ID}`,
		`https://vimeo.com/${ID}`,
		`javascript:alert('https://youtu.be/${ID}')`,
		'not an address'
	]) {
		assert.equal(videoOf(url), null, url);
	}
});

test('the player plays at once, from the start time, without cookies until it does', () => {
	assert.equal(playerUrl(flat()), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`);
	assert.equal(playerUrl(flat(90)), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&start=90`);
});
