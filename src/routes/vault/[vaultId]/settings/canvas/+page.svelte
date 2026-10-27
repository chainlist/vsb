<script lang="ts">
	import { setVaultSnap } from '#lib/api.js';
	import { snap } from '#lib/canvas/grid.svelte.js';
	import { ALT_NAME } from '#lib/keys.js';

	let error = $state('');

	// Applied at once, then written to vault.json, which leaves it out while on.
	async function toggle(on: boolean) {
		snap.on = on;
		error = '';
		try {
			await setVaultSnap(on);
		} catch (e) {
			error = String(e);
		}
	}
</script>

<fieldset>
	<legend>Moving and resizing</legend>
	<label class="option">
		<input type="checkbox" checked={snap.on} onchange={(e) => toggle(e.currentTarget.checked)} />
		<span>
			<span class="name">Snap to grid</span>
			<span class="hint">
				Cards and zones you move or resize line up with the graph paper's squares. Hold {ALT_NAME} while dragging to
				place them freely.
			</span>
		</span>
	</label>
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
		margin-bottom: 14px;
		font-weight: 600;
		font-size: 16px;
	}

	.option {
		display: flex;
		align-items: baseline;
		gap: 10px;
		cursor: pointer;
	}

	.name {
		display: block;
		font-weight: 500;
	}

	.hint {
		display: block;
		margin-top: 2px;
		color: var(--ink-soft);
		font-size: 14px;
	}

	input {
		margin: 0;
		accent-color: var(--pen);
	}
</style>
