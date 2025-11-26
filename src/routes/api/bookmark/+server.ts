import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBookmark, downloadAndSaveImage, downloadFavicon } from '$lib/server/db';

// CORS headers for bookmarklet access
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { url, title, description, image_url, tags } = await request.json();

		if (!url || typeof url !== 'string') {
			return json({ message: 'Invalid URL' }, { status: 400, headers: corsHeaders });
		}

		// Validate URL
		let urlObj: URL;
		try {
			urlObj = new URL(url);
		} catch {
			return json({ message: 'Invalid URL format' }, { status: 400, headers: corsHeaders });
		}

		const domain = urlObj.hostname;

		// Download and save image if provided
		let og_image_path: string | null = null;
		if (image_url && typeof image_url === 'string') {
			og_image_path = await downloadAndSaveImage(image_url, domain);
		}

		// Download favicon
		const favicon_path = await downloadFavicon(url, domain);

		// Save bookmark
		const bookmark = createBookmark({
			url: urlObj.href,
			domain,
			title: title || undefined,
			description: description || undefined,
			favicon_path: favicon_path || undefined,
			og_image_path: og_image_path || undefined,
			tags: tags || undefined
		});

		return json(bookmark, { status: 201, headers: corsHeaders });
	} catch (error) {
		console.error('Error creating bookmark:', error);
		return json({ message: 'Failed to create bookmark' }, { status: 500, headers: corsHeaders });
	}
};
