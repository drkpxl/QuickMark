import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBookmark } from '$lib/server/db';
import { extractMetadata } from '$lib/server/metadata';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { url, tags } = await request.json();

		if (!url || typeof url !== 'string') {
			return json({ message: 'Invalid URL' }, { status: 400 });
		}

		// Validate URL
		let urlObj: URL;
		try {
			urlObj = new URL(url);
		} catch {
			return json({ message: 'Invalid URL format' }, { status: 400 });
		}

		// Extract metadata
		console.log(`[Bookmark API] Starting metadata extraction for: ${url}`);
		const metadata = await extractMetadata(url);
		console.log(`[Bookmark API] Metadata extracted:`, JSON.stringify(metadata, null, 2));

		// Save bookmark
		const bookmark = createBookmark({
			url: urlObj.href,
			domain: urlObj.hostname,
			title: metadata.title,
			description: metadata.description,
			favicon_path: metadata.favicon,
			og_image_path: metadata.ogImage,
			tags: tags || null
		});

		return json(bookmark, { status: 201 });
	} catch (error) {
		console.error('Error creating bookmark:', error);
		return json({ message: 'Failed to create bookmark' }, { status: 500 });
	}
};
