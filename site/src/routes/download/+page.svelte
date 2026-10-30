<script lang="ts">
	import { resolve } from '$app/paths';
	import Card from '#lib/Card.svelte';
	import Release from '#lib/Release.svelte';
	import { NAME, REPO } from '#lib/app.js';
</script>

<svelte:head>
	<title>Download {NAME}</title>
	<meta name="description" content="Download {NAME} for Windows, macOS or Linux, or open it in your browser." />
</svelte:head>

<section class="head wrap">
	<h1 class="headline">Download {NAME}</h1>
	<p class="lede">The desktop app keeps each vault as a folder of plain files on your computer, ready to sync and back up.</p>
</section>

<Release />

<section class="other wrap pair" aria-label="Other ways">
	<Card title="In your browser">
		<p>
			Nothing to install. Your vaults stay in this browser on this device: clearing the site's data clears them, so keep the notes you
			care about in the desktop app.
		</p>
		<p class="actions"><a class="button" href="{resolve('/')}web/" rel="external">Open in browser</a></p>
	</Card>
	<Card title="From source">
		<p>
			With <a href="https://nodejs.org">Node.js</a>, <a href="https://pnpm.io">pnpm</a> and the
			<a href="https://tauri.app/start/prerequisites/">Tauri prerequisites</a> installed, in a clone of
			<a href="https://github.com/{REPO}">the repository</a>:
		</p>
		<pre><code>{`pnpm install
pnpm tauri build`}</code></pre>
		<p>The installers land in <code>src-tauri/target/release/bundle</code>.</p>
	</Card>
</section>

<style>
	.head {
		padding-block: clamp(40px, 7vw, 88px) 32px;
	}

	h1 {
		font-size: clamp(2.5rem, 1.4rem + 4.4vw, 4.25rem);
	}

	.lede {
		margin-top: 24px;
	}

	.other {
		padding-block: clamp(48px, 7vw, 80px) 16px;
	}
</style>
