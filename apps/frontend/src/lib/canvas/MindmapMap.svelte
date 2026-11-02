<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HAlign, VAlign } from '#lib/api.js';
	import { blockLinks, renderInline, renderMarkdown } from '#lib/markdown.js';
	import { layout, type Key, type MindNode, type Placed, type Size } from './mindmap.js';

	let {
		root,
		halign,
		valign,
		selected = null,
		typing = null,
		field,
		onpick,
		onopen
	}: {
		root: MindNode;
		halign: HAlign;
		valign: VAlign;
		/** The node selected in an open mindmap; null while it is closed. */
		selected?: Key | null;
		/** The node whose text is being typed: `field` shows in its place. */
		typing?: Key | null;
		field?: Snippet;
		/** A press on a node, and a double-click. */
		onpick?: (key: Key) => void;
		onopen?: (key: Key) => void;
	} = $props();

	/** Room around the map; between a node and its children's column, and between branches. */
	const PAD = 4;
	const GAP = { x: 36, y: 8 };
	/** Half the width of a node's line and of a curve, so a curve meets the line on its middle. */
	const HALF = 0.75;
	const ALIGN = { left: 0, center: 0.5, right: 1, top: 0, bottom: 1 };

	/** Each node's size as drawn, kept as it changes: its text wraps and its fonts load. */
	let sizes = $state<Record<Key, Size>>({});
	const map = $derived(layout(root, (key) => sizes[key], GAP));
	const byKey = $derived(new Map(map.nodes.map((p) => [p.key, p])));
	/** Shown once every node is measured, so it never shows piled up; a node added later is laid out
	 * as it is measured. */
	let ready = $state(false);
	$effect(() => {
		if (map.nodes.every((p) => sizes[p.key])) ready = true;
	});
	let width = $state(0);
	let height = $state(0);
	const w = $derived(map.w + 2 * PAD);
	const h = $derived(map.h + 2 * PAD);
	/** Shrunk to fit the card, never grown. */
	const scale = $derived(Math.min(1, width / w, height / h));

	/** The curve from a node's parent: out of the root's right side, or the right end of the line a
	 * node sits on, into the left end of this node's line. */
	function curve(p: Placed) {
		const from = byKey.get(p.parent!)!;
		const [x1, y1] = [from.x + from.w, from.parent === null ? from.y + from.h / 2 : from.y + from.h - HALF];
		const [x2, y2] = [p.x, p.y + p.h - HALF];
		const mid = (x1 + x2) / 2;
		return `M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
	}

	function measure(node: HTMLElement, key: Key) {
		const observer = new ResizeObserver(() => (sizes[key] = { w: node.offsetWidth, h: node.offsetHeight }));
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
				delete sizes[key];
			}
		};
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="frame" bind:clientWidth={width} bind:clientHeight={height} onclick={blockLinks}>
	<div
		class="map"
		class:ready
		style:width="{w}px"
		style:height="{h}px"
		style:left="{(width - w * scale) * ALIGN[halign]}px"
		style:top="{(height - h * scale) * ALIGN[valign]}px"
		style:scale
	>
		<svg width={w} height={h} aria-hidden="true">
			<g transform="translate({PAD} {PAD})">
				{#each map.nodes as p (p.key)}
					{#if p.parent !== null}
						<path d={curve(p)} />
					{/if}
				{/each}
			</g>
		</svg>
		{#each map.nodes as p (p.key)}
			<div
				class="node"
				class:root={p.parent === null}
				class:selected={p.key === selected}
				style:left="{p.x + PAD}px"
				style:top="{p.y + PAD}px"
				use:measure={p.key}
				onpointerdown={() => onpick?.(p.key)}
				ondblclick={() => onopen?.(p.key)}
			>
				{#if p.key === typing}
					{@render field?.()}
				{:else if p.node.title || p.parent !== null}
					<span class="title">{@html renderInline(p.node.title)}</span>
					{#if p.node.body}
						<div class="body">{@html renderMarkdown(p.node.body)}</div>
					{/if}
				{:else}
					<!-- An empty mindmap: a faint root. -->
					<span class="title placeholder">Mindmap</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	/* The card's whole inside, the map fitted in it where the card's alignment puts it. Fading in while
	   the card appears (--shown, from Card.svelte). */
	.frame {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
		text-align: left;
		opacity: var(--shown);
	}

	.map {
		position: absolute;
		transform-origin: 0 0;
		visibility: hidden;
	}

	.map.ready {
		visibility: visible;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
		pointer-events: none;
	}

	path {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 1.5;
	}

	/* Every node but the root sits on a line its curve runs into. */
	.node {
		position: absolute;
		box-sizing: border-box;
		width: max-content;
		min-width: 1.5em;
		min-height: 1.6em;
		max-width: 220px;
		padding: 2px 4px 3px;
		border-bottom: 1.5px solid var(--ink-soft);
		font-size: 13.5px;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.root {
		padding: 5px 10px;
		border: 1.5px solid var(--ink);
		border-radius: 6px;
		font-size: 15px;
		font-weight: 600;
	}

	.title {
		display: block;
	}

	.placeholder {
		opacity: 0.4;
	}

	.selected {
		border-radius: 3px 3px 0 0;
		background: color-mix(in srgb, var(--pen) 14%, transparent);
	}

	.root.selected {
		border-radius: 6px;
		outline: 2px solid var(--pen);
		outline-offset: 1px;
	}

	/* Its text under its title, smaller and softer. */
	.body {
		margin-top: 2px;
		color: var(--ink-soft);
		font-size: 12px;
		font-weight: 400;
		line-height: 1.4;
	}

	.body :global(:is(p, ul, ol, pre, blockquote)) {
		margin: 0 0 0.3em;
	}

	.body :global(:last-child) {
		margin-bottom: 0;
	}

	.body :global(:is(ul, ol)) {
		padding-left: 1.2em;
	}

	.node :global(code) {
		padding: 0 3px;
		border-radius: var(--radius-mark);
		background: var(--paper);
		font-size: 0.88em;
	}
</style>
