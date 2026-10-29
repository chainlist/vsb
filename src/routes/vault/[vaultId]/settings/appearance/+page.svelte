<script lang="ts">
	import { setDeviceInterfaceSize, setVaultTheme } from '#lib/api.js';
	import Segmented from '#lib/chrome/Segmented.svelte';
	import { DEFAULT_INTERFACE_SIZE, INTERFACE_SIZES, interfaceSize } from '#lib/interfaceSize.svelte.js';
	import { DEFAULT_THEME, THEMES, theme } from '#lib/theme.svelte.js';

	let error = $state('');

	// Each choice shows at once, then is kept: the theme in vault.json, the size for this device.
	// Both leave the default out.
	async function keep(write: Promise<void>) {
		error = '';
		try {
			await write;
		} catch (e) {
			error = String(e);
		}
	}

	function pickTheme(id: string) {
		theme.id = id;
		keep(setVaultTheme(id === DEFAULT_THEME ? null : id));
	}

	function pickSize(percent: number) {
		interfaceSize.percent = percent;
		keep(setDeviceInterfaceSize(percent === DEFAULT_INTERFACE_SIZE ? null : percent));
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
					<input type="radio" name="theme" value={t.id} checked={theme.id === t.id} onchange={() => pickTheme(t.id)} />
					{t.name}
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<fieldset>
	<legend>Interface size</legend>
	<p class="hint">How large controls and panels are on this device. Cards, zones and lines keep their size.</p>
	<Segmented
		name="size"
		options={INTERFACE_SIZES.map((percent): [number, string] => [percent, `${percent}%`])}
		value={interfaceSize.percent}
		pick={pickSize}
	/>
</fieldset>

{#if error}
	<p class="error">{error}</p>
{/if}

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
