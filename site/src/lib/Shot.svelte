<!-- A screenshot of the app, taken by site/shoot.mjs at 1440 by 900 and twice the pixels. -->
<script lang="ts">
	let { src, alt, caption }: { src: string; alt: string; caption?: string } = $props();
</script>

<figure>
	<img {src} {alt} width="2880" height="1800" loading="lazy" />
	{#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
	figure {
		margin: 0;
	}

	img {
		border-radius: var(--radius-card);
		box-shadow: var(--lift);
		background: var(--card);
	}

	figcaption {
		margin-top: 10px;
		color: var(--ink-soft);
		font-size: 0.9375rem;
	}
</style>
