<script lang="ts">
	import Locate from '@lucide/svelte/icons/locate';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Portal } from 'bits-ui';
	import { deleteNote, type Entry } from '#lib/api.js';
	import { show } from '#lib/canvas/actions.js';
	import { camera } from '#lib/canvas/camera.svelte.js';
	import { NEW_CARD } from '#lib/canvas/gestures.js';
	import { items } from '#lib/canvas/items.svelte.js';
	import Tip from '#lib/chrome/Tip.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { failure } from '#lib/failure.svelte.js';
	import { bindKeys } from '#lib/keys.js';
	import { markdownText } from '#lib/markdown.js';
	import { ghost, startDrag } from './noteDrag.svelte.js';
	import { Paged } from './paged.svelte.js';

	let {
		load,
		empty,
		deletable = false
	}: {
		load: (offset: number, limit: number) => Promise<Entry[]>;
		empty: string;
		/** Whether each note has a delete button, as the Unplaced tray's do. */
		deletable?: boolean;
	} = $props();

	// The pages scrolled to, never every note.
	const list = new Paged(() => load);

	const key = (e: Entry) => (e.kind === 'note' ? `note:${e.path}` : `zone:${e.id}`);

	/** The note a delete asks about, kept while the dialog closes so its title stays. */
	let doomed = $state<Extract<Entry, { kind: 'note' }> | null>(null);
	let confirming = $state(false);

	// The canvas's keys are off while the dialog asks: Enter or Delete there never reach it.
	$effect(() => {
		if (confirming) return bindKeys([], { modal: true });
	});

	function remove() {
		confirming = false;
		deleteNote(doomed!.path)
			.catch(failure.report)
			.finally(() => items.changed());
	}
</script>

<div class="list">
	<ul>
		{#each list.lines as entry (key(entry))}
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
						class:deletable
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
					{#if deletable}
						<Tip label="Delete note" side="left">
							{#snippet children(props)}
								<button
									{...props}
									class="delete"
									onclick={() => {
										doomed = entry;
										confirming = true;
									}}
								>
									<Trash2 size={16} />
								</button>
							{/snippet}
						</Tip>
					{/if}
				{/if}
			</li>
		{/each}
		{#if list.more}
			<li class="status" {@attach list.atEnd}>Loading…</li>
		{/if}
	</ul>
	{#if list.loaded && !list.lines.length}
		<p class="status">{empty}</p>
	{/if}
</div>

<Dialog.Root bind:open={confirming}>
	<Dialog.Content class="chrome sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete “{doomed?.title || 'Untitled'}”?</Dialog.Title>
			<Dialog.Description>The note is deleted for good. This cannot be undone.</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button variant="destructive" onclick={remove}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

{#if ghost.note}
	<!-- The card as it will land: its size in the world, at the canvas's zoom. Out of the panel's
	     sheet, whose layout containment would place it in the sheet instead of the window. -->
	<Portal>
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
	</Portal>
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

	li {
		position: relative;
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

	/* Room for the delete button, top right. */
	.deletable {
		padding-right: 44px;
	}

	.delete {
		position: absolute;
		top: 8px;
		right: 10px;
		display: flex;
		padding: 5px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--danger);
		cursor: pointer;
	}

	.delete:hover {
		background: var(--danger-paper);
	}

	/* With a mouse, shown on the line under it or holding the keyboard. */
	@media (hover: hover) {
		li:not(:hover, :focus-within) .delete {
			opacity: 0;
		}
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
		/* Over the sheet, at 50. */
		z-index: 51;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		opacity: 0.9;
		pointer-events: none;
	}
</style>
