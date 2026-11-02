<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { openLink, type CardView } from '#lib/api.js';
	import { isMod } from '#lib/keys.js';
	import { edit, sizeMindmap, tilt } from './actions.js';
	import { startMove } from './gestures.js';
	import { imageUrl } from './images.js';
	import { items } from './items.svelte.js';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import { pick } from './menu.js';
	import { selection } from './selection.svelte.js';
	import CardContent from './CardContent.svelte';
	import CardEditor from './CardEditor.svelte';
	import Mindmap from './Mindmap.svelte';
	import MindmapEditor from './MindmapEditor.svelte';

	let { card }: { card: CardView } = $props();

	/** What a mindmap shows, as its editor says at once, until its file says so too. */
	let view = $derived(card.view);
	let element: HTMLElement;

	/** Sizes a mindmap's card to its map, `w` by `h`, with the card's padding around it. */
	function hold(w: number, h: number) {
		const style = getComputedStyle(element);
		const px = (side: string) => parseFloat(style.getPropertyValue(`padding-${side}`));
		void sizeMindmap(card, w + px('left') + px('right'), h + px('top') + px('bottom'));
	}

	const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
	/** Whether the card's image file was found missing. */
	let lost = $state(false);
	$effect(() => {
		lost = false;
		if (card.kind === 'image' && card.file) imageUrl(card.file).catch(() => (lost = true));
	});
	const missing = $derived((card.note !== null && !card.resolved) || lost);
	const editing = $derived(selection.editing === card.id);
	const selected = $derived(selection.has(card.id));
	const dimmed = $derived(selection.dims(card.id));
	const lean = $derived(tilt(card));

	// Mod+drag draws an edge from the card: the canvas handles it, as it handles drawing a zone.
	function press(e: PointerEvent) {
		if (!isMod(e)) startMove(e, card);
	}

	function open(e: MouseEvent) {
		// Not a double-click on the canvas, which would place another card.
		e.stopPropagation();
		edit(card);
	}

	/** Ctrl+click on a link card opens its page, outside the app. */
	function follow(e: MouseEvent) {
		if (card.kind === 'link' && card.link !== null && isMod(e)) void openLink(card.link);
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

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="card index-card"
	class:note-card={card.kind !== 'image' || missing}
	class:postit={card.kind === 'postit'}
	class:mindmap={card.kind === 'mindmap' && view === 'map'}
	class:unclipped={card.kind === 'mindmap' && (view === 'map' || editing)}
	class:tinted={card.color !== null}
	class:missing
	class:selected
	class:editing
	class:dimmed
	style:left="{card.x}px"
	style:top="{card.y}px"
	style:width="{card.w}px"
	style:height="{card.h}px"
	style:rotate={lean ? `${lean}deg` : undefined}
	style:--tint={card.color}
	style:text-align={card.halign}
	style:justify-content={justify[card.valign]}
	bind:this={element}
	onpointerdown={press}
	onclick={follow}
	ondblclick={open}
	oncontextmenu={() => pick(card.id)}
	out:collapse
>
	<!-- A note that fails to show fails alone, in its card. -->
	<ErrorBoundary what="This card">
		<!-- Showing its Markdown, a mindmap is an index card but for its editor. -->
		{#if card.kind === 'mindmap' && !missing && editing}
			<MindmapEditor {card} onview={(v) => (view = v)} onsize={hold} />
		{:else if card.kind === 'mindmap' && !missing && view === 'map'}
			<Mindmap {card} onsize={hold} />
		{:else if editing}
			<CardEditor {card} />
		{:else}
			<CardContent {card} {missing} />
		{/if}
	</ErrorBoundary>
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

	/* A post-it: a square of sticky paper written on by hand, the same in every theme, its bottom edge
	   lifting off the paper. Its color is the paper itself, at full strength rather than a wash, so it
	   is written on in dark ink whatever the theme. Without a color it is on the theme's plain stock,
	   in the theme's ink. */
	.postit {
		--lift: 0 1px 1px rgb(0 0 0 / 0.08), 0 12px 10px -9px rgb(0 0 0 / 0.4);
		/* Its hand keeps its own size: a theme scaling up a small x-height would blow it up. */
		--font-adjust: none;
		border-radius: 1px;
		font: 22px/1.2 var(--font-hand);
	}

	.postit.tinted {
		--stock: var(--tint);
	}

	.postit.tinted:not(.missing) {
		color: var(--postit-ink);
	}

	/* Its note's first line heads it in the same hand, with no rule under it. */
	.postit :global(.index-card-title) {
		margin: 0 0 2px;
		padding: 0;
		border: none;
		font: 700 1em/1.2 var(--font-hand);
	}

	/* A mindmap is drawn straight on the paper, as ink: no stock and no shadow. A color washes it over
	   the paper as a zone is washed, the grid showing through. */
	.mindmap {
		--lift: 0 0 transparent;
		background: none;
		transition: opacity var(--fade);
	}

	/* A map can pass its card's sides while its nodes are on their way to a new size, and an open
	   mindmap's buttons sit above its card. The map clips itself when it fits its card. */
	.unclipped {
		overflow: visible;
	}

	/* Open, its nodes are selected, not the card: no outline. */
	.mindmap.editing {
		box-shadow: none;
	}

	.mindmap.tinted:not(.missing) {
		background: color-mix(in srgb, var(--tint) var(--zone-wash), transparent);
	}

	/* With no stock to veil it, a dimmed mindmap fades into the paper. */
	.mindmap::after {
		content: none;
	}

	.mindmap.dimmed {
		opacity: var(--dim);
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
