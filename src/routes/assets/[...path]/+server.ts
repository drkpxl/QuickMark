import { readFileSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const assetsPath = join(process.cwd(), 'data', 'assets');
		const filepath = join(assetsPath, params.path);

		// Security: Ensure the path doesn't escape the assets directory
		if (!filepath.startsWith(assetsPath)) {
			return new Response('Forbidden', { status: 403 });
		}

		const file = readFileSync(filepath);
		const ext = params.path.split('.').pop()?.toLowerCase();

		const mimeTypes: Record<string, string> = {
			'ico': 'image/x-icon',
			'png': 'image/png',
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'gif': 'image/gif',
			'svg': 'image/svg+xml',
			'webp': 'image/webp'
		};

		const contentType = mimeTypes[ext || ''] || 'application/octet-stream';

		return new Response(file, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (error) {
		console.error('Error serving asset:', error);
		return new Response('Not Found', { status: 404 });
	}
};
