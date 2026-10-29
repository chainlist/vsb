<script lang="ts">
	import { BUILDER_KEYS } from '#lib/canvas/batchDialog.svelte.js';
	import { CANVAS_KEYS, EDITING_KEYS } from '#lib/canvas/shortcuts.js';
	import { PICKER_KEYS } from '#lib/canvas/tab.svelte.js';
	import { wheel } from '#lib/canvas/wheel.svelte.js';
	import { keyName, type KeyHelp } from '#lib/keys.js';
	import { PANEL_KEYS } from '#lib/panel/panels.js';
	import { ZONE_LIST_KEYS } from '#lib/panel/zoneList.svelte.js';

	// Every key the app binds, by where it works, from the tables its bindings take their keys from,
	// so the list is what is bound. After them in a group, what no binding holds: keys a control takes
	// itself, and the mouse.
	const all = (table: Record<string, KeyHelp>) => Object.values(table);

	const groups = $derived<[string, KeyHelp[]][]>([
		['Canvas', all(CANVAS_KEYS)],
		['Editing', [...all(EDITING_KEYS), { keys: ['Enter'], label: "Finish an edge's label or a zone's name" }]],
		['Placing a linked card', all(PICKER_KEYS)],
		['Panels and settings', [...all(PANEL_KEYS), { keys: ['Escape'], label: 'Close settings' }]],
		['Zone list', [...all(ZONE_LIST_KEYS), { keys: ['Enter'], label: 'Frame and select the zone' }]],
		['Builder', [...all(BUILDER_KEYS), { keys: ['Escape'], label: 'Close the builder' }]],
		[
			'Mouse and trackpad',
			[
				{ keys: ['drag'], label: 'Move a card or a zone; on the paper, pan. The middle button pans from anywhere' },
				{ keys: ['wheel'], label: wheel.does === 'pan' ? 'Pan (Settings > Canvas)' : 'Zoom around the pointer (Settings > Canvas)' },
				{ keys: ['Shift+wheel'], label: 'Pan sideways, when the wheel pans' },
				{ keys: ['Ctrl+wheel', 'pinch'], label: 'Zoom around the pointer' },
				{ keys: ['double-click'], label: "Place a card on the paper, or edit a card, an edge's label or a zone's name" },
				{ keys: ['Shift+click'], label: 'Add to the selection, or take out of it' },
				{ keys: ['Mod+drag'], label: 'Draw an edge from a card, or a zone on the paper' },
				{ keys: ['Alt'], label: 'While dragging, move or resize freely, off the grid' }
			]
		]
	]);
</script>

<p class="hint">Every key and gesture, by where it works.</p>

{#each groups as [name, keys] (name)}
	<h3>{name}</h3>
	<dl>
		{#each keys as key (key.label)}
			<div>
				<dt>
					{#each key.keys as k (k)}
						<kbd>{keyName(k)}</kbd>
					{/each}
				</dt>
				<dd>{key.label}</dd>
			</div>
		{/each}
	</dl>
{/each}

<style>
	h3 {
		margin: 0 0 6px;
		font-weight: 600;
		font-size: 16px;
	}

	dl {
		margin: 0 0 28px;
	}

	dl div {
		display: grid;
		grid-template-columns: 180px minmax(0, 1fr);
		gap: 12px;
		padding: 7px 0;
		border-top: 1px solid var(--border);
	}

	dt {
		display: flex;
		flex-wrap: wrap;
		align-content: start;
		gap: 4px;
	}

	dd {
		margin: 0;
	}

	/* A key cap: the alternatives side by side. */
	kbd {
		padding: 1px 7px;
		border-radius: var(--radius-mark);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--border);
		font: 500 13px/1.5 var(--font-ui);
		white-space: nowrap;
	}

	@media (max-width: 640px) {
		dl div {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
	}
</style>
