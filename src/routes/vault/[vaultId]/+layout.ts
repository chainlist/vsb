import { canvasContents, openVault, uiState, vaultSnap, vaultTheme } from '#lib/api.js';
import { ZONE_LIST } from '#lib/panel/zoneList.svelte.js';
import type { LayoutLoad } from './$types';

// The vault first: what its canvas holds can only be asked once it is open.
export const load: LayoutLoad = async ({ params }) => {
	const vault = await openVault(params.vaultId);
	return {
		vault,
		contents: await canvasContents(),
		theme: await vaultTheme(),
		snap: await vaultSnap(),
		zoneList: (await uiState(ZONE_LIST)) === 'open'
	};
};
