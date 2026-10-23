import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { downloadPreviewImage, getBookmark, refreshPreview, saveUploadedImage, setBookmarkAsset } from '$lib/server/db';

// Change a bookmark's preview image from the edit dialog. Send an image as the body to
// upload it, or JSON: { source: 'refetch' }, { source: 'url', image_url } or { source: 'remove' }
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const bookmark = getBookmark(parseInt(params.id));
		if (!bookmark) {
			return json({ message: 'Bookmark not found' }, { status: 404 });
		}

		if (request.headers.get('content-type')?.startsWith('image/')) {
			const path = saveUploadedImage(Buffer.from(await request.arrayBuffer()), 'upload');
			if (!path) {
				return json({ message: 'That file is not a supported image' }, { status: 400 });
			}
			setBookmarkAsset(bookmark.id, 'og_image_path', path);
			return json(getBookmark(bookmark.id));
		}

		const { source, image_url } = await request.json();

		if (source === 'remove') {
			setBookmarkAsset(bookmark.id, 'og_image_path', null);
		} else if (source === 'url') {
			const path = await downloadPreviewImage([image_url], bookmark.domain, bookmark.url);
			if (!path) {
				return json({ message: "Couldn't download an image from that URL" }, { status: 422 });
			}
			setBookmarkAsset(bookmark.id, 'og_image_path', path);
		} else if (source === 'refetch') {
			const { image } = await refreshPreview(bookmark);
			if (!image) {
				return json({ message: 'No preview image found on the site' }, { status: 422 });
			}
		} else {
			return json({ message: 'Unknown image source' }, { status: 400 });
		}

		return json(getBookmark(bookmark.id));
	} catch (error) {
		console.error('Error updating bookmark image:', error);
		return json({ message: 'Failed to update image' }, { status: 500 });
	}
};
