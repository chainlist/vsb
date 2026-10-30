<!-- The themes: a button per theme, named as the app names it, shows its screenshot, faded in over
     the others, and a line on its look. A theme with no screenshot yet is left out. -->
<script lang="ts">
	import { THEMES } from '#lib/app.js';
	import Shot from '#lib/Shot.svelte';
	import studio from '#lib/shots/canvas.webp';
	import cairn from '#lib/shots/theme-cairn.webp';
	import orbit from '#lib/shots/theme-orbit.webp';
	import pad from '#lib/shots/theme-pad.webp';
	import wilds from '#lib/shots/theme-wilds.webp';

	const looks: Record<string, { src: string; look: string }> = {
		studio: { src: studio, look: 'a cool gray canvas dotted at the grid crossings, white cards and a petrol accent.' },
		pad: { src: pad, look: 'sage graph paper, index cards with a red rule under the title, fountain-pen blue.' },
		orbit: { src: orbit, look: 'a deep navy grid with brighter nodes where its lines cross, and cards edged in light.' },
		cairn: { src: cairn, look: 'peat-moss paper, slate cards with a dim gold rule, fog-pale text.' },
		wilds: { src: wilds, look: 'deep-space indigo with stars at the grid crossings, warm cream text and a campfire-orange accent.' }
	};
	const themes = THEMES.filter((t) => t.id in looks);

	let picked = $state(themes[0].id);
	const name = $derived(themes.find((t) => t.id === picked)!.name);
</script>

<div class="names" role="group" aria-label="Theme">
	{#each themes as theme (theme.id)}
		<button type="button" aria-pressed={theme.id === picked} onclick={() => (picked = theme.id)}>{theme.name}</button>
	{/each}
</div>
<div>
	<div class="shots">
		{#each themes as theme (theme.id)}
			<div class:off={theme.id !== picked}><Shot src={looks[theme.id].src} alt="The thesis in {theme.name}." /></div>
		{/each}
	</div>
	<p class="look">{name}: {looks[picked].look}</p>
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

	.look {
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
