<script lang="ts">
	import type { Shape, Stroke } from '#lib/api.js';
	import type { Route } from './route.js';

	let {
		route,
		shape = 'curved',
		stroke = 'solid',
		selected = false,
		dimmed = false,
		draft = false,
		onpointerdown,
		ondblclick,
		oncontextmenu
	}: {
		route: Route;
		shape?: Shape;
		stroke?: Stroke;
		selected?: boolean;
		/** Faded, while the selected cards' links stand out. */
		dimmed?: boolean;
		/** Dashed, while it is being drawn. */
		draft?: boolean;
		/** Given these, a wide invisible line along the curve takes the pointer. */
		onpointerdown?: (e: PointerEvent) => void;
		ondblclick?: (e: MouseEvent) => void;
		oncontextmenu?: (e: MouseEvent) => void;
	} = $props();

	/** The radius of a thread's pin head, in world units. */
	const PIN = 6;
</script>

<!-- A 1px SVG at the world origin, drawing past its edges: at zero size it would draw nothing. -->
<svg class="edge-line" class:thread={shape === 'thread'} class:selected class:dimmed class:draft data-stroke={stroke}>
	{#if onpointerdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<path class="hit" d={route.path} {onpointerdown} {ondblclick} {oncontextmenu} />
	{/if}
	{#if shape === 'thread'}
		<!-- A thread stands off the board on its pins: their shadows fall a little below them. -->
		<g class="shadow">
			<path class="line" d={route.path} />
			{#each route.pins as pin, i (i)}
				<circle cx={pin.x} cy={pin.y} r={PIN} />
			{/each}
		</g>
	{/if}
	<path class="line" d={route.path} />
	{#if stroke === 'double'}
		<!-- Paper down the middle of a wide line leaves two, as a label is pasted over the line. -->
		<path class="gap" d={route.path} />
	{/if}
	{#each route.arrows as points (points)}
		<polygon {points} />
	{/each}
	<!-- Each pin's head over the thread's end, with a glint of light on it. -->
	{#each route.pins as pin, i (i)}
		<circle class="pin" cx={pin.x} cy={pin.y} r={PIN} />
		<circle class="glint" cx={pin.x - PIN / 3} cy={pin.y - PIN / 3} r={PIN / 3} />
	{/each}
</svg>

<style>
	.edge-line {
		position: absolute;
		left: 0;
		top: 0;
		width: 1px;
		height: 1px;
		overflow: visible;
		pointer-events: none;
		color: var(--ink-soft);
		transition: color var(--fade);
	}

	/* A thread is drawn in the theme's thread color: red string, in every theme. */
	.thread {
		color: var(--thread);
	}

	/* Selecting shows at once; only dimming fades. */
	.selected,
	.draft {
		color: var(--pen);
		transition: none;
	}

	.dimmed {
		color: var(--edge-dim);
	}

	.thread.dimmed {
		color: var(--thread-dim);
	}

	path {
		fill: none;
	}

	/* --px: a world pixel while open, a screen pixel once zones collapse and lines stand for bundles. */
	.line {
		stroke: currentColor;
		stroke-width: calc(1.5 * var(--px));
	}

	/* A string is thicker than a drawn line. */
	.thread .line {
		stroke-width: calc(2.5 * var(--px));
	}

	/* A little below the thread. Its path is a .line too, so it takes the thread's dashes or dots. */
	.shadow {
		transform: translate(1.5px, 3px);
		transition: opacity var(--fade);
	}

	.shadow .line {
		stroke: var(--thread-shadow);
	}

	.shadow circle {
		fill: var(--thread-shadow);
	}

	.pin {
		fill: currentColor;
	}

	.glint {
		fill: var(--glint);
		transition: opacity var(--fade);
	}

	/* Dimmed, the pins lose their light and the thread its shadow, as the rest fades into the paper. */
	.dimmed :is(.shadow, .glint) {
		opacity: var(--dim);
	}

	.draft .line {
		stroke-dasharray: 6 4;
	}

	[data-stroke='dashed'] .line {
		stroke-dasharray: 8 5;
	}

	/* Dashes of no length, with round ends: dots. */
	[data-stroke='dotted'] .line {
		stroke-width: 2.25;
		stroke-dasharray: 0 5;
		stroke-linecap: round;
	}

	[data-stroke='double'] .line {
		stroke-width: 5;
	}

	.gap {
		stroke: var(--paper);
		stroke-width: 2;
	}

	polygon {
		fill: currentColor;
	}

	.hit {
		stroke: transparent;
		stroke-width: calc(14 * var(--px));
		pointer-events: stroke;
	}
</style>
