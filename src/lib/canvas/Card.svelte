<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import type { CardView } from '#lib/api.js';
	import { isMod } from '#lib/keys.js';
	import { edit } from './actions.js';
	import { startMove } from './gestures.js';
	import { items } from './items.svelte.js';
	import { selection } from './selection.svelte.js';
	import CardContent from './CardContent.svelte';
	import CardEditor from './CardEditor.svelte';

	let { card }: { card: CardView } = $props();

	const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
	const missing = $derived(card.note !== null && !card.resolved);
	const editing = $derived(selection.editing === card.id);
	const selected = $derived(selection.has(card.id));
	const dimmed = $derived(selection.dims(card.id));

	// Mod+drag draws an edge from the card: the canvas handles it, as it handles drawing a zone.
	function press(e: PointerEvent) {
		if (!isMod(e)) startMove(e, card);
	}

	function open(e: MouseEvent) {
		// Not a double-click on the canvas, which would place another card.
		e.stopPropagation();
		edit(card);
	}

	/** As zones collapse, the card fades into the preview drawn beneath it, as long as dimming takes,
	 * and no longer takes presses. Leaving the canvas any other way, it goes at once. */
	function collapse(node: HTMLElement) {
		if (!items.collapsed) return { duration: 0 };
		node.style.pointerEvents = 'none';
		const duration = parseFloat(getComputedStyle(node).getPropertyValue('--fade'));
		return { duration, easing: cubicOut, css: (t: number) => `opacity: ${t}` };
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="card index-card note-card"
	class:tinted={card.color !== null}
	class:missing
	class:selected
	class:editing
	class:dimmed
	style:left="{card.x}px"
	style:top="{card.y}px"
	style:width="{card.w}px"
	style:height="{card.h}px"
	style:--tint={card.color}
	style:text-align={card.halign}
	style:justify-content={justify[card.valign]}
	onpointerdown={press}
	ondblclick={open}
	out:collapse
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
		/* As it appears, it fades in: its stock from the faded block a collapsed zone's preview drew,
		   its text from nothing. Ending an edit does not replay it: the card is the same element. */
		animation: reveal var(--fade) ease-out;
	}

	@keyframes reveal {
		from {
			--shown: 0;
			opacity: var(--dim);
		}
	}

	/* A light wash of the card's color over its stock, as a zone is washed over the paper. It stays
	   while the card is edited, and a dimmed card fades into it. */
	.tinted {
		background: var(--stock);
	}

	/* After the tint: a missing note looks the same whatever its card's color. */
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

	/* Faded back but still solid: a veil of the card's own stock over what it shows. Always there,
	   clear until the card dims, so it fades in and out. */
	.card::after {
		content: '';
		position: absolute;
		inset: 0;
		background: inherit;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--fade);
	}

	.dimmed::after {
		opacity: calc(1 - var(--dim));
	}
</style>
