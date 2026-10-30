<!-- A part of the page, drawn as a zone of the canvas: a highlighter's wash over the paper, framed in
     the color inked, its name on the frame. The formulas are the app's own (Zone.svelte). -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	/** `color`: a highlighter, or null for the theme's gray, as a zone with none. */
	let { id, name, color = null, children }: { id: string; name: string; color?: string | null; children: Snippet } =
		$props();
</script>

<section class="zone" style:--zone-color={color ?? 'var(--zone-default)'} aria-labelledby={id}>
	<h2 {id}>{name}</h2>
	{@render children()}
</section>

<style>
	/* Its name, then what it holds, one under the other. */
	.zone {
		display: grid;
		gap: clamp(16px, 2.4vw, 28px);
		align-items: start;
		padding: clamp(18px, 3vw, 32px);
		border: 1.5px solid color-mix(in srgb, var(--zone-color) 70%, var(--ink));
		border-radius: var(--radius-zone);
		background: color-mix(in srgb, var(--zone-color) var(--zone-wash), transparent);
	}

	h2 {
		color: color-mix(in srgb, var(--zone-color) 35%, var(--ink));
		font-size: clamp(1.5rem, 1.05rem + 1.5vw, 2.25rem);
		font-weight: 600;
		font-stretch: var(--zone-stretch);
		line-height: 1.1;
	}
</style>
