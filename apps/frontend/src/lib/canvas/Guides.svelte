<script lang="ts">
	import { snap } from './grid.svelte.js';
</script>

<!-- Each line the card or zone being moved or resized shares with the cards around it: a faint
     hairline on screen at any zoom, with a dot where it meets each card. -->
{#each snap.guides as g (g.axis + g.at)}
	{#if g.axis === 'x'}
		<div class="guide down" style:left="{g.at}px" style:top="{g.from}px" style:height="{g.to - g.from}px"></div>
		{#each g.dots as d, i (i)}
			<div class="dot" style:left="{g.at}px" style:top="{d}px"></div>
		{/each}
	{:else}
		<div class="guide across" style:top="{g.at}px" style:left="{g.from}px" style:width="{g.to - g.from}px"></div>
		{#each g.dots as d, i (i)}
			<div class="dot" style:left="{d}px" style:top="{g.at}px"></div>
		{/each}
	{/if}
{/each}

<style>
	.guide,
	.dot {
		position: absolute;
		background: color-mix(in srgb, var(--pen) 40%, transparent);
		pointer-events: none;
	}

	.down {
		width: calc(1px * var(--scale));
		translate: -50% 0;
	}

	.across {
		height: calc(1px * var(--scale));
		translate: 0 -50%;
	}

	.dot {
		width: calc(4px * var(--scale));
		height: calc(4px * var(--scale));
		border-radius: 50%;
		background: color-mix(in srgb, var(--pen) 65%, transparent);
		translate: -50% -50%;
	}
</style>
