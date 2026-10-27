<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import MoveHorizontal from '@lucide/svelte/icons/move-horizontal';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import Slash from '@lucide/svelte/icons/slash';
	import Spline from '@lucide/svelte/icons/spline';
	import type { Arrow, Shape } from '#lib/api.js';
	import { arrowSelected, shapeSelected } from './actions.js';
	import { selection } from './selection.svelte.js';
	import AngledIcon from './AngledIcon.svelte';

	const shapes: [Shape, string, LucideIcon][] = [
		['curved', 'Curved', Spline],
		['straight', 'Straight', Slash],
		['angled', 'Angled', AngledIcon]
	];
	const arrows: [Arrow, string, LucideIcon][] = [
		['to', 'Arrow at the end', MoveRight],
		['both', 'Arrows at both ends', MoveHorizontal],
		['none', 'No arrow', Minus]
	];

	const edges = $derived(selection.edges);
	const shape = $derived(edges.every((e) => e.shape === edges[0].shape) ? edges[0]?.shape : undefined);
	const arrow = $derived(edges.every((e) => e.arrow === edges[0].arrow) ? edges[0]?.arrow : undefined);
</script>

{#snippet choices<T>(label: string, options: [T, string, LucideIcon][], current: T | undefined, pick: (value: T) => void)}
	<div class="choices" role="group" aria-label={label}>
		{#each options as [value, name, Icon] (name)}
			<button aria-label={name} title={name} class:on={current === value} onclick={() => pick(value)}>
				<Icon />
			</button>
		{/each}
	</div>
{/snippet}

{@render choices('Edge shape', shapes, shape, shapeSelected)}
{@render choices('Edge arrows', arrows, arrow, arrowSelected)}

<style>
	.choices {
		display: flex;
		gap: 2px;
	}

	button {
		display: flex;
		padding: 3px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	button:hover {
		background: var(--paper);
	}

	.on {
		background: var(--paper);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--border);
	}
</style>
