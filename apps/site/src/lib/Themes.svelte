<!-- The themes: a button per theme, named as the app names it, shows its screenshot and a line on its
     look. A theme with no screenshot yet is left out. -->
<script lang="ts">
	import { THEMES } from '#lib/app.js';
	import Picker from '#lib/Picker.svelte';
	import studio from '#lib/shots/canvas.webp';
	import board from '#lib/shots/theme-board.webp';
	import cairn from '#lib/shots/theme-cairn.webp';
	import orbit from '#lib/shots/theme-orbit.webp';
	import pad from '#lib/shots/theme-pad.webp';
	import wilds from '#lib/shots/theme-wilds.webp';

	const looks: Record<string, { src: string; look: string }> = {
		studio: { src: studio, look: 'a cool gray canvas dotted at the grid crossings, white cards and a petrol accent.' },
		pad: { src: pad, look: 'sage graph paper, index cards with a red rule under the title, fountain-pen blue.' },
		orbit: { src: orbit, look: 'a deep navy grid with brighter nodes where its lines cross, and cards edged in light.' },
		cairn: { src: cairn, look: 'peat-moss paper, slate cards with a dim gold rule, fog-pale text.' },
		wilds: { src: wilds, look: 'deep-space indigo with stars at the grid crossings, warm cream text and a campfire-orange accent.' },
		board: { src: board, look: 'tan cork with a fine grain, cream sheets pinned flat, typewritten notes and a ballpoint-blue accent.' }
	};
	const themes = THEMES.filter((t) => t.id in looks).map((t) => ({
		id: t.id,
		name: t.name,
		src: looks[t.id].src,
		alt: `The thesis in ${t.name}.`,
		line: looks[t.id].look
	}));
</script>

<Picker label="Theme" options={themes} />
