<script lang="ts" generics="T, G">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	// One style of the selection in the selection bar (or of new edges, in Settings), as a small
	// select: the trigger shows the current choice's look, or "Mixed" when the selected items differ;
	// its list shows each choice's look and name.
	let {
		label,
		options,
		current,
		pick,
		look
	}: {
		/** What is chosen, for its tooltip and screen readers. */
		label: string;
		/** Each choice: its value, its name, and what `look` draws it from. */
		options: [T, string, G][];
		/** The value the selected items share; undefined when they differ. */
		current: T | undefined;
		pick: (value: T) => void;
		look: Snippet<[G]>;
	} = $props();

	const chosen = $derived(options.find(([value]) => value === current));
	const title = $derived(`${label}: ${chosen?.[1] ?? 'mixed'}`);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button {...props} class="trigger" {title} aria-label={title}>
				{#if chosen}
					{@render look(chosen[2])}
				{:else}
					<span class="mixed">Mixed</span>
				{/if}
				<ChevronDown size={12} />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<!-- Closing it leaves the focus off the trigger, so the canvas's keys work again at once. -->
	<DropdownMenu.Content align="start" sideOffset={6} class="chrome" onCloseAutoFocus={(e) => e.preventDefault()}>
		{#each options as [value, name, glyph] (name)}
			<DropdownMenu.Item onSelect={() => pick(value)}>
				{@render look(glyph)}
				<span class="name">{name}</span>
				{#if value === current}
					<Check class="ms-auto" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style>
	.trigger {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 3px 4px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.trigger:hover,
	.trigger[data-state='open'] {
		background: var(--paper);
		color: var(--ink);
	}

	.mixed {
		font: 500 12px var(--font-ui);
	}

	.name {
		padding-right: 12px;
	}
</style>
