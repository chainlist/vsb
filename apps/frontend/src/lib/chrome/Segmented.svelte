<script lang="ts" generics="T">
	// One choice of a few, side by side, the one picked lifted off the track: a radio group, so the
	// arrow keys move between them.
	let {
		name,
		options,
		value,
		pick
	}: {
		/** The radio group's name. */
		name: string;
		/** Each choice: its value and what it reads. */
		options: [T, string][];
		value: T;
		pick: (value: T) => void;
	} = $props();
</script>

<div class="choices">
	{#each options as [option, text] (text)}
		<label>
			<input type="radio" {name} checked={value === option} onchange={() => pick(option)} />
			{text}
		</label>
	{/each}
</div>

<style>
	.choices {
		display: inline-flex;
		padding: 3px;
		border-radius: var(--radius-control);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--border);
	}

	label {
		position: relative;
		padding: 6px 16px;
		border-radius: var(--radius-control);
		color: var(--ink-soft);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	label:has(:checked) {
		background: var(--card);
		box-shadow: var(--lift);
		color: var(--ink);
	}

	label:has(:focus-visible) {
		outline: 2px solid var(--pen);
		outline-offset: 2px;
	}

	input {
		position: absolute;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}
</style>
