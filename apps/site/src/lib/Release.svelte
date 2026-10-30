<!-- The latest release, asked of GitHub in the browser: its installers by platform, a button for the
     visitor's own first. Until there is a release it says so; when GitHub does not answer, it links to
     the releases page. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '#lib/Card.svelte';
	import { NAME, REPO } from '#lib/app.js';

	type Os = 'windows' | 'macos' | 'linux';
	type Asset = { name: string; size: number; browser_download_url: string };
	type Answer = { name: string; tag_name: string; published_at: string; html_url: string; assets: Asset[] };
	type Installer = { os: Os; kind: string; file: string; url: string; size: number };

	const SYSTEMS: { os: Os; name: string }[] = [
		{ os: 'windows', name: 'Windows' },
		{ os: 'macos', name: 'macOS' },
		{ os: 'linux', name: 'Linux' }
	];

	/** What each file of a release is, by the name Tauri's bundler gives it. Files that match none
	 * (signatures, updater archives) are left out. The first match wins. */
	const KINDS: { os: Os; kind: string; test: RegExp }[] = [
		{ os: 'windows', kind: 'Installer (.exe)', test: /\.exe$/i },
		{ os: 'windows', kind: 'Installer (.msi)', test: /\.msi$/i },
		{ os: 'macos', kind: 'Apple silicon (.dmg)', test: /(aarch64|arm64).*\.dmg$/i },
		{ os: 'macos', kind: 'Intel (.dmg)', test: /(x64|x86_64).*\.dmg$/i },
		{ os: 'macos', kind: 'Universal (.dmg)', test: /\.dmg$/i },
		{ os: 'linux', kind: 'AppImage', test: /\.AppImage$/i },
		{ os: 'linux', kind: 'Debian and Ubuntu (.deb)', test: /\.deb$/i },
		{ os: 'linux', kind: 'Fedora and openSUSE (.rpm)', test: /\.rpm$/i }
	];

	/** The visitor's desktop system, or null on a phone, a tablet or anything else. */
	function visitorOs(): Os | null {
		const agent = navigator.userAgent;
		if (/android|iphone|ipad/i.test(agent)) return null;
		if (/windows/i.test(agent)) return 'windows';
		// An iPad asks for the desktop site as a Mac would, but has a touch screen.
		if (/mac os/i.test(agent)) return navigator.maxTouchPoints > 1 ? null : 'macos';
		if (/linux/i.test(agent)) return 'linux';
		return null;
	}

	const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

	let status = $state<'looking' | 'found' | 'none' | 'failed'>('looking');
	let release = $state<Answer>();
	let installers = $state<Installer[]>([]);
	let best = $state<Installer>();

	onMount(async () => {
		try {
			const answer = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
				headers: { Accept: 'application/vnd.github+json' }
			});
			if (answer.status !== 404 && !answer.ok) throw new Error(`GitHub answered ${answer.status}`);
			release = answer.ok ? await answer.json() : undefined;
			installers = (release?.assets ?? []).flatMap((asset) => {
				const kind = KINDS.find((k) => k.test.test(asset.name));
				return kind ? [{ os: kind.os, kind: kind.kind, file: asset.name, url: asset.browser_download_url, size: asset.size }] : [];
			});
			const os = visitorOs();
			best = installers.find((i) => i.os === os);
			status = installers.length ? 'found' : 'none';
		} catch {
			status = 'failed';
		}
	});
</script>

<section class="release wrap" aria-live="polite">
	{#if status === 'looking'}
		<p class="looking">Looking for the latest release.</p>
		<noscript>
			<p>Every release is listed on <a href="https://github.com/{REPO}/releases">the releases page on GitHub</a>.</p>
		</noscript>
	{:else if status === 'found' && release}
		<div class="pick">
			{#if best}
				<a class="button primary" href={best.url}>Download for {SYSTEMS.find((s) => s.os === best!.os)!.name}</a>
			{/if}
			<p class="meta">
				{release.name || release.tag_name}, released
				{new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(release.published_at))}.
				<a href={release.html_url}>Release notes</a>
			</p>
		</div>
		<div class="systems">
			{#each SYSTEMS as system (system.os)}
				{@const mine = installers.filter((i) => i.os === system.os)}
				<Card title={system.name}>
					{#if mine.length}
						<ul>
							{#each mine as installer (installer.file)}
								<li><a href={installer.url} title={installer.file}>{installer.kind}</a> <span>{megabytes(installer.size)}</span></li>
							{/each}
						</ul>
					{:else}
						<p>Not in this release.</p>
					{/if}
				</Card>
			{/each}
		</div>
	{:else if status === 'none'}
		<Card title="No desktop release yet">
			<p>The first release will appear here as soon as it is published. Until then, open {NAME} in your browser or build it from source, below.</p>
		</Card>
	{:else}
		<Card title="GitHub did not answer">
			<p>The latest release could not be looked up just now. Every release is listed on <a href="https://github.com/{REPO}/releases">the releases page</a>.</p>
		</Card>
	{/if}
</section>

<style>
	.release {
		display: grid;
		gap: 24px;
	}

	.looking {
		color: var(--ink-soft);
	}

	.pick {
		display: grid;
		justify-items: start;
		gap: 10px;
	}

	.pick .button {
		min-height: 52px;
		padding-inline: 26px;
		font-size: 1.125rem;
	}

	.meta {
		color: var(--ink-soft);
		font-size: 0.9375rem;
	}

	.systems {
		display: grid;
		gap: 14px;
	}

	@media (min-width: 760px) {
		.systems {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		margin-top: 6px;
	}

	li a {
		font-weight: 500;
	}

	li span {
		margin-left: 6px;
		color: var(--ink-soft);
		font-size: 0.875rem;
	}
</style>
