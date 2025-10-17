import { getBookmarks } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const bookmarks = getBookmarks();
	return {
		bookmarks
	};
};
