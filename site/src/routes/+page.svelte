<script lang="ts">
	import { resolve } from '$app/paths';
	import Card from '#lib/Card.svelte';
	import Edge from '#lib/Edge.svelte';
	import Shot from '#lib/Shot.svelte';
	import Themes from '#lib/Themes.svelte';
	import Zone from '#lib/Zone.svelte';
	import { NAME, highlighter } from '#lib/app.js';
	import builder from '#lib/shots/builder.webp';
	import canvas from '#lib/shots/canvas.webp';
	import links from '#lib/shots/links.webp';
	import map from '#lib/shots/map.webp';
	import panels from '#lib/shots/panels.webp';
	import pen from '#lib/shots/pen.webp';

	const download = `${resolve('/download')}/`;
	const web = `${resolve('/')}web/`;
</script>

<svelte:head>
	<title>{NAME}</title>
	<meta name="description" content="{NAME} is an infinite canvas for your notes: cards, zones and links, kept as plain Markdown files in a folder you own." />
</svelte:head>

<section class="hero wrap">
	<h1 class="headline">Lay your notes out like a map.</h1>
	<p class="lede">
		{NAME} is an infinite canvas for your notes. Place them as cards, gather them into zones, draw the links between them, and
		zoom out to see how it all fits. Every note stays a Markdown file in a folder you own.
	</p>
	<p class="actions">
		<a class="button primary" href={download}>Download</a>
		<a class="button" href={web} rel="external">Try it in your browser</a>
	</p>
</section>
<figure class="window wrap">
	<img
		src={canvas}
		width="2880"
		height="1800"
		alt="A thesis on the canvas: sources, ideas and chapters in three colored zones, labeled links between the cards, and a hand-drawn loop around one card."
	/>
</figure>

<!-- The parts follow one another like zones on a map, each a little to one side, an edge leading
     from one to the next. -->
<div class="map wrap">
	<Zone id="canvas" name="Cards, zones and links" color={highlighter('Blue')}>
		<div class="row">
			<Card title="A card is a note">
				<p>Double-click the paper to place a card and start typing. The first line is its title; the rest is Markdown.</p>
			</Card>
			<Card title="Zones group them">
				<p><kbd>Ctrl</kbd> drag on the paper to draw a zone. Zones nest, and moving one brings everything inside along.</p>
			</Card>
			<Card title="Links connect them">
				<p><kbd>Ctrl</kbd> drag from one card to another. Give the link a label, a dashed or dotted line, arrowheads at either end.</p>
			</Card>
			<Card title="Tab keeps you going">
				<p>Press <kbd>Tab</kbd> on a card to add a linked card after it, already open for typing.</p>
			</Card>
		</div>
		<Shot
			src={links}
			alt="The Replay card selected: the cards linked to it stay sharp, the others fade, and a small bar above it offers alignment, color, builder and delete."
			caption="Select a card and everything it is not linked to fades back."
		/>
	</Zone>

	<Edge />

	<Zone id="builder" name="Many cards at once" color={highlighter('Violet')}>
		<Shot src={builder} alt="The New cards dialog: three lines of text with arrows, and a preview of the six cards and five links they make." />
		<div class="row">
			<Card title="Type a few lines, get a map">
				<p>Press <kbd>Ctrl</kbd> <kbd>B</kbd>, write one idea per line and join them with arrows. The preview lays them out as you type.</p>
				<pre><code>{`Pilot study -> Main study --> Write-up
Pilot study .-> Ethics approval
Main study <=> EEG lab`}</code></pre>
				<p>One dash is a line, two are dashed, a dot is dotted, <code>=</code> is double.</p>
			</Card>
			<Card title="Rewire links as text">
				<p>Open the builder on cards already on the canvas: their links come back as lines to edit. Arrange lays the cards out along them.</p>
			</Card>
		</div>
	</Zone>

	<Edge back />

	<Zone id="zoom" name="Zoom out to see the whole map" color={highlighter('Green')}>
		<div class="row">
			<Card title="Zones become regions">
				<p>
					Below 40%, each zone shows the outline of what it holds, loose cards gather into counted stacks, and the links between two
					areas merge into one line with a count.
				</p>
			</Card>
			<Card title="Quick with thousands of cards">
				<p>The canvas only loads what is on screen. Click a stack, or double-click a zone, and it glides in until the cards show.</p>
			</Card>
		</div>
		<Shot
			src={map}
			alt="The vault at 25%: zones drawn as colored regions with the outline of their cards, stacks counting loose notes, and lines between regions marked with how many links they carry."
		/>
	</Zone>

	<Edge />

	<Zone id="find" name="Find your way back">
		<Shot src={panels} alt="The zone list open on the left with seven zones, and search on the right showing the notes that mention replay." />
		<div class="row">
			<Card title="Search as you type">
				<p><kbd>Ctrl</kbd> <kbd>F</kbd> searches every note and zone name. Click a result and the canvas glides there.</p>
			</Card>
			<Card title="Every zone in a list">
				<p><kbd>Ctrl</kbd> <kbd>L</kbd> lists the zones as a tree, with a dot on the ones in view and how many cards each holds.</p>
			</Card>
			<Card title="Nothing gets lost">
				<p>Notes without a card wait in the Unplaced tray until you drag them onto the canvas.</p>
			</Card>
		</div>
	</Zone>

	<Edge back />

	<Zone id="pen" name="Write by hand" color={highlighter('Orange')}>
		<div class="row">
			<Card title="A pen on the canvas">
				<p>Press <kbd>P</kbd> and draw: circle a card, underline a line, sketch what words can't. A stylus draws thinner or thicker with pressure.</p>
			</Card>
			<Card title="Drawings stay put">
				<p>Strokes group into drawings that belong to their zone and move with it. One eraser takes whole strokes, the other cuts through them.</p>
			</Card>
		</div>
		<Shot src={pen} alt="Close up at 140%: an orange loop drawn by hand around the Do naps count? card, and the pen bar at the bottom with tools, colors and widths." />
	</Zone>

	<Edge />

	<Zone id="files" name="Plain files you own" color={highlighter('Yellow')}>
		<div class="files">
			<div class="stack">
				<Card title="A vault is a folder">
					<p>
						Notes are Markdown files named after their titles, readable in any editor. The canvas sits beside them as small JSON files, one
						per card, zone, link and drawing.
					</p>
				</Card>
				<Card title="Sync it your way">
					<p>
						Keep the folder in Syncthing, Dropbox or Google Drive. Two devices only clash when they change the same item, and a note changed
						elsewhere is never overwritten: your text is saved beside it.
					</p>
				</Card>
				<Card title="No account, no server">
					<p>Nothing leaves your computer unless you sync it. Fonts and all are inside the app.</p>
				</Card>
			</div>
			<Card title="Thesis">
				<pre><code>{`notes/
  Replay.md
  Do naps count.md
  Stickgold 2005.md
attachments/
  images/
    Pasted image 20261030130732.png
.canvas/
  vault.json
  zones/      one file per zone
  cards/      one file per card
  edges/      one file per link
  drawings/   one file per drawing`}</code></pre>
			</Card>
		</div>
	</Zone>

	<Edge back />

	<Zone id="themes" name="Five themes" color={highlighter('Pink')}>
		<Themes />
	</Zone>
</div>

<section class="start wrap" aria-labelledby="start">
	<h2 id="start" class="headline">Start a vault</h2>
	<div class="pair">
		<Card title="The desktop app">
			<p>Your vault is a folder on your computer, ready to sync and back up like any other.</p>
			<p class="actions"><a class="button primary" href={download}>Download</a></p>
		</Card>
		<Card title="In your browser">
			<p>Nothing to install. Your notes stay in this browser on this device, which makes it a good place to try things out.</p>
			<p class="actions"><a class="button" href={web} rel="external">Open in browser</a></p>
		</Card>
	</div>
</section>

<style>
	.hero {
		padding-block: clamp(40px, 9vw, 112px) 40px;
	}

	.hero h1 {
		max-width: 13ch;
		font-size: clamp(2.75rem, 1.4rem + 5.6vw, 5.25rem);
	}

	.lede {
		margin-block: 24px 32px;
	}

	.window {
		margin-block: 0;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: var(--lift-high);
		background: var(--card);
	}

	.map {
		display: grid;
		padding-block: clamp(56px, 8vw, 96px) 24px;
	}

	@media (min-width: 900px) {
		.map :global(section:nth-of-type(odd)) {
			margin-right: 7%;
		}

		.map :global(section:nth-of-type(even)) {
			margin-left: 7%;
		}

		.files {
			grid-template-columns: 1fr 1fr;
		}
	}

	.row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 14px;
	}

	.files,
	.stack {
		display: grid;
		gap: 14px;
		align-items: start;
	}

	.start {
		display: grid;
		gap: 18px;
		padding-block: clamp(56px, 8vw, 96px) 16px;
	}

	.start h2 {
		font-size: clamp(1.75rem, 1.2rem + 2vw, 2.75rem);
	}
</style>
