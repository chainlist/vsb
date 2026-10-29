<script lang="ts">
	import Eraser from '@lucide/svelte/icons/eraser';
	import FileQuestionMark from '@lucide/svelte/icons/file-question-mark';
	import type { CardView } from '#lib/api.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import { clear } from './actions.js';

	let { card, missing }: { card: CardView; missing: boolean } = $props();

	// Links render, but following one would navigate the whole app away.
	function blockLinks(e: MouseEvent) {
		if ((e.target as Element).closest('a')) e.preventDefault();
	}
</script>

{#if missing}
	<strong class="notice icon-label"><FileQuestionMark /> Note not found</strong>
	<span class="hint">Its file is missing, or not synced to this device yet.</span>
	<button class="clear icon-label" title="Turn it into an empty card" onclick={() => clear(card)}><Eraser size={14} /> Clear</button>
{:else if card.note}
	<strong class="index-card-title">{card.title}</strong>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="body" onclick={blockLinks}>{@html renderMarkdown(card.excerpt ?? '')}</div>
{/if}

<style>
	/* Fading in while the card appears (--shown, from Card.svelte). */
	.notice,
	.hint,
	.clear,
	.index-card-title,
	.body {
		opacity: var(--shown);
	}

	.notice {
		font-size: 14px;
		font-weight: 600;
	}

	.hint {
		margin-top: 4px;
		font-size: 13px;
		line-height: 1.4;
	}

	.clear {
		align-self: flex-start;
		margin-top: 8px;
		padding: 3px 10px;
		border: 1px solid currentColor;
		border-radius: var(--radius-control);
		background: none;
		color: inherit;
		font: 500 13px var(--font-ui);
		cursor: pointer;
	}

	.clear:hover {
		background: var(--card);
	}

	.body :global(:is(p, ul, ol, pre, blockquote)) {
		margin: 0 0 0.4em;
	}

	.body :global(:is(h1, h2, h3, h4, h5, h6)) {
		margin: 0.5em 0 0.2em;
		font-size: 1em;
		font-weight: 600;
	}

	.body :global(:is(ul, ol)) {
		padding-left: 1.25em;
	}

	.body :global(blockquote) {
		padding-left: 10px;
		border-left: 2px solid var(--border);
		color: var(--ink-soft);
	}

	.body :global(code) {
		padding: 0 3px;
		border-radius: var(--radius-mark);
		background: var(--paper);
		font-size: 0.88em;
	}
</style>
