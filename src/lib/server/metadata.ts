import { JSDOM } from 'jsdom';
import { saveAsset } from './db';

export interface PageMetadata {
	title: string;
	description?: string;
	favicon?: string;
	ogImage?: string;
}

export async function extractMetadata(url: string): Promise<PageMetadata> {
	const metadata: PageMetadata = {
		title: new URL(url).hostname
	};

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);

		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; QuickMark/1.0; +http://localhost:9022)'
			}
		});

		clearTimeout(timeout);

		if (!response.ok) {
			return metadata;
		}

		const html = await response.text();
		const dom = new JSDOM(html);
		const document = dom.window.document;

		// Extract title
		const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
		const titleTag = document.querySelector('title')?.textContent;
		metadata.title = ogTitle || titleTag || metadata.title;

		// Extract description
		const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
		const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
		metadata.description = ogDescription || metaDescription || undefined;

		// Extract OG image
		const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
		if (ogImage) {
			metadata.ogImage = new URL(ogImage, url).href;
		}

		// Extract favicon
		metadata.favicon = await extractFavicon(url, document);

	} catch (error) {
		console.error('Error extracting metadata:', error);
	}

	return metadata;
}

async function extractFavicon(baseUrl: string, document: Document): Promise<string | undefined> {
	const urlObj = new URL(baseUrl);

	// Try various favicon sources
	const faviconSources = [
		document.querySelector('link[rel="icon"]')?.getAttribute('href'),
		document.querySelector('link[rel="shortcut icon"]')?.getAttribute('href'),
		document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
		'/favicon.ico'
	];

	for (const source of faviconSources) {
		if (!source) continue;

		try {
			const faviconUrl = new URL(source, baseUrl).href;
			const response = await fetch(faviconUrl, {
				signal: AbortSignal.timeout(3000)
			});

			if (response.ok) {
				const buffer = Buffer.from(await response.arrayBuffer());
				const ext = faviconUrl.split('.').pop()?.split('?')[0] || 'ico';
				const filename = `${urlObj.hostname}-${Date.now()}.${ext}`;
				return saveAsset(buffer, filename);
			}
		} catch (error) {
			// Try next source
			continue;
		}
	}

	return undefined;
}
