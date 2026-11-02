// A note read as a mindmap and written back. The rules are pure, so Node runs them straight from
// their TypeScript source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { at, clone, keyOf, layout, node, normalize, parse, setText, textOf, write } from '../src/lib/canvas/mindmap.ts';

const n = node;

/** Writes a map in the note's order, after putting it in that order. */
const written = (root) => {
	const t = clone(root);
	normalize(t);
	return write(t);
};

const LAUNCH = n('Launch plan', '', [
	n('Goals', '', [n('Faster onboarding'), n('Fewer tickets')]),
	n('Risks', '', [n('Hiring'), n('Pricing', 'Competitors cut prices in Q3.')])
]);

const LAUNCH_NOTE = `# Launch plan

## Goals
- Faster onboarding
- Fewer tickets

## Risks
- Hiring

### Pricing
Competitors cut prices in Q3.
`;

test('the spec example: branches and leaves of several lines are headings, one-line leaves list items', () => {
	assert.equal(written(LAUNCH), LAUNCH_NOTE);
	assert.deepEqual(parse(LAUNCH_NOTE), LAUNCH);
});

test("list items come before headings, so a one-line leaf after a heading moves up among them", () => {
	const map = n('Root', '', [n('Branch', '', [n('Leaf')]), n('After')]);
	assert.equal(written(map), '# Root\n- After\n\n## Branch\n- Leaf\n');
	assert.deepEqual(parse(written(map)).children.map((c) => c.title), ['After', 'Branch']);
});

test("a node's own text comes under its heading, before its children", () => {
	const map = n('Root', 'Why we do it.', [n('Risks', 'Two of them.', [n('Hiring'), n('Pricing', 'Q3 cuts.')])]);
	const note = '# Root\nWhy we do it.\n\n## Risks\nTwo of them.\n\n- Hiring\n\n### Pricing\nQ3 cuts.\n';
	assert.equal(written(map), note);
	assert.deepEqual(parse(note), map);
});

test('under the deepest heading, nodes are list items nesting in their order, their text indented', () => {
	let deepest = n('L6', '', [n('Deep', 'Its text\n\nand more', [n('Deeper')]), n('One')]);
	for (const title of ['L5', 'L4', 'L3', 'L2']) deepest = n(title, '', [deepest]);
	const map = n('Root', '', [deepest]);
	const note = written(map);
	assert.equal(
		note,
		'# Root\n\n## L2\n\n### L3\n\n#### L4\n\n##### L5\n\n###### L6\n- Deep\n  Its text\n\n  and more\n  - Deeper\n- One\n'
	);
	assert.deepEqual(parse(note), map);
});

test('an empty map is an empty note, and an empty note an empty map', () => {
	assert.equal(write(n()), '');
	assert.deepEqual(parse(''), n());
	assert.deepEqual(parse('\n\n'), n());
});

test('a note written any other way reads too', () => {
	const note = [
		'Competitor scan',
		'What the others charge.',
		'',
		'* Acme',
		'  + Cheap tier',
		'    1. Monthly',
		'    2) Yearly',
		'* Globex',
		'and its new plan',
		'',
		'More about the scan.',
		'### Skipped a level',
		'# Second title',
		'## Under it'
	].join('\n');
	assert.deepEqual(
		parse(note),
		n('Competitor scan', 'What the others charge.\n\nMore about the scan.', [
			n('Acme', '', [n('Cheap tier', '', [n('Monthly'), n('Yearly')])]),
			n('Globex', 'and its new plan'),
			n('Skipped a level'),
			n('Second title', '', [n('Under it')])
		])
	);
});

test("an item's indented lines are its text; a code block is text whole", () => {
	const note = ['# Root', '- Item', '  first line', '', '  ```', '  # not a heading', '  - not an item', '  ```', '- Next'].join('\n');
	assert.deepEqual(parse(note), n('Root', '', [n('Item', 'first line\n\n```\n# not a heading\n- not an item\n```'), n('Next')]));
	const fenced = ['# Root', '## Code', '```sh', '# a comment', '```'].join('\n');
	assert.deepEqual(parse(fenced), n('Root', '', [n('Code', '```sh\n# a comment\n```')]));
});

test("a list in a node's text makes children of it", () => {
	const map = n('Root', '', [n('Shopping', 'For the weekend:\n- eggs\n- milk')]);
	assert.deepEqual(parse(written(map)), n('Root', '', [n('Shopping', 'For the weekend:', [n('eggs'), n('milk')])]));
});

test('a map read from its note writes back to the same note, at any depth', () => {
	// Every shape: leaves of one line and of several, branches with and without text, down past the
	// deepest heading.
	const grow = (depth, i) =>
		n(
			`Node ${depth}.${i}`,
			i % 3 === 1 ? `Text of ${depth}.${i}\n\nSecond paragraph` : '',
			depth < 8 && i % 2 === 0 ? [0, 1, 2].map((j) => grow(depth + 1, j)) : []
		);
	const map = grow(0, 0);
	const note = written(map);
	const read = parse(note);
	const ordered = clone(map);
	normalize(ordered);
	assert.deepEqual(read, ordered);
	assert.equal(write(read), note);
});

test('a node is found by its key, and its key by the node', () => {
	assert.equal(at(LAUNCH, '1.1').title, 'Pricing');
	assert.equal(at(LAUNCH, ''), LAUNCH);
	assert.equal(at(LAUNCH, '1.5'), undefined);
	assert.equal(keyOf(LAUNCH, LAUNCH.children[1].children[1]), '1.1');
	assert.equal(keyOf(LAUNCH, n('Elsewhere')), undefined);
});

test("a node's text as typed: its title, then its body on the lines after", () => {
	const m = n();
	setText(m, '  Pricing  \n\n\nCompetitors cut prices.\n\nIn Q3.\n\n');
	assert.deepEqual(m, n('Pricing', 'Competitors cut prices.\n\nIn Q3.'));
	assert.equal(textOf(m), 'Pricing\nCompetitors cut prices.\n\nIn Q3.');
	setText(m, 'Hiring');
	assert.deepEqual(m, n('Hiring'));
});

test("each node's children stand in a column to its right, centered on it", () => {
	const map = n('Root', '', [n('A', '', [n('A1'), n('A2')]), n('B')]);
	const sizes = { '': { w: 100, h: 30 }, 0: { w: 50, h: 20 }, '0.0': { w: 40, h: 20 }, '0.1': { w: 40, h: 20 }, 1: { w: 60, h: 20 } };
	const { nodes, w, h } = layout(map, (key) => sizes[key], { x: 40, y: 10 });
	const box = Object.fromEntries(nodes.map((p) => [p.key, [p.x, p.y, p.parent]]));
	// A's branch is its two children: 50 high; B's is itself: 20. The column is 80, the root's middle 40.
	assert.deepEqual(box, {
		'': [0, 25, null],
		0: [140, 15, ''],
		'0.0': [230, 0, '0'],
		'0.1': [230, 30, '0'],
		1: [140, 60, '']
	});
	assert.deepEqual([w, h], [270, 80]);
});
