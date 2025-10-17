import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBookmarks } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
	const format = url.searchParams.get('format') || 'json';
	const bookmarks = getBookmarks();

	if (format === 'json') {
		const jsonData = JSON.stringify(bookmarks, null, 2);
		return new Response(jsonData, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="bookmarks-${Date.now()}.json"`
			}
		});
	}

	if (format === 'html') {
		const html = generateNetscapeBookmarks(bookmarks);
		return new Response(html, {
			headers: {
				'Content-Type': 'text/html',
				'Content-Disposition': `attachment; filename="bookmarks-${Date.now()}.html"`
			}
		});
	}

	return json({ message: 'Invalid format' }, { status: 400 });
};

interface Bookmark {
	id: number;
	url: string;
	domain: string;
	title: string | null;
	description: string | null;
	favicon_path: string | null;
	og_image_path: string | null;
	created_at: string;
	updated_at: string;
	accessed_count: number;
}

function generateNetscapeBookmarks(bookmarks: Bookmark[]): string {
	const timestamp = Math.floor(Date.now() / 1000);

	let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">QuickMark Bookmarks</H3>
    <DL><p>
`;

	for (const bookmark of bookmarks) {
		const addDate = Math.floor(new Date(bookmark.created_at).getTime() / 1000);
		const title = escapeHtml(bookmark.title || bookmark.url);
		const url = escapeHtml(bookmark.url);

		html += `        <DT><A HREF="${url}" ADD_DATE="${addDate}"`;

		if (bookmark.favicon_path) {
			html += ` ICON_URI="${escapeHtml(bookmark.favicon_path)}"`;
		}

		html += `>${title}</A>\n`;
	}

	html += `    </DL><p>
</DL><p>
`;

	return html;
}

function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}
