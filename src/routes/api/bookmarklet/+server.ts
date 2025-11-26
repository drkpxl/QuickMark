import type { RequestHandler } from './$types';

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export const GET: RequestHandler = async ({ url }) => {
	const origin = url.origin;

	// Simplified bookmarklet - just passes URL and title, lets server handle the rest
	const bookmarkletCode = `javascript:(function(){window.open('${origin}/save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title||''),'quickmark','width=500,height=600,scrollbars=yes')})()`;

	// HTML-escape for safe embedding in attribute
	const escapedCode = escapeHtml(bookmarkletCode);

	// Create Netscape bookmark format HTML that Chrome can import
	const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="${escapedCode}">Save to QuickMark</A>
</DL><p>
`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html',
			'Content-Disposition': 'attachment; filename="quickmark-bookmarklet.html"'
		}
	});
};
