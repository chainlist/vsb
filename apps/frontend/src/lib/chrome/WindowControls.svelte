<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Minus from '@lucide/svelte/icons/minus';
	import Square from '@lucide/svelte/icons/square';
	import X from '@lucide/svelte/icons/x';
	import type { WindowControls } from '#lib/api.js';
	import Tip from './Tip.svelte';

	let { controls }: { controls: WindowControls } = $props();

	let maximized = $state(false);

	$effect(() => {
		const check = async () => {
			maximized = await controls.isMaximized();
		};
		check();
		const off = controls.onResized(check);
		return () => void off.then((stop) => stop());
	});

	// What sits under the buttons and the band, such as a panel's close button or the selection
	// bar, keeps clear of them.
	$effect(() => {
		const root = document.documentElement.style;
		root.setProperty('--window-buttons', '138px');
		root.setProperty('--window-band', '32px');
		return () => {
			root.removeProperty('--window-buttons');
			root.removeProperty('--window-band');
		};
	});

	// The window's own, as a title bar is: a press here is not a press on the page, so it never
	// closes a dialog or a menu.
	const outside = (e: PointerEvent) => e.stopPropagation();
</script>

<!-- The window has no title bar: the band along its top moves it, and a double-click there
     maximizes it. It shows while the pointer is in it. -->
<div class="band" role="presentation" data-tauri-drag-region onpointerdown={outside}></div>

<!-- Flush in the top-right corner, as the system's own buttons are. -->
<div class="buttons" role="group" aria-label="Window" onpointerdown={outside}>
	<Tip label="Minimize" side="bottom">
		{#snippet children(props)}
			<button {...props} onclick={() => controls.minimize()}><Minus /></button>
		{/snippet}
	</Tip>
	<Tip label={maximized ? 'Restore' : 'Maximize'} side="bottom">
		{#snippet children(props)}
			<button {...props} onclick={() => controls.toggleMaximize()}>
				{#if maximized}<Copy size={14} />{:else}<Square size={14} />{/if}
			</button>
		{/snippet}
	</Tip>
	<Tip label="Close" side="bottom">
		{#snippet children(props)}
			<button {...props} class="close" onclick={() => controls.close()}><X /></button>
		{/snippet}
	</Tip>
</div>

<style>
	/* A modal dialog or menu turns the page's presses off, never the window's. */
	.band,
	.buttons {
		pointer-events: auto;
	}

	/* As tall as the buttons, over the canvas but under the vault card, the panels and dialogs. While
	   the window is not maximized, Windows resizes it from the top 4px of this; the rest moves it. */
	.band {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		height: var(--window-band);
		transition: background-color 150ms;
	}

	.band:hover {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}

	/* Three of 46 by 32, the system's size, whatever the interface size, over everything: the panels
	   and dialogs too, as a title bar's are. */
	.buttons {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 51;
		display: flex;
	}

	button {
		display: grid;
		place-items: center;
		width: 46px;
		height: 32px;
		border: none;
		background: none;
		color: var(--ink-soft);
		cursor: default;
	}

	button:hover {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		color: var(--ink);
	}

	.close:hover {
		background: var(--danger);
		color: var(--on-pen);
	}
</style>
