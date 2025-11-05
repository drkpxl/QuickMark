import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteBookmark, updateBookmark } from '$lib/server/db';
import { extractMetadata } from '$lib/server/metadata';

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseInt(params.id);

		if (isNaN(id)) {
			return json({ message: 'Invalid bookmark ID' }, { status: 400 });
		}

		const { url, title, tags, description } = await request.json();

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
		const metadata = await extractMetadata(url);

		// Use custom title if provided, otherwise use metadata title
		const finalTitle = title !== null && title !== undefined && title.trim() !== ''
			? title
			: metadata.title;

		// Use custom description if provided, otherwise use metadata description
		const finalDescription = description !== null && description !== undefined && description.trim() !== ''
			? description
			: metadata.description;

		// Update bookmark
		const bookmark = updateBookmark(id, {
			url: urlObj.href,
			domain: urlObj.hostname,
			title: finalTitle,
			description: finalDescription,
			favicon_path: metadata.favicon,
			og_image_path: metadata.ogImage,
			tags: tags || null
		});

		if (!bookmark) {
			return json({ message: 'Bookmark not found' }, { status: 404 });
		}

		return json(bookmark, { status: 200 });
	} catch (error) {
		console.error('Error updating bookmark:', error);
		return json({ message: 'Failed to update bookmark' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);

		if (isNaN(id)) {
			return json({ message: 'Invalid bookmark ID' }, { status: 400 });
		}

		const success = deleteBookmark(id);

		if (!success) {
			return json({ message: 'Bookmark not found' }, { status: 404 });
		}

		return json({ message: 'Bookmark deleted' }, { status: 200 });
	} catch (error) {
		console.error('Error deleting bookmark:', error);
		return json({ message: 'Failed to delete bookmark' }, { status: 500 });
	}
};
