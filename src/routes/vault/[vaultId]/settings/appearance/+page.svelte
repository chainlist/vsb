<script lang="ts">
	import { setVaultTheme } from '#lib/api.js';
	import { DEFAULT_THEME, THEMES, theme } from '#lib/theme.svelte.js';

	let error = $state('');

	// Shown at once, then written to vault.json, which leaves the default out.
	async function pick(id: string) {
		theme.id = id;
		error = '';
		try {
			await setVaultTheme(id === DEFAULT_THEME ? null : id);
		} catch (e) {
			error = String(e);
		}
	}
</script>

<fieldset>
	<legend>Theme</legend>
	<p class="hint">How this vault looks, on every device that opens it.</p>
	<div class="themes">
		{#each THEMES as t (t.id)}
			<label class="option">
				<!-- A corner of a canvas, drawn in that theme's own tokens. -->
				<span class="preview graph-paper" data-theme={t.id}>
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
	{#if error}
		<p class="error">{error}</p>
	{/if}
</fieldset>

<style>
	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		padding: 0;
		font-weight: 600;
		font-size: 16px;
	}

	.hint {
		margin: 4px 0 18px;
		color: var(--ink-soft);
		font-size: 14px;
	}

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
