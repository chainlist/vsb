<script lang="ts">
	import type { Component } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import { bindKeys } from '#lib/keys.js';
	import { camera } from './camera.svelte.js';
	import { picker } from './tab.svelte.js';

	type Point = { x: number; y: number };

	/** Closest the pad's middle comes to the canvas's sides, in screen pixels, so it stays whole. */
	const INSET = 60;
	// Each way: its arrow key, the way, its name and icon, and its cell around the card in a 3 by 3 grid.
	const WAYS: [string, Point, string, Component, string][] = [
		['ArrowUp', { x: 0, y: -1 }, 'Above', ArrowUp, '1 / 2'],
		['ArrowLeft', { x: -1, y: 0 }, 'Left', ArrowLeft, '2 / 1'],
		['ArrowRight', { x: 1, y: 0 }, 'Right', ArrowRight, '2 / 3'],
		['ArrowDown', { x: 0, y: 1 }, 'Below', ArrowDown, '3 / 2']
	];

	let pad = $state<HTMLDivElement>();
	const card = $derived(picker.card);
	// Over the card's middle, in screen space so it keeps its size at any zoom.
	const at = $derived.by(() => {
		if (!card) return null;
		const p = camera.toScreen(card.x + card.w / 2, card.y + card.h / 2);
		const within = (v: number, size: number) => Math.min(Math.max(v, INSET), size - INSET);
		return { x: within(p.x, camera.width), y: within(p.y, camera.height) };
	});

	// Arrow keys pick a way and Escape adds nothing; the canvas's keys are off meanwhile. A press
	// anywhere else cancels it too, and goes on to do what it does there.
	$effect(() => {
		if (!card) return;
		const unbind = bindKeys(
			[...WAYS.map(([key, way]) => ({ keys: [key], run: () => picker.answer(way) })), { keys: ['Escape'], run: () => picker.answer(null) }],
			{ modal: true }
		);
		const outside = (e: PointerEvent) => {
			if (!pad?.contains(e.target as Node)) picker.answer(null);
		};
		addEventListener('pointerdown', outside, true);
		return () => {
			unbind();
			removeEventListener('pointerdown', outside, true);
		};
	});
	const stop = (e: Event) => e.stopPropagation();
</script>

{#if at}
	<!-- The anchor holds the pad's place on screen; the pad inside it is drawn at the interface size. -->
	<div class="anchor" style:left="{at.x}px" style:top="{at.y}px">
		<div
			bind:this={pad}
			class="pad index-card chrome"
			role="dialog"
			aria-label="Where the new card goes"
			tabindex="-1"
			onpointerdown={stop}
			ondblclick={stop}
			{@attach (el) => el.focus()}
		>
			{#each WAYS as [key, way, name, Icon, cell] (key)}
				<button style:grid-area={cell} aria-label={name} title="{name} ({key.slice(5)} arrow)" onclick={() => picker.answer(way)}>
					<Icon />
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.anchor {
		position: absolute;
		transform: translate(-50%, -50%);
	}

	.pad {
		display: grid;
		grid-template: repeat(3, 28px) / repeat(3, 28px);
		gap: 2px;
		padding: 4px;
		outline: none;
	}

	.pad button {
		display: grid;
		place-items: center;
		padding: 0;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.pad button:hover,
	.pad button:focus-visible {
		background: var(--pen);
		color: var(--on-pen);
		outline: none;
	}
</style>
