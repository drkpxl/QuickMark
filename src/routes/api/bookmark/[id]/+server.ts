import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteBookmark, updateBookmark, getBookmark } from '$lib/server/db';

// CORS headers for bookmarklet access
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseInt(params.id);

		if (isNaN(id)) {
			return json({ message: 'Invalid bookmark ID' }, { status: 400, headers: corsHeaders });
		}

		// Get existing bookmark to preserve fields not being updated
		const existing = getBookmark(id);
		if (!existing) {
			return json({ message: 'Bookmark not found' }, { status: 404, headers: corsHeaders });
		}

		const { url, title, tags, description } = await request.json();

		// Use existing values as fallback
		const finalUrl = url && typeof url === 'string' ? url.trim() : existing.url;

		// Validate URL if changed
		let urlObj: URL;
		try {
			urlObj = new URL(finalUrl);
		} catch {
			return json({ message: 'Invalid URL format' }, { status: 400, headers: corsHeaders });
		}

		// Update bookmark with provided values, falling back to existing
		const bookmark = updateBookmark(id, {
			url: urlObj.href,
			domain: urlObj.hostname,
			title: title !== undefined ? (title || undefined) : (existing.title || undefined),
			description: description !== undefined ? (description || undefined) : (existing.description || undefined),
			favicon_path: existing.favicon_path || undefined,
			og_image_path: existing.og_image_path || undefined,
			tags: tags !== undefined ? (tags || undefined) : (existing.tags || undefined)
		});

		if (!bookmark) {
			return json({ message: 'Bookmark not found' }, { status: 404, headers: corsHeaders });
		}

		return json(bookmark, { status: 200, headers: corsHeaders });
	} catch (error) {
		console.error('Error updating bookmark:', error);
		return json({ message: 'Failed to update bookmark' }, { status: 500, headers: corsHeaders });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);

		if (isNaN(id)) {
			return json({ message: 'Invalid bookmark ID' }, { status: 400, headers: corsHeaders });
		}

		const success = deleteBookmark(id);

		if (!success) {
			return json({ message: 'Bookmark not found' }, { status: 404, headers: corsHeaders });
		}

		return json({ message: 'Bookmark deleted' }, { status: 200, headers: corsHeaders });
	} catch (error) {
		console.error('Error deleting bookmark:', error);
		return json({ message: 'Failed to delete bookmark' }, { status: 500, headers: corsHeaders });
	}
};
