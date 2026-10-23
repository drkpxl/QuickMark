import Database from 'better-sqlite3';
import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { randomBytes } from 'crypto';

const dbPath = join(process.cwd(), 'data', 'bookmarks.db');
const assetsPath = join(process.cwd(), 'data', 'assets');

// Ensure data directories exist
if (!existsSync(join(process.cwd(), 'data'))) {
	mkdirSync(join(process.cwd(), 'data'), { recursive: true });
}
if (!existsSync(assetsPath)) {
	mkdirSync(assetsPath, { recursive: true });
}

const db = new Database(dbPath);

// Initialize database schema
db.exec(`
	CREATE TABLE IF NOT EXISTS bookmarks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		url TEXT UNIQUE NOT NULL,
		domain TEXT NOT NULL,
		title TEXT,
		description TEXT,
		favicon_path TEXT,
		og_image_path TEXT,
		tags TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		accessed_count INTEGER DEFAULT 0
	);

	CREATE INDEX IF NOT EXISTS idx_created_at ON bookmarks(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_url ON bookmarks(url);
`);

// Add tags column if it doesn't exist (for existing databases)
try {
	db.exec('ALTER TABLE bookmarks ADD COLUMN tags TEXT');
} catch (e) {
	// Column already exists, ignore error
}

export interface Bookmark {
	id: number;
	url: string;
	domain: string;
	title: string | null;
	description: string | null;
	favicon_path: string | null;
	og_image_path: string | null;
	tags: string | null;
	created_at: string;
	updated_at: string;
	accessed_count: number;
}

export function getBookmarks(): Bookmark[] {
	const stmt = db.prepare('SELECT * FROM bookmarks ORDER BY created_at DESC');
	return stmt.all() as Bookmark[];
}

export function getBookmark(id: number): Bookmark | undefined {
	const stmt = db.prepare('SELECT * FROM bookmarks WHERE id = ?');
	return stmt.get(id) as Bookmark | undefined;
}

export function createBookmark(data: {
	url: string;
	domain: string;
	title?: string;
	description?: string;
	favicon_path?: string;
	og_image_path?: string;
	tags?: string;
}): Bookmark {
	// Check if bookmark already exists
	const existing = db.prepare('SELECT * FROM bookmarks WHERE url = ?').get(data.url) as Bookmark | undefined;

	if (existing) {
		// Re-saving refreshes the images and tags, and fills in a title or description that was missing
		const stmt = db.prepare(`
			UPDATE bookmarks
			SET updated_at = CURRENT_TIMESTAMP,
			    title = COALESCE(title, ?),
			    description = COALESCE(description, ?),
			    tags = COALESCE(?, tags),
			    favicon_path = COALESCE(?, favicon_path),
			    og_image_path = COALESCE(?, og_image_path)
			WHERE id = ?
		`);
		stmt.run(
			data.title || null,
			data.description || null,
			data.tags || null,
			data.favicon_path || null,
			data.og_image_path || null,
			existing.id
		);

		// Remove the files the new images replaced
		if (data.favicon_path && data.favicon_path !== existing.favicon_path) deleteAsset(existing.favicon_path);
		if (data.og_image_path && data.og_image_path !== existing.og_image_path) deleteAsset(existing.og_image_path);

		return getBookmark(existing.id)!;
	}

	const stmt = db.prepare(`
		INSERT INTO bookmarks (url, domain, title, description, favicon_path, og_image_path, tags)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);

	const result = stmt.run(
		data.url,
		data.domain,
		data.title || null,
		data.description || null,
		data.favicon_path || null,
		data.og_image_path || null,
		data.tags || null
	);

	return getBookmark(result.lastInsertRowid as number)!;
}

export function updateBookmark(id: number, data: {
	url: string;
	domain: string;
	title?: string;
	description?: string;
	favicon_path?: string;
	og_image_path?: string;
	tags?: string;
}): Bookmark | undefined {
	const stmt = db.prepare(`
		UPDATE bookmarks
		SET url = ?, domain = ?, title = ?, description = ?,
		    favicon_path = ?, og_image_path = ?, tags = ?,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`);

	const result = stmt.run(
		data.url,
		data.domain,
		data.title || null,
		data.description || null,
		data.favicon_path || null,
		data.og_image_path || null,
		data.tags || null,
		id
	);

	if (result.changes > 0) {
		return getBookmark(id);
	}

	return undefined;
}

export function deleteBookmark(id: number): boolean {
	const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ?');
	const result = stmt.run(id);
	return result.changes > 0;
}

export function getAllTags(): string[] {
	const bookmarks = getBookmarks();
	const tagSet = new Set<string>();

	for (const bookmark of bookmarks) {
		if (bookmark.tags) {
			const tags = bookmark.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
			tags.forEach(tag => tagSet.add(tag));
		}
	}

	return Array.from(tagSet).sort();
}

// Point a bookmark at a new image (or none), removing the file it replaces
export function setBookmarkAsset(id: number, field: 'og_image_path' | 'favicon_path', path: string | null) {
	const old = getBookmark(id)?.[field] ?? null;
	db.prepare(`UPDATE bookmarks SET ${field} = ? WHERE id = ?`).run(path, id);
	if (old !== path) deleteAsset(old);
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 8000;
const FAVICON_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const slug = (domain: string) => domain.replace(/[^a-z0-9]/gi, '-');

export function saveAsset(buffer: Buffer, filename: string): string {
	const filepath = join(assetsPath, filename);
	writeFileSync(filepath, buffer);
	return `/assets/${filename}`;
}

// Map an /assets/... path to its file on disk, without letting it point anywhere else
function assetFile(path: string): string {
	return join(assetsPath, basename(path));
}

export function deleteAsset(path: string | null) {
	if (!path?.startsWith('/assets/')) return;
	try {
		unlinkSync(assetFile(path));
	} catch {
		// Already gone
	}
}

function assetIsImage(path: string | null): boolean {
	if (!path) return false;
	try {
		return imageInfo(readFileSync(assetFile(path))) !== null;
	} catch {
		return false;
	}
}

export function isHttpUrl(value: unknown): value is string {
	return typeof value === 'string' && /^https?:\/\//i.test(value);
}

interface ImageInfo {
	ext: string;
	width?: number;
	height?: number;
}

// Identify an image from its first bytes. Content-type headers are often wrong
// (octet-stream images, HTML error pages served as favicon.ico), so we don't trust them.
function imageInfo(buf: Buffer): ImageInfo | null {
	if (buf.length < 24) return null;
	if (buf.readUInt32BE(0) === 0x89504e47) {
		return { ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}
	if (buf.toString('ascii', 0, 4) === 'GIF8') {
		return { ext: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
	}
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		return { ext: 'jpg', ...jpegSize(buf) };
	}
	if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
		return { ext: 'webp', ...webpSize(buf) };
	}
	if (buf.toString('ascii', 4, 8) === 'ftyp' && /^avi[fs]/.test(buf.toString('ascii', 8, 12))) {
		return { ext: 'avif' };
	}
	if (buf.readUInt32BE(0) === 0x00000100) {
		return { ext: 'ico', width: buf[6] || 256, height: buf[7] || 256 };
	}
	const head = buf.toString('utf8', 0, 1000);
	if (/<svg[\s>]/i.test(head) && !/<html[\s>]/i.test(head)) {
		return { ext: 'svg' };
	}
	return null;
}

function jpegSize(buf: Buffer): { width?: number; height?: number } {
	let i = 2;
	while (i + 9 < buf.length && buf[i] === 0xff) {
		const marker = buf[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		// Start-of-frame markers hold the size (C4, C8 and CC are other tables)
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
		}
		i += 2 + buf.readUInt16BE(i + 2);
	}
	return {};
}

function webpSize(buf: Buffer): { width?: number; height?: number } {
	if (buf.length < 30) return {};
	const chunk = buf.toString('ascii', 12, 16);
	if (chunk === 'VP8 ') {
		return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
	}
	if (chunk === 'VP8L') {
		const bits = buf.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (chunk === 'VP8X') {
		return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
	}
	return {};
}

async function fetchImage(imageUrl: string, referer: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ buffer: Buffer; info: ImageInfo } | null> {
	try {
		const response = await fetch(imageUrl, {
			headers: {
				'User-Agent': BROWSER_UA,
				'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
				// Some CDNs refuse images that aren't requested from their own site
				'Referer': referer
			},
			signal: AbortSignal.timeout(timeoutMs)
		});

		if (!response.ok) {
			console.error(`Image download failed (${response.status}): ${imageUrl}`);
			return null;
		}
		if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
			console.error(`Image too large: ${imageUrl}`);
			return null;
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		const info = imageInfo(buffer);
		if (!info) {
			console.error(`Not an image: ${imageUrl}`);
			return null;
		}
		return { buffer, info };
	} catch (error) {
		console.error(`Image download failed: ${imageUrl}`, error instanceof Error ? error.message : error);
		return null;
	}
}

// Download the first usable preview image from a list of candidate URLs
export async function downloadPreviewImage(candidates: (string | null | undefined)[], domain: string, pageUrl: string): Promise<string | null> {
	for (const imageUrl of new Set(candidates.filter(isHttpUrl))) {
		const image = await fetchImage(imageUrl, pageUrl);
		if (!image) continue;

		// Skip tracking pixels and tiny icons
		const { width, height, ext } = image.info;
		if (image.buffer.length < 500 || (width && height && (width < 100 || height < 50))) {
			console.log(`Image too small, skipping: ${imageUrl}`);
			continue;
		}

		return saveAsset(image.buffer, `${slug(domain)}-og-${Date.now()}.${ext}`);
	}
	return null;
}

// Google's favicon service only knows public sites, and shouldn't be told about private ones
function isPublicHost(host: string): boolean {
	return host.includes('.') && !/\.(local|lan|home|internal|localdomain|arpa)$/i.test(host) && !/^[\d.]+$/.test(host);
}

export async function downloadFavicon(pageUrl: string, domain: string, candidates: (string | null | undefined)[] = []): Promise<string | null> {
	const iconUrls = [...candidates, `${new URL(pageUrl).origin}/favicon.ico`];
	if (isPublicHost(domain)) {
		iconUrls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
	}

	// Try them all at once so an unreachable host costs one timeout rather than one per URL,
	// then keep the first in order of preference that worked
	const icons = await Promise.all([...new Set(iconUrls.filter(isHttpUrl))].map((iconUrl) => fetchImage(iconUrl, pageUrl, FAVICON_TIMEOUT_MS)));
	const icon = icons.find((icon) => icon !== null);
	return icon ? saveAsset(icon.buffer, `${slug(domain)}-favicon-${Date.now()}.${icon.info.ext}`) : null;
}

// Store an image sent from the browser (an extension screenshot or a manual upload)
export function saveUploadedImage(buffer: Buffer, prefix: string): string | null {
	const info = imageInfo(buffer);
	if (!info || info.ext === 'svg') return null;
	return saveAsset(buffer, `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}.${info.ext}`);
}

// The extension uploads its screenshot before the save popup opens
export function saveCapture(buffer: Buffer): string | null {
	removeAbandonedCaptures();
	return saveUploadedImage(buffer, 'capture');
}

export function isCapturePath(path: unknown): path is string {
	return typeof path === 'string' && /^\/assets\/capture-[\w-]+\.(jpg|png|webp)$/.test(path) && existsSync(assetFile(path));
}

// Screenshots from saves that were cancelled are never used; clear them out after a day
function removeAbandonedCaptures() {
	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	const inUse = db.prepare('SELECT 1 FROM bookmarks WHERE og_image_path = ?');

	for (const file of readdirSync(assetsPath)) {
		const filepath = join(assetsPath, file);
		if (file.startsWith('capture-') && statSync(filepath).mtimeMs < cutoff && !inUse.get(`/assets/${file}`)) {
			unlinkSync(filepath);
		}
	}
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export interface PageMetadata {
	title: string | null;
	description: string | null;
	images: string[];
	icons: string[];
}

function decodeEntities(text: string): string {
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function attributes(tag: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	for (const [, name, ...values] of tag.matchAll(/([^\s=<>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
		attrs[name.toLowerCase()] = decodeEntities(values.find((v) => v !== undefined) ?? '');
	}
	return attrs;
}

function resolveUrl(value: string | undefined, base: string): string | null {
	if (!value) return null;
	try {
		const url = new URL(value.trim(), base);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

// Read a page's preview images, icons and description from its HTML. This works for most
// public pages; private, local and bot-protected ones need the extension's screenshot instead.
export async function fetchPageMetadata(pageUrl: string): Promise<PageMetadata | null> {
	try {
		const response = await fetch(pageUrl, {
			headers: {
				'User-Agent': BROWSER_UA,
				'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9'
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});

		if (!response.ok || !response.headers.get('content-type')?.includes('html')) {
			console.error(`No page metadata (${response.status}): ${pageUrl}`);
			return null;
		}

		const html = (await response.text()).slice(0, 2_000_000);
		const pageBase = response.url || pageUrl;
		const base = resolveUrl(attributes(html.match(/<base\b[^>]*>/i)?.[0] ?? '').href, pageBase) ?? pageBase;

		const meta = new Map<string, string>();
		for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
			const attrs = attributes(tag);
			const key = (attrs.property || attrs.name || attrs.itemprop)?.toLowerCase();
			if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content.trim());
		}

		const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => attributes(tag));
		const linksWithRel = (rel: RegExp) => links.filter((link) => rel.test(link.rel ?? '')).map((link) => link.href);
		const resolveAll = (urls: (string | undefined)[]) =>
			urls.map((url) => resolveUrl(url, base)).filter((url): url is string => url !== null);

		const title = meta.get('og:title') || decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();

		return {
			title: title || null,
			description: meta.get('og:description') || meta.get('description') || null,
			images: resolveAll([
				...['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src', 'image'].map((key) => meta.get(key)),
				...linksWithRel(/(^|\s)image_src(\s|$)/i)
			]),
			icons: resolveAll([...linksWithRel(/apple-touch-icon/i), ...linksWithRel(/(^|\s)icon(\s|$)/i)])
		};
	} catch (error) {
		console.error(`No page metadata: ${pageUrl}`, error instanceof Error ? error.message : error);
		return null;
	}
}

// Look a bookmark's page up again for a preview image and favicon. With onlyMissing,
// images that are already there and readable are left alone.
export async function refreshPreview(bookmark: Bookmark, onlyMissing = false): Promise<{ image: boolean; favicon: boolean }> {
	const found = { image: false, favicon: false };

	// Forget files that are missing or aren't really images
	for (const field of ['og_image_path', 'favicon_path'] as const) {
		if (bookmark[field] && !isHttpUrl(bookmark[field]) && !assetIsImage(bookmark[field])) {
			setBookmarkAsset(bookmark.id, field, null);
			bookmark = { ...bookmark, [field]: null };
		}
	}

	// Older bookmarks may point straight at another site's image; those get a local copy too
	const needsImage = !onlyMissing || !bookmark.og_image_path?.startsWith('/assets/');
	const needsFavicon = !onlyMissing || !bookmark.favicon_path;
	if (!needsImage && !needsFavicon) return found;

	const page = await fetchPageMetadata(bookmark.url);

	if (needsImage) {
		const candidates = [isHttpUrl(bookmark.og_image_path) ? bookmark.og_image_path : null, ...(page?.images ?? [])];
		const path = await downloadPreviewImage(candidates, bookmark.domain, bookmark.url);
		if (path) {
			setBookmarkAsset(bookmark.id, 'og_image_path', path);
			found.image = true;
		}
	}

	if (needsFavicon) {
		const path = await downloadFavicon(bookmark.url, bookmark.domain, page?.icons);
		if (path) {
			setBookmarkAsset(bookmark.id, 'favicon_path', path);
			found.favicon = true;
		}
	}

	return found;
}

export { assetsPath };
