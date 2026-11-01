<script lang="ts">
	import { THEMES, theme } from '#lib/theme.svelte.js';

	// The themes as a grid of choices, the one on screen checked: Settings' Appearance tab's and the
	// onboarding's.
	let { pick }: { pick: (id: string) => void } = $props();
</script>

<div class="themes">
	{#each THEMES as t (t.id)}
		<label class="option">
			<!-- A corner of a canvas, drawn in that theme's own tokens, on the paper it would have. -->
			<span class="preview graph-paper" data-theme={t.id} data-paper={theme.paperIn(t.id)}>
				<span class="index-card note-card">
					<span class="index-card-title">Competitor scan</span>
					Price tiers first, then customer interviews.
				</span>
			</span>
			<span class="name">
				<input type="radio" name="theme" value={t.id} checked={theme.id === t.id} onchange={() => pick(t.id)} />
				{t.name}
			</span>
		</label>
	{/each}
</div>

<style>
	.themes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 18px;
	}

	.option {
		display: grid;
		gap: 10px;
		cursor: pointer;
	}

	.preview {
		position: relative;
		display: block;
		height: 150px;
		overflow: hidden;
		border-radius: var(--radius-control);
		box-shadow: inset 0 0 0 1px var(--border);
	}

	/* In the preview's own accent: the theme picked is the one on screen. */
	.option:has(:checked) .preview {
		box-shadow: 0 0 0 2px var(--pen);
	}

	.index-card {
		position: absolute;
		left: 24px;
		top: 24px;
		width: 200px;
	}

	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
	}

	input {
		margin: 0;
		accent-color: var(--pen);
	}
</style>
