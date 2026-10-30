import { listVaults } from '#lib/api.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => ({ vaults: await listVaults() });
