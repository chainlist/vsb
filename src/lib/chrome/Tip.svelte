<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	// A control shown by its icon alone: its name, and its shortcut if it has one, in a tooltip and
	// to screen readers.
	let {
		label,
		keys,
		side = 'right',
		children
	}: {
		label: string;
		keys?: string;
		side?: 'top' | 'right' | 'bottom' | 'left';
		/** The control, given the props to spread on it. */
		children: Snippet<[Record<string, unknown>]>;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			{@render children({ ...props, 'aria-label': label })}
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content {side} sideOffset={8} class="chrome px-2.5 py-1 text-[13px]">
		{label}
		{#if keys}
			<kbd class="shortcut">{keys}</kbd>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
