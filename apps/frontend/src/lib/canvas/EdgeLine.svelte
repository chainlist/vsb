<script lang="ts">
	import type { Shape, Stroke } from '#lib/api.js';
	import type { Route } from './route.js';

	let {
		route,
		shape = 'curved',
		px = 1,
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
		/** World units per pixel a thread's tacks and shadow are sized in: 1 for an edge, which zooms with
		 * its cards, or one screen pixel for a bundle, which does not. */
		px?: number;
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

	/** The radius of a thread's thumbtack, in pixels of `px` world units. */
	const PIN = 6.5;
	/** Names this line's gradients apart from every other line's. */
	const id = $props.id();
</script>

<!-- A 1px SVG at the world origin, drawing past its edges: at zero size it would draw nothing. -->
<svg class="edge-line" class:thread={shape === 'thread'} class:selected class:dimmed class:draft data-stroke={stroke}>
	{#if onpointerdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<path class="hit" d={route.path} {onpointerdown} {ondblclick} {oncontextmenu} />
	{/if}
	{#if shape === 'thread'}
		<!-- Steel lit from the top left: light on the tack, its rim in shade, its shadow soft. -->
		<defs>
			<radialGradient id="{id}-light" cx="36%" cy="30%" r="62%">
				<stop offset="0" style="stop-color: var(--glint)" />
				<stop offset="0.22" style="stop-color: var(--glint); stop-opacity: 0.4" />
				<stop offset="0.55" style="stop-color: var(--glint); stop-opacity: 0" />
			</radialGradient>
			<radialGradient id="{id}-shade" cx="42%" cy="38%" r="62%">
				<stop offset="0.55" style="stop-color: var(--pin-edge); stop-opacity: 0" />
				<stop offset="1" style="stop-color: var(--pin-edge); stop-opacity: 0.6" />
			</radialGradient>
			<radialGradient id="{id}-shadow">
				<stop offset="0" style="stop-color: var(--thread-shadow)" />
				<stop offset="0.55" style="stop-color: var(--thread-shadow); stop-opacity: 0.65" />
				<stop offset="1" style="stop-color: var(--thread-shadow); stop-opacity: 0" />
			</radialGradient>
		</defs>
		<!-- A thread stands off the board between its tacks: its shadow falls a little below it. -->
		<g class="shadow">
			<path class="line" d={route.path} transform="translate({1.5 * px} {3 * px})" />
			{#each route.pins as pin, i (i)}
				<ellipse transform="translate({pin.x} {pin.y}) scale({px})" cx="1" cy="1.6" rx={PIN * 1.2} ry={PIN * 1.1} fill="url(#{id}-shadow)" />
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
	<!-- A steel thumbtack over each end of the thread: a disc with a ring and a dimple at its middle. -->
	{#each route.pins as pin, i (i)}
		<g transform="translate({pin.x} {pin.y}) scale({px})">
			<circle class="tack" r={PIN} />
			<circle class="lit" r={PIN} fill="url(#{id}-shade)" />
			<circle class="lit" r={PIN} fill="url(#{id}-light)" />
			<circle class="ring" r={PIN * 0.62} />
			<circle class="ring" r={PIN - 0.25} />
			<circle class="dimple" r={PIN / 6} />
		</g>
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

	.shadow {
		transition: opacity var(--fade);
	}

	/* Its path is a .line too, so it takes the thread's dashes or dots. */
	.shadow .line {
		stroke: var(--thread-shadow);
	}

	/* Steel whatever the thread's color, selected or not. */
	.tack {
		fill: var(--pin);
		transition: fill var(--fade);
	}

	.ring {
		fill: none;
		stroke: var(--pin-edge);
		stroke-opacity: 0.6;
		stroke-width: 0.5;
	}

	.dimple {
		fill: var(--pin-edge);
		fill-opacity: 0.6;
	}

	.lit,
	.ring,
	.dimple {
		transition: opacity var(--fade);
	}

	.dimmed .tack {
		fill: var(--pin-dim);
	}

	/* Dimmed, the tacks lose their light and the thread its shadow, as the rest fades into the paper. */
	.dimmed :is(.shadow, .lit, .ring, .dimple) {
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
