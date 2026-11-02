<script module lang="ts">
	/** Each mindmap's note as last read or written, so a mindmap drawn again shows at once. */
	export const texts = new Map<string, string>();
</script>

<script lang="ts">
	import { readNote, type CardView } from '#lib/api.js';
	import { failure } from '#lib/failure.svelte.js';
	import { finished } from './editSession.js';
	import { pressNode } from './gestures.js';
	import { parse } from './mindmap.js';
	import { openAt } from './MindmapEditor.svelte';
	import MindmapMap from './MindmapMap.svelte';

	let { card }: { card: CardView } = $props();

	let text = $state('');
	const root = $derived(parse(text));
	// The note is read again when its title or excerpt changes, as an edit ends.
	const note = $derived(card.note);
	const stamp = $derived(`${card.title}\n${card.excerpt}`);

	$effect(() => {
		void stamp;
		const id = note;
		text = id ? (texts.get(id) ?? '') : '';
		if (!id) return;
		let live = true;
		// After the last edit is saved, so its text is the one read.
		finished()
			.then(() => readNote(id))
			.then((read) => {
				texts.set(id, read);
				if (live) text = read;
			})
			.catch(failure.report);
		return () => (live = false);
	});
</script>

<!-- A click on a node opens the mindmap at it; a drag moves the card. -->
<MindmapMap {root} halign={card.halign} valign={card.valign} onpick={(key, e) => pressNode(e, card, () => openAt(card, key))} />
