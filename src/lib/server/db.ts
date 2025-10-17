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

export function deleteBookmark(id: number): boolean {
	const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ?');
	const result = stmt.run(id);
	return result.changes > 0;
}

export function saveAsset(buffer: Buffer, filename: string): string {
	const filepath = join(assetsPath, filename);
	writeFileSync(filepath, buffer);
	return `/assets/${filename}`;
}

export { assetsPath };
