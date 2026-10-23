import { crc32 } from 'zlib';
import type { RequestHandler } from './$types';
import manifest from '../../../../extension/manifest.json?raw';
import background from '../../../../extension/background.js?raw';
import icon16 from '../../../../extension/icon16.png?inline';
import icon48 from '../../../../extension/icon48.png?inline';
import icon128 from '../../../../extension/icon128.png?inline';

const fromDataUrl = (dataUrl: string) => Buffer.from(dataUrl.split(',')[1], 'base64');

// Build a zip with no compression, which is all Chrome's "Load unpacked" needs after unzipping
function zip(files: Record<string, Buffer>): Buffer {
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const [name, data] of Object.entries(files)) {
		const nameBytes = Buffer.from(name);
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0x21, 12); // modified date: 1 Jan 1980
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(0x21, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);

		localParts.push(local, nameBytes, data);
		centralParts.push(central, nameBytes);
		offset += local.length + nameBytes.length + data.length;
	}

	const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(files).length, 8);
	end.writeUInt16LE(Object.keys(files).length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);

	return Buffer.concat([...localParts, ...centralParts, end]);
}

// The Chrome extension, already pointed at this QuickMark server. The page passes the address
// it was opened at, since behind Node the server itself assumes https.
export const GET: RequestHandler = async ({ url }) => {
	const requested = url.searchParams.get('origin') ?? '';
	const origin = /^https?:\/\/[\w.-]+(:\d+)?$/.test(requested) ? requested : url.origin;
	const configured = background.replace(/const QUICKMARK_URL = '[^']*';/, `const QUICKMARK_URL = ${JSON.stringify(origin)};`);

	const archive = zip({
		'quickmark-extension/manifest.json': Buffer.from(manifest),
		'quickmark-extension/background.js': Buffer.from(configured),
		'quickmark-extension/icon16.png': fromDataUrl(icon16),
		'quickmark-extension/icon48.png': fromDataUrl(icon48),
		'quickmark-extension/icon128.png': fromDataUrl(icon128)
	});

	return new Response(new Uint8Array(archive), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="quickmark-extension.zip"'
		}
	});
};
