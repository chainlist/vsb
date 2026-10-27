<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { readNote, type CardView } from '#lib/api.js';
	import { editSession } from './editSession.js';
	import { items } from './items.svelte.js';
	import { selection } from './selection.svelte.js';

	let { card }: { card: CardView } = $props();

	let text = $state('');
	let ready = $state(false);
	let error = $state('');
	let field: HTMLTextAreaElement;
	let session: ReturnType<typeof editSession> | undefined;

	function fail(e: unknown) {
		console.error(e);
		error = String(e);
	}

	onMount(async () => {
		try {
			if (card.note) text = await readNote(card.note);
		} catch (e) {
			fail(e);
			selection.editing = null;
			return;
		}
		// A conflict ends edit mode: the card shows the note as it is on disk.
		session = editSession(card.id, card.note, text, fail, () => (selection.editing = null));
		ready = true;
		await tick();
		field.focus();
	});

	// However edit mode ends, the session finishes: last save, then the blur rules.
	onDestroy(() => session?.finish().then(() => items.changed()));
</script>

<textarea
	bind:this={field}
	bind:value={text}
	disabled={!ready}
	style:text-align={card.halign}
	oninput={() => session?.input(text)}
	onblur={() => (selection.editing = null)}
	onpointerdown={(e) => e.stopPropagation()}
	ondblclick={(e) => e.stopPropagation()}
></textarea>
{#if error}
	<p class="error">{error}</p>
{/if}

<style>
	textarea {
		flex: 1;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
		resize: none;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	.error {
		margin: 4px 0 0;
		font-size: 12px;
	}
</style>
