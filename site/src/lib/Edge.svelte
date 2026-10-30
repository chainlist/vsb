<!-- An edge from one part of the page to the next, as the canvas draws one: curved, with an arrowhead.
     `back` runs it from right to left. -->
<script lang="ts">
	let { back = false }: { back?: boolean } = $props();
</script>

<svg class:back viewBox="0 0 360 88" aria-hidden="true">
	<path d="M24 0 C24 56 336 32 336 82" fill="none" stroke="currentColor" stroke-width="1.5" />
	<path d="M330 76 L336 86 L342 76 Z" fill="currentColor" />
</svg>

<style>
	svg {
		display: block;
		width: min(40%, 360px);
		height: 88px;
		margin-inline: auto;
		overflow: visible;
		color: var(--ink-soft);
	}

	.back {
		transform: scaleX(-1);
	}

	@media (max-width: 899px) {
		svg {
			height: 48px;
		}
	}
</style>
