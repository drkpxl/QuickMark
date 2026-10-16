import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createBookmark,
	deleteAsset,
	downloadFavicon,
	downloadPreviewImage,
	fetchPageMetadata,
	isCapturePath
} from '$lib/server/db';

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
		const { url, title, description, image_url, screenshot, favicon_url, prefer, tags } = await request.json();

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

		const pageUrl = urlObj.href;
		const domain = urlObj.hostname;
		const screenshotPath = isCapturePath(screenshot) ? screenshot : null;

		// Use the site's own preview image unless the screenshot was picked; each falls back to the other
		let og_image_path = prefer === 'screenshot' ? screenshotPath : null;
		og_image_path ??= await downloadPreviewImage([image_url], domain, pageUrl);
		og_image_path ??= screenshotPath;

		// Bookmarklet saves arrive with only a URL and title, so look the page up ourselves
		const page = og_image_path ? null : await fetchPageMetadata(pageUrl);
		og_image_path ??= await downloadPreviewImage(page?.images ?? [], domain, pageUrl);

		if (screenshotPath && og_image_path !== screenshotPath) {
			deleteAsset(screenshotPath);
		}

		const favicon_path = await downloadFavicon(pageUrl, domain, [favicon_url, ...(page?.icons ?? [])]);

		// Save bookmark
		const bookmark = createBookmark({
			url: pageUrl,
			domain,
			title: title || page?.title || undefined,
			description: description || page?.description || undefined,
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
