<!-- The kinds of cards: a button per kind shows its screenshot, from the thesis, and a line on it. -->
<script lang="ts">
	import Picker from '#lib/Picker.svelte';
	import image from '#lib/shots/kind-image.webp';
	import link from '#lib/shots/kind-link.webp';
	import mindmap from '#lib/shots/kind-mindmap.webp';
	import note from '#lib/shots/kind-note.webp';
	import postit from '#lib/shots/kind-postit.webp';

	const kinds = [
		{
			id: 'note',
			name: 'Index card',
			src: note,
			alt: 'Three index cards: Stickgold 2005 linked as evidence to Replay, whose Markdown shows a list with bold, italic and code, and a dashed link from it to a yellow Do naps count? card.',
			line: 'a note on white stock, its first line the title and the rest Markdown: lists, emphasis, code and links.'
		},
		{
			id: 'postit',
			name: 'Post-it',
			src: postit,
			alt: 'The nap study card with three post-its stuck around it, yellow, pink and green, each written by hand and leaning its own way.',
			line: "a square of sticky paper in a highlighter's color, written by hand and leaning its own way."
		},
		{
			id: 'mindmap',
			name: 'Mindmap',
			src: mindmap,
			alt: 'A mindmap of the nap study drawn straight on the paper: the boxed root, then Question, Method, Measures and Next, each with its leaves.',
			line: 'a note drawn as a map, its headings and lists the branches. Tab adds a node, and the card grows with the map.'
		},
		{
			id: 'image',
			name: 'Image',
			src: image,
			alt: 'An image card showing a hypnogram of one night, its REM periods in red, linked to a card that reads it as a textbook night.',
			line: 'a picture pasted or dropped on the paper, kept in the vault beside your notes.'
		},
		{
			id: 'link',
			name: 'Link',
			src: link,
			alt: "A Read next card linked to two link cards: Wikipedia's page on the hippocampus, with its drawing of the brain and its title, and a TED talk on sleep as a YouTube video, its thumbnail under a play button.",
			line: "a pasted web address. The desktop app shows the page's title, description and image, and plays a YouTube video right on the card."
		}
	];
</script>

<Picker label="Kind of card" options={kinds} />
