import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

// Settings open on their first tab.
export const load: PageLoad = ({ params }) => redirect(307, resolve('/vault/[vaultId]/settings/appearance', params));
