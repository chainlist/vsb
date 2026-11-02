<!-- A button for each of a few screenshots: the one pressed shows its screenshot, faded in over the
     others, and a line on it. -->
<script lang="ts">
	import Shot from '#lib/Shot.svelte';

	/** `label` names the buttons as a group; each option names its button, and gives its screenshot and
	 * the line under it. */
	let { label, options }: { label: string; options: { id: string; name: string; src: string; alt: string; line: string }[] } = $props();

	let picked = $state(0);
</script>

<div class="names" role="group" aria-label={label}>
	{#each options as option, i (option.id)}
		<button type="button" aria-pressed={i === picked} onclick={() => (picked = i)}>{option.name}</button>
	{/each}
</div>
<div>
	<div class="shots">
		{#each options as option, i (option.id)}
			<div class:off={i !== picked}><Shot src={option.src} alt={option.alt} /></div>
		{/each}
	</div>
	<p class="line">{options[picked].name}: {options[picked].line}</p>
</div>

<style>
	.names {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	button {
		min-height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: var(--card);
		box-shadow: var(--lift);
		color: var(--ink);
		font: 500 0.98rem var(--font-ui);
		cursor: pointer;
	}

	[aria-pressed='true'] {
		background: var(--ink);
		box-shadow: none;
		color: var(--paper);
	}

	/* Stacked in one cell, so the page never moves as they swap. */
	.shots {
		display: grid;
	}

	.shots > * {
		grid-area: 1 / 1;
		transition: opacity 0.25s ease;
	}

	.off {
		opacity: 0;
		visibility: hidden;
	}

	.line {
		min-height: 3.2em;
		margin-top: 12px;
		color: var(--ink-soft);
		font-size: 0.9375rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.shots > * {
			transition: none;
		}
	}
</style>
