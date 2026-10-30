<!-- A card, as the app draws a note: its title, a rule under it, then the text. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<article class="card">
	<h3>{title}</h3>
	<div class="body">{@render children()}</div>
</article>

<style>
	.card {
		border-radius: var(--radius-card);
		background: var(--card);
		box-shadow: var(--lift);
	}

	h3 {
		padding: 12px 16px 10px;
		border-bottom: 1px solid var(--rule);
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.3;
	}

	.body {
		display: grid;
		gap: 10px;
		padding: 10px 16px 14px;
		color: var(--ink-soft);
		font-size: 0.98rem;
		line-height: 1.55;
	}

	.body :global(pre) {
		margin: 0;
		overflow-x: auto;
		color: var(--ink);
		line-height: 1.6;
	}

	.body :global(.actions) {
		padding-top: 6px;
	}
</style>
