<script lang="ts">
	import type { Component } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import type { Direction } from './batch.js';

	// Which way a batch's edges run in its layout.
	let { direction = $bindable() }: { direction: Direction } = $props();

	const DIRECTIONS: [Direction, string, Component][] = [
		['LR', 'Left to right', ArrowRight],
		['TB', 'Top to bottom', ArrowDown],
		['RL', 'Right to left', ArrowLeft],
		['BT', 'Bottom to top', ArrowUp]
	];
</script>

<div class="directions" role="group" aria-label="Direction">
	{#each DIRECTIONS as [value, name, Icon] (value)}
		<button aria-label={name} title={name} aria-pressed={direction === value} class:on={direction === value} onclick={() => (direction = value)}>
			<Icon />
		</button>
	{/each}
</div>

<style>
	.directions {
		display: flex;
		gap: 2px;
	}

	.directions button {
		display: flex;
		padding: 3px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.directions button:hover {
		background: var(--paper);
	}

	.directions .on {
		background: var(--paper);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--border);
	}
</style>
