// The large test vault, the same on every run: 300 zones nested three deep, 8,000 cards (4,000 in
// zones, 4,000 loose in clumps), 5,000 notes (500 of them unplaced) and 6,000 edges. One function
// with no outside references, so the bench can also run it inside a page, as text.

export function generate() {
	// mulberry32: a small seeded generator, so the vault is identical everywhere.
	let seed = 0x5eed;
	const random = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const pick = (list) => list[Math.floor(random() * list.length)];
	const ULID = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
	const id = () => '01JD' + Array.from({ length: 22 }, () => pick(ULID)).join('');

	const WORDS = (
		'pricing strategy interview customer market launch roadmap budget hiring plan risk review ' +
		'design research prototype feedback onboarding retention churn growth metric funnel partner ' +
		'contract legal support ticket release sprint backlog estimate velocity incident outage ' +
		'latency cache database index query schema migration deploy server client mobile desktop ' +
		'browser canvas zone card edge cluster bundle search note title excerpt garden forest river ' +
		'mountain harbor lantern compass anchor beacon ember falcon glacier horizon island jungle ' +
		'kettle ladder meadow nectar orchard pebble quartz raven saddle timber umbrella valley willow ' +
		'yonder zephyr école rentrée élément café naïve résumé façade über zürich ångström crème ' +
		'déjà señor piñata coöperate fiancée protégé'
	).split(' ');
	const COLORS = [null, null, null, '#f5d76e', '#9fd3a8', '#9ec5ef', '#f4a6a6'];
	const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
	const capital = (s) => s[0].toUpperCase() + s.slice(1);

	const CARD = { w: 240, h: 140 };
	const STEP = { x: 280, y: 180 };
	const zones = [];
	const cards = [];
	const notes = [];
	const edges = [];

	function zone(parent, x, y, w, h) {
		const abs = parent ? { x: parent.abs.x + x, y: parent.abs.y + y } : { x, y };
		const z = { id: id(), name: capital(words(1 + Math.floor(random() * 3))), parent: parent?.id ?? null, x, y, w, h, color: pick(COLORS), abs, cards: [] };
		zones.push(z);
		return z;
	}

	/** Cards in rows from (x0, y0) of `zone` (or the canvas), `cols` to a row. */
	function rows(owner, x0, y0, cols, count) {
		const made = [];
		for (let i = 0; i < count; i++) {
			const x = x0 + (i % cols) * STEP.x;
			const y = y0 + Math.floor(i / cols) * STEP.y;
			const abs = owner ? { x: owner.abs.x + x, y: owner.abs.y + y } : { x, y };
			const c = { id: id(), zone: owner?.id ?? null, x, y, ...CARD, abs, note: null, color: random() < 0.1 ? pick(COLORS.slice(3)) : null };
			cards.push(c);
			made.push(c);
		}
		owner?.cards.push(...made);
		return made;
	}

	// 60 zones in a 10 by 6 grid, each holding three zones, the first of which holds one more.
	// Each zone's own cards sit in a band at its top, its inner zones below them.
	const groups = [];
	for (let row = 0; row < 6; row++) {
		for (let col = 0; col < 10; col++) {
			const top = zone(null, col * 5000, row * 4000, 4200, 3400);
			const inner = [0, 1, 2].map((i) => zone(top, 50 + i * 1400, 1300, 1300, 2000));
			const deep = zone(inner[0], 50, 1100, 1200, 850);
			groups.push({ top, inner, deep });
		}
	}
	for (const [i, g] of groups.entries()) {
		rows(g.top, 40, 80, 14, i < 40 ? 27 : 26);
		for (const z of g.inner) rows(z, 40, 80, 4, 10);
		rows(g.deep, 40, 80, 4, 10);
	}

	// 100 clumps of 40 loose cards below the zones.
	const clumps = [];
	for (let i = 0; i < 100; i++) {
		const x0 = Math.floor(random() * 47000);
		const y0 = 26000 + Math.floor(random() * 19000);
		clumps.push(rows(null, x0, y0, 8, 40));
	}

	// 4,500 cards have a note; 500 more notes have no card.
	const order = cards.map((_, i) => i).sort(() => random() - 0.5);
	const note = () => {
		const n = { id: id(), text: `${capital(words(2 + Math.floor(random() * 3)))}\n\n${words(10 + Math.floor(random() * 20))}\n${words(8)}` };
		n.file = `notes/note ${notes.length + 1}.md`;
		notes.push(n);
		return n;
	};
	for (const i of order.slice(0, 4500)) cards[i].note = note();
	for (let i = 0; i < 500; i++) note();

	// 6,000 edges, at most one per pair of cards: chains inside each zone and clump, then links
	// between zones, and between clumps and zones.
	const index = new Map(cards.map((c, i) => [c.id, i]));
	const pairs = new Set();
	function edge(a, b) {
		const key = a.id < b.id ? a.id + b.id : b.id + a.id;
		if (a === b || pairs.has(key) || edges.length >= 6000) return;
		pairs.add(key);
		const arrow = random() < 0.15 ? pick(['both', 'none']) : 'to';
		const stroke = random() < 0.2 ? pick(['dashed', 'dotted', 'double']) : 'solid';
		const shape = random() < 0.2 ? pick(['straight', 'angled']) : 'curved';
		edges.push({ id: id(), from: index.get(a.id), to: index.get(b.id), arrow, stroke, shape, label: random() < 0.1 ? words(1) : null });
	}
	for (const z of zones) for (let i = 1; i < z.cards.length && i < 9; i++) edge(z.cards[i - 1], z.cards[i]);
	for (const clump of clumps) for (let i = 1; i < 16; i++) edge(clump[i - 1], clump[i]);
	while (edges.length < 4800) {
		const a = pick(zones);
		const b = random() < 0.5 ? pick(zones) : zones[(zones.indexOf(a) + 4) % zones.length];
		edge(pick(a.cards), pick(b.cards));
	}
	while (edges.length < 6000) edge(pick(pick(clumps)), pick(pick(zones).cards));

	return { vaultId: id(), zones, cards, notes, edges, search: ['pricing', 'ecole', 'strategy interview', 'harbor lantern', 'zu', 'rentree cafe'] };
}
