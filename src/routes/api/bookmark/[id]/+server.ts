import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteBookmark } from '$lib/server/db';

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
