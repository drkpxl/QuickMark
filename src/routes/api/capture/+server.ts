import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveCapture } from '$lib/server/db';

// CORS headers for the Chrome extension
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

// The extension uploads its screenshot here before opening the save popup, since an
// image is far too big to pass along in the popup's URL. The popup gets the path instead.
export const POST: RequestHandler = async ({ request }) => {
	try {
		const path = saveCapture(Buffer.from(await request.arrayBuffer()));
		if (!path) {
			return json({ message: 'Not a supported image' }, { status: 400, headers: corsHeaders });
		}
		return json({ path }, { status: 201, headers: corsHeaders });
	} catch (error) {
		console.error('Error saving screenshot:', error);
		return json({ message: 'Failed to save screenshot' }, { status: 500, headers: corsHeaders });
	}
};
