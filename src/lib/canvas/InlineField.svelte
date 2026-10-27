<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { selection } from './selection.svelte.js';

	// Edits a zone's name or an edge's label in place, while that item is in edit mode.
	let { value, placeholder, save }: { value: string; placeholder: string; save: (text: string) => void } = $props();

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
		selection.editing = null;
	}}
>
	<input
		bind:this={field}
		bind:value={text}
		{placeholder}
		onblur={() => (selection.editing = null)}
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
