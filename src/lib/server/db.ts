import Database from 'better-sqlite3';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

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
	const existing = db.prepare('SELECT id FROM bookmarks WHERE url = ?').get(data.url) as { id: number } | undefined;

	if (existing) {
		// Update timestamp and tags if bookmark exists
		const stmt = db.prepare('UPDATE bookmarks SET updated_at = CURRENT_TIMESTAMP, tags = ? WHERE id = ?');
		stmt.run(data.tags || null, existing.id);
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

export function saveAsset(buffer: Buffer, filename: string): string {
	const filepath = join(assetsPath, filename);
	writeFileSync(filepath, buffer);
	return `/assets/${filename}`;
}

export async function downloadAndSaveImage(imageUrl: string, domain: string): Promise<string | null> {
	try {
		const response = await fetch(imageUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
				'Accept': 'image/*,*/*;q=0.8'
			}
		});

		if (!response.ok) {
			console.error(`Failed to download image: ${response.status}`);
			return null;
		}

		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			console.error(`Invalid content type: ${contentType}`);
			return null;
		}

		const buffer = Buffer.from(await response.arrayBuffer());

		// Skip very small images (likely icons/placeholders)
		if (buffer.length < 5000) {
			console.log(`Image too small (${buffer.length} bytes), skipping`);
			return null;
		}

		// Determine file extension from content type
		const extMap: Record<string, string> = {
			'image/jpeg': 'jpg',
			'image/jpg': 'jpg',
			'image/png': 'png',
			'image/gif': 'gif',
			'image/webp': 'webp',
			'image/svg+xml': 'svg'
		};
		const ext = extMap[contentType] || 'jpg';

		const filename = `${domain.replace(/[^a-z0-9]/gi, '-')}-og-${Date.now()}.${ext}`;
		return saveAsset(buffer, filename);
	} catch (error) {
		console.error('Error downloading image:', error);
		return null;
	}
}

export async function downloadFavicon(url: string, domain: string): Promise<string | null> {
	try {
		// Try common favicon locations
		const faviconUrls = [
			`https://${domain}/favicon.ico`,
			`https://${domain}/favicon.png`,
			`https://www.google.com/s2/favicons?domain=${domain}&sz=32`
		];

		for (const faviconUrl of faviconUrls) {
			try {
				const response = await fetch(faviconUrl, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
					}
				});

				if (response.ok) {
					const contentType = response.headers.get('content-type') || '';
					if (contentType.includes('image') || faviconUrl.endsWith('.ico')) {
						const buffer = Buffer.from(await response.arrayBuffer());
						if (buffer.length > 0) {
							const ext = faviconUrl.endsWith('.png') ? 'png' : 'ico';
							const filename = `${domain.replace(/[^a-z0-9]/gi, '-')}-favicon-${Date.now()}.${ext}`;
							return saveAsset(buffer, filename);
						}
					}
				}
			} catch {
				// Try next favicon URL
				continue;
			}
		}

		return null;
	} catch (error) {
		console.error('Error downloading favicon:', error);
		return null;
	}
}

export { assetsPath };
