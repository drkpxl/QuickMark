// Quick test script to verify metadata extraction
// Run with: node test-metadata.js

const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

async function testOEmbed() {
	console.log('Testing YouTube oEmbed API...\n');

	const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(testUrl)}&format=json`;
	console.log('Fetching:', oembedUrl);

	try {
		const response = await fetch(oembedUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			}
		});

		console.log('Status:', response.status, response.statusText);

		if (response.ok) {
			const data = await response.json();
			console.log('\n✓ Success! Metadata:');
			console.log(JSON.stringify(data, null, 2));

			// Test thumbnail
			const videoId = testUrl.match(/[?&]v=([^&]+)/)?.[1];
			if (videoId) {
				const thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
				console.log(`\nTesting thumbnail: ${thumbUrl}`);
				const thumbResponse = await fetch(thumbUrl, { method: 'HEAD' });
				console.log('Thumbnail status:', thumbResponse.status);
			}
		} else {
			console.error('✗ Failed:', await response.text());
		}
	} catch (error) {
		console.error('✗ Error:', error.message);
	}
}

testOEmbed();
