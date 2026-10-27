<script lang="ts">
	import type { EdgeView } from '#lib/api.js';
	import { edit, label } from './actions.js';
	import { startMove } from './gestures.js';
	import { items } from './items.svelte.js';
	import { selection } from './selection.svelte.js';
	import EdgeLine from './EdgeLine.svelte';
	import InlineField from './InlineField.svelte';

	let { edge }: { edge: EdgeView } = $props();

	const line = $derived(items.routeOf(edge));
	const selected = $derived(selection.has(edge.id));
	const editing = $derived(selection.editing === edge.id);

	const press = (e: PointerEvent) => startMove(e, edge);

	function open(e: MouseEvent) {
		// Not a double-click on the canvas, which would place a card.
		e.stopPropagation();
		edit(edge);
	}
</script>

<!-- The line and its label: a press selects the edge, a double-click edits the label. -->
<EdgeLine route={line} {selected} onpointerdown={press} ondblclick={open} />
{#if editing || edge.label}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="label"
		class:selected
		style:left="{line.mid.x}px"
		style:top="{line.mid.y}px"
		onpointerdown={press}
		ondblclick={open}
	>
		{#if editing}
			<InlineField value={edge.label ?? ''} placeholder="Label" save={(text) => label(edge.id, text)} />
		{:else}
			{edge.label}
		{/if}
	</div>
{/if}

<style>
	/* Pasted over the line, centered on its middle. */
	.label {
		position: absolute;
		transform: translate(-50%, -50%);
		padding: 1px 6px;
		border-radius: var(--radius-control);
		background: var(--paper);
		color: var(--ink-soft);
		font: 500 13px/1.4 var(--font-ui);
		text-align: center;
		white-space: nowrap;
	}

	.selected {
		color: var(--pen);
	}
</style>
