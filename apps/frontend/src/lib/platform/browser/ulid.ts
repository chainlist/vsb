// ULIDs, the IDs of every vault, note, zone, card and edge: 10 characters of time in milliseconds,
// then 16 random ones. Within one millisecond each ID is the last one plus one, so IDs sort in the
// order they were made.

const DIGITS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = -1;
let lastRandom: number[] = [];

export function newId() {
	const time = Date.now();
	if (time === lastTime) {
		let i = lastRandom.length - 1;
		while (lastRandom[i] === 31) lastRandom[i--] = 0;
		lastRandom[i]++;
	} else {
		lastTime = time;
		lastRandom = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b & 31);
	}
	let head = '';
	for (let t = time, i = 0; i < 10; i++, t = Math.floor(t / 32)) head = DIGITS[t % 32] + head;
	return head + lastRandom.map((d) => DIGITS[d]).join('');
}
