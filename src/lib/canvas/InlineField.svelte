<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { selection } from './selection.svelte.js';

	// Edits a zone's name or an edge's label in place. Enter or a click elsewhere calls `done`, which
	// by default leaves the item's edit mode; the zone list ends its own renaming instead.
	let {
		value,
		placeholder,
		save,
		done = () => (selection.editing = null)
	}: { value: string; placeholder: string; save: (text: string) => void; done?: () => void } = $props();

	let text = $state('');
	let before = '';
	let field: HTMLInputElement;

	onMount(async () => {
		text = before = value;
		await tick();
		field.focus();
		field.select();
	});

	// However editing ends (Enter, Escape, a click elsewhere), the text typed so far is kept.
	onDestroy(() => {
		if (text.trim() !== before) save(text.trim());
	});

	const stop = (e: Event) => e.stopPropagation();
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		done();
	}}
>
	<input
		bind:this={field}
		bind:value={text}
		{placeholder}
		onblur={done}
		onpointerdown={stop}
		ondblclick={stop}
	/>
</form>

<style>
	/* As wide as the text, or the placeholder when empty. */
	input {
		field-sizing: content;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: inherit;
	}
</style>
