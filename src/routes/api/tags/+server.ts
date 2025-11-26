import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllTags } from '$lib/server/db';

// CORS headers for bookmarklet access
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

export const GET: RequestHandler = async () => {
	try {
		const tags = getAllTags();
		return json(tags, { headers: corsHeaders });
	} catch (error) {
		console.error('Error fetching tags:', error);
		return json({ message: 'Failed to fetch tags' }, { status: 500, headers: corsHeaders });
	}
};
