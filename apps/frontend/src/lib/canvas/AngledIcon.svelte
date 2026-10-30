<script lang="ts">
	import { Icon, type LucideIconNode, type LucideProps } from '@lucide/svelte';

	let props: LucideProps = $props();

	// Lucide has no angled line: this one is drawn like its spline icon, a line between two
	// ends, bending at right angles halfway across as an angled edge does.
	const node: LucideIconNode[] = [
		['circle', { cx: '5', cy: '19', r: '2' }],
		['circle', { cx: '19', cy: '5', r: '2' }],
		['path', { d: 'M7 19h5V5h5' }]
	];
</script>

<Icon {...props} iconNode={node} />
