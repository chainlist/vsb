<script lang="ts">
	import Eraser from '@lucide/svelte/icons/eraser';
	import FileQuestionMark from '@lucide/svelte/icons/file-question-mark';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Link from '@lucide/svelte/icons/link';
	import { openLink, type CardView } from '#lib/api.js';
	import { isMod } from '#lib/keys.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import { clear } from './actions.js';
	import { imageUrl } from './images.js';
	import { hostOf } from './links.svelte.js';

	let { card, missing }: { card: CardView; missing: boolean } = $props();

	// Links render, but following one would navigate the whole app away: Ctrl+click opens it outside
	// the app instead, as on a link card.
	function blockLinks(e: MouseEvent) {
		const link = (e.target as Element).closest('a');
		if (!link) return;
		e.preventDefault();
		if (isMod(e)) void openLink(link.getAttribute('href') ?? '');
	}
</script>

{#if missing}
	<strong class="notice icon-label">
		{#if card.file}<ImageOff /> Image{:else}<FileQuestionMark /> Note{/if} not found
	</strong>
	<span class="hint">Its file is missing, or not synced to this device yet.</span>
	<button class="clear icon-label" title="Turn it into an empty card" onclick={() => clear(card)}><Eraser size={14} /> Clear</button>
{:else if card.file}
	{#await imageUrl(card.file) then url}
		<img class="image" src={url} alt="" draggable="false" />
	{:catch}
		<!-- Its file is missing: the card says so (missing). -->
	{/await}
{:else if card.link}
	{@const page = card.preview}
	{#if page?.image}
		{#await imageUrl(page.image) then url}
			<img class="cover" src={url} alt="" draggable="false" />
		{:catch}
			<!-- Its image is missing: the page shows without it. -->
		{/await}
	{/if}
	{#if page?.title || page?.description}
		{#if page.title}<strong class="page-title">{page.title}</strong>{/if}
		{#if page.description}<span class="description">{page.description}</span>{/if}
		<span class="site"><Link size={13} /><span>{hostOf(card.link)}</span></span>
	{:else}
		<strong class="index-card-title host"><Link size={15} /><span>{hostOf(card.link)}</span></strong>
		<span class="url">{card.link}</span>
	{/if}
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
	.body,
	.url,
	.cover,
	.page-title,
	.description,
	.site,
	.image {
		opacity: var(--shown);
	}

	/* A link card with what its page said of itself: the page's image across the top, edge to edge, in
	   the shape link previews are made for; its title, description and host under it. */
	.cover {
		flex: none;
		width: calc(100% + 28px);
		aspect-ratio: 1.91;
		margin: -12px -14px 10px;
		object-fit: cover;
		pointer-events: none;
	}

	.page-title,
	.description {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		flex: none;
		overflow: hidden;
		overflow-wrap: anywhere;
	}

	.page-title {
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 15px;
		font-weight: 600;
		line-height: 20px;
	}

	.description {
		-webkit-line-clamp: 3;
		line-clamp: 3;
		margin-top: 4px;
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 18px;
	}

	.site {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.4em;
		margin-top: auto;
		padding-top: 8px;
		color: var(--ink-soft);
		font: 12px var(--font-ui);
	}

	.site span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* A link card without: its page's host as its title, beside an icon, and its address under it, cut
	   short. */
	.host {
		display: flex;
		align-items: center;
		gap: 0.45em;
	}

	.host span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.url {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
		overflow-wrap: anywhere;
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 1.4;
	}

	/* The whole card, its shape kept as it is resized. */
	.image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
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
