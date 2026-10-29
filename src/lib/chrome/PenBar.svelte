<script lang="ts">
	import { page } from '$app/state';
	import Eraser from '@lucide/svelte/icons/eraser';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Scissors from '@lucide/svelte/icons/scissors';
	import { cubicOut } from 'svelte/easing';
	import { COLORS } from '#lib/canvas/colors.js';
	import { WIDTHS } from '#lib/canvas/ink.js';
	import { DRAWING_KEYS, ink, type Tool } from '#lib/canvas/pen.svelte.js';
	import { keyName } from '#lib/keys.js';
	import { motion } from '#lib/motion.js';
	import { PANELS } from '#lib/panel/panels.js';
	import Tip from './Tip.svelte';

	// Centered under the canvas, or under what a panel's sheet leaves of it.
	const beside = $derived(PANELS.some((p) => p.route === page.route.id));

	const TOOLS: [Tool, string, typeof PenLine, string | undefined][] = [
		['pen', 'Pen', PenLine, undefined],
		['stroke', 'Stroke eraser: takes out whole strokes', Eraser, keyName(DRAWING_KEYS.eraser.keys[0])],
		['cut', 'Cutting eraser: takes out what it passes over', Scissors, keyName(DRAWING_KEYS.eraser.keys[0])]
	];
	/** The ink first, then each highlighter as the pen draws it. */
	const colors = COLORS.map(([value, name]): [string | null, string] => [value, value === null ? 'Ink' : name]);

	/** Picks, then gives the keyboard back to the canvas. */
	function pick(e: MouseEvent, choose: () => void) {
		choose();
		(e.currentTarget as HTMLElement).blur();
	}

	/** Rises from below the window's bottom edge (its 44 pixels and the inset), eased, while it fades in
	 * evenly over the whole time, so it is still seen fading in once in place; going, it fades out in
	 * place, then sinks. It keeps the transform that centers it. */
	function rise(node: HTMLElement) {
		const transform = getComputedStyle(node).transform;
		const centered = transform === 'none' ? '' : transform;
		return { duration: motion(250), css: (t: number) => `transform: ${centered} translateY(${(1 - cubicOut(t)) * 60}px); opacity: ${t}` };
	}
</script>

<!-- While pen mode is on: what the hand holds, and the pen's color and width. Its buttons keep their
     keys, as the selection bar's menus do, until a pick gives the keyboard back to the canvas. -->
<div class="pens index-card chrome" class:beside role="toolbar" aria-label="Pen" data-own-keys transition:rise>
	<div class="group" role="radiogroup" aria-label="Tool">
		{#each TOOLS as [tool, label, Icon, keys] (tool)}
			<Tip {label} {keys} side="top">
				{#snippet children(props)}
					<button {...props} role="radio" aria-checked={ink.tool === tool} onclick={(e) => pick(e, () => ink.take(tool))}>
						<Icon />
					</button>
				{/snippet}
			</Tip>
		{/each}
	</div>
	<span class="sep"></span>
	<div class="group" role="radiogroup" aria-label="Color">
		{#each colors as [value, name] (name)}
			<Tip label={name} side="top">
				{#snippet children(props)}
					<button {...props} role="radio" aria-checked={ink.pen.color === value} onclick={(e) => pick(e, () => ink.choose({ color: value }))}>
						<span class="swatch inked" style:--tint={value}></span>
					</button>
				{/snippet}
			</Tip>
		{/each}
	</div>
	<span class="sep"></span>
	<div class="group" role="radiogroup" aria-label="Width">
		{#each WIDTHS as [width, name] (width)}
			<Tip label={name} side="top">
				{#snippet children(props)}
					<button {...props} role="radio" aria-checked={ink.pen.width === width} onclick={(e) => pick(e, () => ink.choose({ width }))}>
						<!-- A dot of its size, in the pen's color. -->
						<span class="dot inked" style:--tint={ink.pen.color} style:--size="{Math.max(3, width * 1.75)}px"></span>
					</button>
				{/snippet}
			</Tip>
		{/each}
	</div>
</div>

<style>
	.pens {
		position: fixed;
		bottom: var(--inset);
		left: 50%;
		display: flex;
		align-items: center;
		gap: 2px;
		height: 44px;
		padding: 0 6px;
		transform: translateX(-50%);
	}

	.beside {
		left: calc((100% - var(--panel)) / 2);
	}

	.group {
		display: flex;
		gap: 2px;
	}

	button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	button:hover {
		background: var(--paper);
		color: var(--ink);
	}

	[aria-checked='true'],
	[aria-checked='true']:hover {
		background: color-mix(in srgb, var(--pen) 12%, transparent);
		color: var(--pen);
	}

	/* The pen's colors as the swatches the selection bar's are, filled with the ink they draw. */
	.swatch {
		border-color: currentColor;
		background: currentColor;
	}

	.dot {
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background: currentColor;
	}

	.sep {
		width: 1px;
		height: 20px;
		margin: 0 4px;
		background: var(--border);
	}
</style>
