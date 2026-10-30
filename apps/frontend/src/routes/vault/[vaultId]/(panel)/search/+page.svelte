<script lang="ts">
	import { search } from '#lib/api.js';
	import NoteList from '#lib/panel/NoteList.svelte';

	/** Pause after the last keystroke before searching, in ms. */
	const DELAY = 150;

	let text = $state('');
	let query = $state('');

	$effect(() => {
		const typed = text.trim();
		const timer = setTimeout(() => (query = typed), DELAY);
		return () => clearTimeout(timer);
	});

	// A new function per query, so the list starts over.
	const load = $derived.by(() => {
		const words = query;
		return (offset: number, limit: number) => search(words, offset, limit);
	});
</script>

<input
	type="search"
	placeholder="Notes and zone names"
	aria-label="Search notes and zone names"
	bind:value={text}
	{@attach (el) => el.focus()}
/>
{#if query}
	<NoteList {load} empty="Nothing matches." />
{:else}
	<p class="hint">Finds notes by any words in them, and zones by their name.</p>
{/if}

<style>
	input {
		margin: 12px 12px 6px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--card);
		color: var(--ink);
		font: inherit;
	}

	input:focus-visible {
		outline-offset: -1px;
		border-color: var(--pen);
	}

	.hint {
		margin: 0;
		padding: 8px 16px;
		color: var(--ink-soft);
		font-size: 13px;
	}
</style>
