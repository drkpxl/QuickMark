import { JSDOM } from 'jsdom';
import { saveAsset } from './db';
import { chromium } from 'playwright';

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

	// Special handling for YouTube using official oEmbed API
	if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
		const youtubeMetadata = await extractYouTubeMetadata(url);
		if (youtubeMetadata) {
			return youtubeMetadata;
		}
		// Fall back to standard extraction if oEmbed fails
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

		// Extract and store image with fallback strategies
		metadata.ogImage = await extractAndStoreImage(url, document);

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

async function extractAndStoreImage(baseUrl: string, document: Document): Promise<string | undefined> {
	const urlObj = new URL(baseUrl);

	// Strategy 1: Try multiple meta image tags
	const metaImageSources = [
		document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
		document.querySelector('meta[property="og:image:url"]')?.getAttribute('content'),
		document.querySelector('meta[name="twitter:image"]')?.getAttribute('content'),
		document.querySelector('meta[name="twitter:image:src"]')?.getAttribute('content'),
		document.querySelector('meta[property="twitter:image"]')?.getAttribute('content'),
		document.querySelector('meta[itemprop="image"]')?.getAttribute('content')
	];

	for (const imageUrl of metaImageSources) {
		if (!imageUrl) continue;

		try {
			const absoluteUrl = new URL(imageUrl, baseUrl).href;
			const savedPath = await downloadAndSaveImage(absoluteUrl, urlObj.hostname);
			if (savedPath) {
				console.log(`✓ Successfully extracted meta image from ${baseUrl}`);
				return savedPath;
			}
		} catch (error) {
			console.warn(`Failed to download meta image: ${imageUrl}`, error);
			continue;
		}
	}

	// Strategy 2: Find first large image on the page
	const images = document.querySelectorAll('img[src]');
	const imageUrls: string[] = [];

	for (const img of Array.from(images)) {
		const src = img.getAttribute('src');
		if (!src) continue;

		// Skip common small images (icons, buttons, etc.)
		const width = img.getAttribute('width');
		const height = img.getAttribute('height');

		// Skip if explicitly small
		if (width && height && (parseInt(width) < 200 || parseInt(height) < 200)) {
			continue;
		}

		// Skip common icon/button patterns
		const lowercaseSrc = src.toLowerCase();
		if (lowercaseSrc.includes('icon') ||
			lowercaseSrc.includes('logo') ||
			lowercaseSrc.includes('button') ||
			lowercaseSrc.includes('avatar')) {
			continue;
		}

		try {
			const absoluteUrl = new URL(src, baseUrl).href;
			imageUrls.push(absoluteUrl);
		} catch (error) {
			continue;
		}
	}

	// Try downloading the first few candidate images
	for (const imageUrl of imageUrls.slice(0, 3)) {
		try {
			const savedPath = await downloadAndSaveImage(imageUrl, urlObj.hostname);
			if (savedPath) {
				console.log(`✓ Successfully extracted page image from ${baseUrl}`);
				return savedPath;
			}
		} catch (error) {
			continue;
		}
	}

	// Strategy 3: Take a screenshot as last resort
	console.log(`⚠ No suitable images found, attempting screenshot for ${baseUrl}`);
	try {
		const screenshotPath = await takeScreenshot(baseUrl, urlObj.hostname);
		if (screenshotPath) {
			console.log(`✓ Successfully captured screenshot for ${baseUrl}`);
			return screenshotPath;
		}
	} catch (error) {
		console.error('Failed to take screenshot:', error);
	}

	console.warn(`✗ All image extraction strategies failed for ${baseUrl}`);
	return undefined;
}

async function downloadAndSaveImage(imageUrl: string, hostname: string): Promise<string | undefined> {
	try {
		const response = await fetch(imageUrl, {
			signal: AbortSignal.timeout(10000),
			redirect: 'follow',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
			}
		});

		if (!response.ok) {
			return undefined;
		}

		// Check content type
		const contentType = response.headers.get('content-type');
		if (!contentType?.startsWith('image/')) {
			console.warn(`URL is not an image: ${imageUrl} (${contentType})`);
			return undefined;
		}

		const buffer = Buffer.from(await response.arrayBuffer());

		// Skip very small images (likely icons)
		if (buffer.length < 5000) { // Less than ~5KB
			return undefined;
		}

		// Determine extension from content type
		const extMap: Record<string, string> = {
			'image/jpeg': 'jpg',
			'image/jpg': 'jpg',
			'image/png': 'png',
			'image/webp': 'webp',
			'image/gif': 'gif',
			'image/svg+xml': 'svg'
		};
		const ext = extMap[contentType] || 'jpg';

		const filename = `${hostname}-og-${Date.now()}.${ext}`;
		return saveAsset(buffer, filename);
	} catch (error) {
		console.warn(`Failed to download image ${imageUrl}:`, error);
		return undefined;
	}
}

async function takeScreenshot(url: string, hostname: string): Promise<string | undefined> {
	let browser;
	try {
		browser = await chromium.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});

		const context = await browser.newContext({
			viewport: { width: 1280, height: 720 },
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		});

		const page = await context.newPage();

		// Set a timeout for page load
		await page.goto(url, {
			waitUntil: 'networkidle',
			timeout: 15000
		});

		// Wait a bit for any dynamic content
		await page.waitForTimeout(1000);

		const screenshot = await page.screenshot({
			type: 'png',
			fullPage: false // Just capture the viewport
		});

		await browser.close();

		const filename = `${hostname}-screenshot-${Date.now()}.png`;
		return saveAsset(Buffer.from(screenshot), filename);
	} catch (error) {
		if (browser) {
			await browser.close();
		}
		console.error('Screenshot capture failed:', error);
		return undefined;
	}
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
			return null;
		}

		const data = await response.json();

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

			// Download and store the YouTube thumbnail locally
			for (const thumbUrl of thumbnailUrls) {
				if (thumbUrl) {
					const urlObj = new URL(url);
					const savedPath = await downloadAndSaveImage(thumbUrl, urlObj.hostname);
					if (savedPath) {
						ogImage = savedPath;
						break;
					}
				}
			}
		}

		return {
			title: data.title || new URL(url).hostname,
			description: `By ${data.author_name}`,
			ogImage: ogImage,
			favicon: await extractFavicon(url, null)
		};

	} catch (error) {
		console.error('Error extracting YouTube metadata:', error);
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
