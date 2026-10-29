<script lang="ts">
	import { setDeviceWheel, setVaultEdgeStyle, setVaultSnap, type EdgeStyle as Style, type Wheel } from '#lib/api.js';
	import { snap } from '#lib/canvas/grid.svelte.js';
	import { newEdges } from '#lib/canvas/newEdges.svelte.js';
	import { wheel } from '#lib/canvas/wheel.svelte.js';
	import EdgeStyle from '#lib/canvas/EdgeStyle.svelte';
	import Segmented from '#lib/chrome/Segmented.svelte';
	import { ALT_NAME } from '#lib/keys.js';

	let error = $state('');

	// Each choice applies at once, then is kept: snapping and new edges in vault.json, the wheel for
	// this device. Each leaves out the default.
	async function keep(write: Promise<void>) {
		error = '';
		try {
			await write;
		} catch (e) {
			error = String(e);
		}
	}

	function toggle(on: boolean) {
		snap.on = on;
		keep(setVaultSnap(on));
	}

	function restyle(change: Partial<Style>) {
		newEdges.style = { ...newEdges.style, ...change };
		keep(setVaultEdgeStyle(newEdges.style));
	}

	function pickWheel(does: Wheel) {
		wheel.does = does;
		keep(setDeviceWheel(does));
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
</fieldset>

<fieldset>
	<legend>New edges</legend>
	<p class="hint">
		How the edges you draw, and those Tab and the builder add, look in this vault. The builder's arrows still say their
		own heads and line.
	</p>
	<div class="styles">
		<EdgeStyle
			style={newEdges.style}
			pick={{ shape: (shape) => restyle({ shape }), arrow: (arrow) => restyle({ arrow }), stroke: (stroke) => restyle({ stroke }) }}
		/>
	</div>
</fieldset>

<fieldset>
	<legend>Mouse wheel</legend>
	<p class="hint">
		What the wheel does on this device. When it pans, Shift+wheel pans sideways; either way, Ctrl+wheel and a pinch
		zoom.
	</p>
	<Segmented
		name="wheel"
		options={[
			['zoom', 'Zoom'],
			['pan', 'Pan']
		]}
		value={wheel.does}
		pick={pickWheel}
	/>
</fieldset>

{#if error}
	<p class="error">{error}</p>
{/if}

<style>
	.option {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-top: 14px;
		cursor: pointer;
	}

	.name {
		display: block;
		font-weight: 500;
	}

	.option .hint {
		display: block;
		margin-top: 2px;
	}

	input {
		margin: 0;
		accent-color: var(--pen);
	}

	/* The selection bar's selects, on a strip of their own. */
	.styles {
		display: inline-flex;
		gap: 2px;
		padding: 4px;
		border-radius: var(--radius-control);
		box-shadow: inset 0 0 0 1px var(--border);
	}
</style>
