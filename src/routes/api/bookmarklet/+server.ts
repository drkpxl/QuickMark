import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const origin = url.origin;

	// Generate the bookmarklet code
	const bookmarkletCode = `javascript:void(window.open('${origin}/save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent((document.querySelector('meta[name=description]')||{}).content||'')+'&image_url='+encodeURIComponent((document.querySelector('meta[property="og:image"]')||{}).content||''),'quickmark','width=500,height=600'))`;

	// Create Netscape bookmark format HTML that Chrome can import
	const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="${bookmarkletCode}">Save to QuickMark</A>
</DL><p>
`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html',
			'Content-Disposition': 'attachment; filename="quickmark-bookmarklet.html"'
		}
	});
};
