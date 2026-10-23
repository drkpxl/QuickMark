import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBookmarks, refreshPreview } from '$lib/server/db';

const CONCURRENCY = 4;

// Look up preview images and favicons for every bookmark that's missing one
export const POST: RequestHandler = async () => {
	const queue = getBookmarks();
	let images = 0;
	let favicons = 0;

	async function worker() {
		let bookmark;
		while ((bookmark = queue.shift())) {
			const found = await refreshPreview(bookmark, true);
			if (found.image) images++;
			if (found.favicon) favicons++;
		}
	}

	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	const missing = getBookmarks().filter((bookmark) => !bookmark.og_image_path).length;
	return json({ images, favicons, missing });
};
