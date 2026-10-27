<script lang="ts">
	import { untrack } from 'svelte';
	import Locate from '@lucide/svelte/icons/locate';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import type { Entry } from '#lib/api.js';
	import { show } from '#lib/canvas/actions.js';
	import { camera } from '#lib/canvas/camera.svelte.js';
	import { NEW_CARD } from '#lib/canvas/gestures.js';
	import { items } from '#lib/canvas/items.svelte.js';
	import { markdownText } from '#lib/markdown.js';
	import { ghost, startDrag } from './noteDrag.svelte.js';

	/** Lines fetched at a time: the list holds only the pages scrolled to, never every note. */
	const PAGE = 50;

	let { load, empty }: { load: (offset: number, limit: number) => Promise<Entry[]>; empty: string } = $props();

	let entries = $state<Entry[]>([]);
	let more = $state(false);
	let loaded = $state(false);
	let shown: typeof load | undefined;
	let latest = 0;

	/** Fetches `limit` lines from `offset` on. Answers to older fetches are dropped. */
	async function fetch(offset: number, limit: number) {
		const query = ++latest;
		const found = await load(offset, limit);
		if (query !== latest) return;
		entries = offset ? [...entries, ...found] : found;
		more = found.length === limit;
		loaded = true;
	}

	// A new list starts at its first page. After an edit to the vault, the lines shown are fetched
	// again: a placed note leaves the tray, and comes back when the placing is undone.
	$effect(() => {
		void items.revision;
		const fresh = load !== shown;
		shown = load;
		untrack(() => fetch(0, fresh ? PAGE : Math.max(PAGE, entries.length)));
	});

	/** Fetches the next page once the end of the list scrolls into view. */
	function atEnd(end: HTMLElement) {
		const seen = new IntersectionObserver(([e]) => e.isIntersecting && fetch(entries.length, PAGE));
		seen.observe(end);
		return () => seen.disconnect();
	}

	const key = (e: Entry) => (e.kind === 'note' ? `note:${e.path}` : `zone:${e.id}`);
</script>

<div class="list">
	<ul>
		{#each entries as entry (key(entry))}
			<li>
				{#if entry.kind === 'zone'}
					<button class="entry" title="Show on the canvas" onclick={() => show('zone', entry.id)}>
						<strong class="icon-label"><SquareDashed /> {entry.name || 'Untitled'}</strong>
						<span class="where">Zone</span>
					</button>
				{:else}
					<!-- Dragged onto the canvas, a note gets its card there; one that has it shows it instead. -->
					<button
						class="entry note"
						class:placed={entry.card}
						title={entry.card ? 'Show on the canvas' : 'Drag onto the canvas'}
						onpointerdown={(e) => startDrag(e, entry)}
						onclick={() => entry.card && show('card', entry.card)}
					>
						<strong>{entry.title || 'Untitled'}</strong>
						{#if entry.excerpt}
							<span class="excerpt">{markdownText(entry.excerpt)}</span>
						{/if}
						{#if entry.card}
							<span class="where icon-label"><Locate size={14} /> On the canvas</span>
						{/if}
					</button>
				{/if}
			</li>
		{/each}
		{#if more}
			<li class="status" {@attach atEnd}>Loading…</li>
		{/if}
	</ul>
	{#if loaded && !entries.length}
		<p class="status">{empty}</p>
	{/if}
</div>

{#if ghost.note}
	<!-- The card as it will land: its size in the world, at the canvas's zoom. -->
	<div
		class="ghost index-card note-card"
		style:left="{ghost.x}px"
		style:top="{ghost.y}px"
		style:width="{NEW_CARD.w}px"
		style:height="{NEW_CARD.h}px"
		style:transform="translate(-50%, -50%) scale({camera.zoom})"
	>
		<strong class="index-card-title">{ghost.note.title || 'Untitled'}</strong>
		{markdownText(ghost.note.excerpt)}
	</div>
{/if}

<style>
	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		border-top: 1px solid var(--border);
	}

	.entry {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		box-sizing: border-box;
		width: 100%;
		padding: 10px 16px;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		user-select: none;
	}

	.entry:hover {
		background: var(--paper);
	}

	.note:not(.placed) {
		cursor: grab;
	}

	strong {
		font: 600 14.5px/1.35 var(--font-note);
	}

	.excerpt {
		display: -webkit-box;
		overflow: hidden;
		color: var(--ink-soft);
		font: 13px/1.4 var(--font-note);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.where {
		color: var(--pen);
		font-size: 12px;
	}

	.status {
		margin: 0;
		padding: 14px 16px;
		color: var(--ink-soft);
		font-size: 13px;
	}

	.ghost {
		position: fixed;
		z-index: 10;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		opacity: 0.9;
		pointer-events: none;
	}
</style>
