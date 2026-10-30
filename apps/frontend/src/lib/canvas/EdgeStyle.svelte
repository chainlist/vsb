<script lang="ts">
	import { Icon as Drawn, type LucideIcon, type LucideIconNode } from '@lucide/svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import MoveHorizontal from '@lucide/svelte/icons/move-horizontal';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import Slash from '@lucide/svelte/icons/slash';
	import Spline from '@lucide/svelte/icons/spline';
	import type { Arrow, EdgeStyle, Shape, Stroke } from '#lib/api.js';
	import AngledIcon from './AngledIcon.svelte';
	import StyleSelect from './StyleSelect.svelte';

	// An edge's shape, arrowheads and line, each as a small select: the selection bar's, for the
	// selected edges, and Settings', for new edges.
	let {
		style,
		pick
	}: {
		/** Each part shown; undefined where the edges it stands for differ. */
		style: Partial<EdgeStyle>;
		pick: { [K in keyof EdgeStyle]: (value: EdgeStyle[K]) => void };
	} = $props();

	/** A Lucide icon, or the elements of one Lucide lacks, drawn through its `Icon`. */
	type Glyph = LucideIcon | LucideIconNode[];

	const shapes: [Shape, string, Glyph][] = [
		['curved', 'Curved', Spline],
		['straight', 'Straight', Slash],
		['angled', 'Angled', AngledIcon]
	];
	const arrows: [Arrow, string, Glyph][] = [
		['to', 'Arrow at the end', MoveRight],
		['both', 'Arrows at both ends', MoveHorizontal],
		['none', 'No arrow', Minus]
	];
	// Lucide has no line styles: each is a line across the icon, as an edge runs between its cards.
	const strokes: [Stroke, string, Glyph][] = [
		['solid', 'Solid line', [['path', { d: 'M3 12h18' }]]],
		['dashed', 'Dashed line', [['path', { d: 'M3 12h4m3.5 0h4m3.5 0h3' }]]],
		['dotted', 'Dotted line', [['path', { d: 'M3 12h.01M7.5 12h.01M12 12h.01M16.5 12h.01M21 12h.01' }]]],
		['double', 'Double line', [['path', { d: 'M3 9h18M3 15h18' }]]]
	];
</script>

{#snippet icon(Icon: Glyph)}
	{#if Array.isArray(Icon)}
		<Drawn iconNode={Icon} />
	{:else}
		<Icon />
	{/if}
{/snippet}

<StyleSelect label="Edge shape" options={shapes} current={style.shape} pick={pick.shape} look={icon} />
<StyleSelect label="Edge arrows" options={arrows} current={style.arrow} pick={pick.arrow} look={icon} />
<StyleSelect label="Edge line" options={strokes} current={style.stroke} pick={pick.stroke} look={icon} />
