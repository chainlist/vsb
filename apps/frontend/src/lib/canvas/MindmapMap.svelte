<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import type { HAlign, VAlign } from '#lib/api.js';
	import { blockLinks, renderInline, renderMarkdown } from '#lib/markdown.js';
	import { motion } from '#lib/motion.js';
	import { layout, type Key, type MindNode, type Size } from './mindmap.js';

	let {
		root,
		ids,
		halign,
		valign,
		selected = null,
		typing = null,
		field,
		onpick,
		onopen
	}: {
		root: MindNode;
		/** An ID for each node that stays with it as the map changes, so it animates; without, a node is
		 * told by its key. */
		ids?: Map<Key, string>;
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
	/** How long a branch takes to grow out of its parent, draw back into it, or move, in ms. */
	const GROW = 260;

	/** A node as drawn: by its ID, with its parent's, where it is, and how far it has grown, from 0,
	 * folded into its parent's end, to 1. A node being removed has no key. */
	type Frame = Size & { id: string; key: Key | null; node: MindNode; parent: string | null; x: number; y: number; grown: number };

	const idOf = (key: Key) => ids?.get(key) ?? key;

	/** Each node's size as drawn, by its ID, kept as it changes: its text wraps and its fonts load. */
	let sizes = $state<Record<string, Size>>({});
	const map = $derived(layout(root, (key) => sizes[idOf(key)], GAP));
	/** Where each node goes. */
	const targets = $derived(
		map.nodes.map((p): Frame => ({ ...p, id: idOf(p.key), parent: p.parent === null ? null : idOf(p.parent), grown: 1 }))
	);
	/** Shown once every node is measured, so it never shows piled up; a node added later is laid out
	 * as it is measured. */
	let ready = $state(false);
	$effect(() => {
		if (map.nodes.every((p) => sizes[idOf(p.key)])) ready = true;
	});

	// The nodes as drawn, on their way from where they were (`from`, or `begins` for a node added) to
	// where they go (`to`, with the nodes being removed), since `start`.
	let frames = $state.raw<Frame[]>([]);
	let from = new Map<string, Frame>();
	let begins = new Map<string, Frame>();
	let to: Frame[] = [];
	let start = 0;
	let frame = 0;
	/** The map last drawn: a new one moves its nodes, new sizes alone do not. */
	let drawn: MindNode | undefined;

	$effect(() => {
		const next = targets;
		const tree = root;
		const moving = ready && motion(GROW) > 0;
		untrack(() => {
			const changed = drawn !== undefined && tree !== drawn;
			drawn = tree;
			// Sizes measured on the way, a new node's first, steer the nodes still moving.
			if (moving && (changed || frame)) plan(next, changed);
			else settle(next);
		});
	});

	onDestroy(() => cancelAnimationFrame(frame));

	/** The end of a node its children's curves leave from: the root's right side, another node's
	 * line's right end. */
	const end = (f: Frame) => ({ x: f.x + f.w, y: f.parent === null ? f.y + f.h / 2 : f.y + f.h - HALF });

	/** A node folded into the end of `into`, its line's left end there. */
	function folded(f: Frame, into: Frame): Frame {
		const at = end(into);
		return { ...f, x: at.x, y: at.y - f.h + HALF, grown: 0 };
	}

	/** Moves the nodes to `next`: from where they are drawn when the map changed, or on the way they
	 * were going when only sizes did. A node added grows out of its parent's end, from where its
	 * parent was; a node removed draws back into the end of its nearest ancestor that stays, with its
	 * children. */
	function plan(next: Frame[], changed: boolean) {
		if (changed) {
			from = new Map(frames.map((f) => [f.id, f]));
			start = performance.now();
		}
		const going = new Map(next.map((f) => [f.id, f]));
		begins = new Map();
		for (const f of next) {
			if (from.has(f.id) || f.parent === null) continue;
			const parent = from.get(f.parent) ?? begins.get(f.parent) ?? going.get(f.parent)!;
			begins.set(f.id, folded(f, parent));
		}
		const removed = [...from.values()]
			.filter((f) => !going.has(f.id))
			.map((f) => {
				let kept = f.parent;
				while (kept !== null && !going.has(kept)) kept = from.get(kept)?.parent ?? null;
				return { ...(kept === null ? f : folded(f, going.get(kept)!)), key: null, grown: 0 };
			});
		to = [...next, ...removed];
		if (!frame) frame = requestAnimationFrame(tick);
	}

	function tick(time: number) {
		const t = Math.min(1, (time - start) / GROW);
		const eased = cubicOut(t);
		const along = (a: number, b: number) => a + (b - a) * eased;
		frames = to.map((f) => {
			const was = from.get(f.id) ?? begins.get(f.id) ?? f;
			return { ...f, x: along(was.x, f.x), y: along(was.y, f.y), grown: along(was.grown, f.grown) };
		});
		if (t < 1) frame = requestAnimationFrame(tick);
		else settle(to.filter((f) => f.key !== null));
	}

	/** Draws the nodes where they go, at once. */
	function settle(next: Frame[]) {
		cancelAnimationFrame(frame);
		frame = 0;
		from = new Map();
		frames = next;
	}

	const byId = $derived(new Map(frames.map((f) => [f.id, f])));
	let width = $state(0);
	let height = $state(0);
	const w = $derived(Math.max(0, ...frames.map((f) => f.x + f.w)) + 2 * PAD);
	const h = $derived(Math.max(0, ...frames.map((f) => f.y + f.h)) + 2 * PAD);
	/** Shrunk to fit the card, never grown. */
	const scale = $derived(Math.min(1, width / w, height / h));

	/** The curve from a node's parent's end into the left end of this node's line. */
	function curve(f: Frame) {
		const parent = byId.get(f.parent!);
		if (!parent) return '';
		const { x: x1, y: y1 } = end(parent);
		const [x2, y2] = [f.x, f.y + f.h - HALF];
		const mid = (x1 + x2) / 2;
		return `M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
	}

	/** Each node's title and text rendered once, not on each step of an animation. */
	const rendered = new WeakMap<MindNode, { title: string; body: string }>();
	function html(n: MindNode) {
		let r = rendered.get(n);
		if (!r) rendered.set(n, (r = { title: renderInline(n.title), body: n.body ? renderMarkdown(n.body) : '' }));
		return r;
	}

	function measure(node: HTMLElement, id: string) {
		const observer = new ResizeObserver(() => (sizes[id] = { w: node.offsetWidth, h: node.offsetHeight }));
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
				delete sizes[id];
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
				{#each frames as f (f.id)}
					{#if f.parent !== null}
						<path d={curve(f)} style:opacity={f.grown < 1 ? f.grown : undefined} />
					{/if}
				{/each}
			</g>
		</svg>
		{#each frames as f (f.id)}
			{@const key = f.key}
			<div
				class="node"
				class:root={f.parent === null}
				class:selected={key !== null && key === selected}
				class:removed={key === null}
				style:left="{f.x + PAD}px"
				style:top="{f.y + PAD}px"
				style:opacity={f.grown < 1 ? f.grown : undefined}
				style:scale={f.grown < 1 ? 0.5 + f.grown / 2 : undefined}
				use:measure={f.id}
				onpointerdown={() => key !== null && onpick?.(key)}
				ondblclick={() => key !== null && onopen?.(key)}
			>
				{#if key !== null && key === typing}
					{@render field?.()}
				{:else if f.node.title || f.parent !== null}
					<span class="title">{@html html(f.node).title}</span>
					{#if f.node.body}
						<div class="body">{@html html(f.node).body}</div>
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
		/* Growing and drawing back from its line's left end, where its curve comes in. */
		transform-origin: 0 100%;
	}

	.removed {
		pointer-events: none;
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
