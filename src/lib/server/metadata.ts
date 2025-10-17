import { JSDOM } from 'jsdom';
import { saveAsset } from './db';

export interface PageMetadata {
	title: string;
	description?: string;
	favicon?: string;
	ogImage?: string;
}

export async function extractMetadata(url: string): Promise<PageMetadata> {
	const urlObj = new URL(url);
	const metadata: PageMetadata = {
		title: urlObj.hostname
	};

	// Special handling for YouTube
	if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
		console.log(`[Metadata] Detected YouTube URL, using oEmbed API`);
		const youtubeMetadata = await extractYouTubeMetadata(url);
		if (youtubeMetadata) {
			return youtubeMetadata;
		}
		console.log(`[Metadata] oEmbed failed, falling back to standard extraction`);
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000); // Increased to 10s

		const response = await fetch(url, {
			signal: controller.signal,
			redirect: 'follow',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
				'Accept-Encoding': 'gzip, deflate, br',
				'DNT': '1',
				'Connection': 'keep-alive',
				'Upgrade-Insecure-Requests': '1'
			}
		});

		clearTimeout(timeout);

		if (!response.ok) {
			console.warn(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
			return metadata;
		}

		const html = await response.text();
		console.log(`[Metadata] Fetched ${html.length} bytes from ${url}`);

		const dom = new JSDOM(html);
		const document = dom.window.document;

		// Extract title
		const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
		const titleTag = document.querySelector('title')?.textContent;
		metadata.title = ogTitle || titleTag || metadata.title;
		console.log(`[Metadata] Title: ogTitle="${ogTitle}", titleTag="${titleTag}", final="${metadata.title}"`);

		// Extract description
		const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
		const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
		metadata.description = ogDescription || metaDescription || undefined;
		console.log(`[Metadata] Description: og="${ogDescription}", meta="${metaDescription}"`);

		// Extract OG image
		const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
		if (ogImage) {
			metadata.ogImage = new URL(ogImage, url).href;
			console.log(`[Metadata] OG Image found: ${metadata.ogImage}`);
		} else {
			console.log(`[Metadata] No OG Image found in HTML`);
		}

		// Extract favicon
		metadata.favicon = await extractFavicon(url, document);

	} catch (error) {
		console.error('Error extracting metadata:', error);
	}

	return metadata;
}

async function extractFavicon(baseUrl: string, document: Document | null): Promise<string | undefined> {
	const urlObj = new URL(baseUrl);

	// Try various favicon sources
	const faviconSources = [
		document?.querySelector('link[rel="icon"]')?.getAttribute('href'),
		document?.querySelector('link[rel="shortcut icon"]')?.getAttribute('href'),
		document?.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
		'/favicon.ico'
	];

	for (const source of faviconSources) {
		if (!source) continue;

		try {
			const faviconUrl = new URL(source, baseUrl).href;
			const response = await fetch(faviconUrl, {
				signal: AbortSignal.timeout(3000),
				redirect: 'follow',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
				}
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

async function extractYouTubeMetadata(url: string): Promise<PageMetadata | null> {
	try {
		// YouTube's oEmbed API - official way to get video metadata
		const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

		const response = await fetch(oembedUrl, {
			signal: AbortSignal.timeout(5000),
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			}
		});

		if (!response.ok) {
			console.warn(`[YouTube oEmbed] Failed: ${response.status}`);
			return null;
		}

		const data = await response.json();
		console.log(`[YouTube oEmbed] Success: title="${data.title}"`);

		// Extract video ID to get high-quality thumbnail
		const videoId = extractVideoId(url);
		let ogImage: string | undefined;

		if (videoId) {
			// Try different thumbnail qualities (maxresdefault is highest quality)
			const thumbnailUrls = [
				`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
				`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
				data.thumbnail_url
			];

			for (const thumbUrl of thumbnailUrls) {
				if (thumbUrl) {
					try {
						const thumbResponse = await fetch(thumbUrl, {
							method: 'HEAD',
							signal: AbortSignal.timeout(3000)
						});
						if (thumbResponse.ok) {
							ogImage = thumbUrl;
							console.log(`[YouTube] Using thumbnail: ${thumbUrl}`);
							break;
						}
					} catch (e) {
						continue;
					}
				}
			}
		}

		return {
			title: data.title || new URL(url).hostname,
			description: `By ${data.author_name}`,
			ogImage: ogImage,
			favicon: await extractFavicon(url, null) // Will use fallback favicon.ico
		};

	} catch (error) {
		console.error('[YouTube oEmbed] Error:', error);
		return null;
	}
}

function extractVideoId(url: string): string | null {
	try {
		const urlObj = new URL(url);

		// youtube.com/watch?v=VIDEO_ID
		if (urlObj.hostname.includes('youtube.com')) {
			return urlObj.searchParams.get('v');
		}

		// youtu.be/VIDEO_ID
		if (urlObj.hostname.includes('youtu.be')) {
			return urlObj.pathname.slice(1).split('?')[0];
		}

		return null;
	} catch (error) {
		return null;
	}
}
