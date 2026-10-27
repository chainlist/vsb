<script lang="ts">
	import type { CardView } from '#lib/api.js';
	import { isMod } from '#lib/keys.js';
	import { edit } from './actions.js';
	import { startMove } from './gestures.js';
	import { selection } from './selection.svelte.js';
	import CardContent from './CardContent.svelte';
	import CardEditor from './CardEditor.svelte';

	let { card }: { card: CardView } = $props();

	const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
	const missing = $derived(card.note !== null && !card.resolved);
	const editing = $derived(selection.editing === card.id);
	const selected = $derived(selection.has(card.id));

	// Mod+drag draws an edge from the card: the canvas handles it, as it handles drawing a zone.
	function press(e: PointerEvent) {
		if (!isMod(e)) startMove(e, card);
	}

	function open(e: MouseEvent) {
		// Not a double-click on the canvas, which would place another card.
		e.stopPropagation();
		edit(card);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="card index-card note-card"
	class:missing
	class:selected
	class:editing
	style:left="{card.x}px"
	style:top="{card.y}px"
	style:width="{card.w}px"
	style:height="{card.h}px"
	style:text-align={card.halign}
	style:justify-content={justify[card.valign]}
	onpointerdown={press}
	ondblclick={open}
>
	{#if editing}
		<CardEditor {card} />
	{:else}
		<CardContent {card} {missing} />
	{/if}
</div>

<style>
	.card {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.missing {
		background: var(--danger-paper);
		color: var(--danger);
		font-family: var(--font-ui);
	}

	.selected {
		box-shadow: 0 0 0 1.5px var(--pen), var(--lift);
	}

	.editing {
		box-shadow: 0 0 0 2px var(--pen), var(--lift);
	}
</style>
