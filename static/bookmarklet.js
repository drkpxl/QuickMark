(function() {
	'use strict';

	// Get the API URL from the script src
	function getApiUrl() {
		if (document.currentScript?.src) {
			return new URL(document.currentScript.src).origin;
		}
		const scripts = document.getElementsByTagName('script');
		for (let i = scripts.length - 1; i >= 0; i--) {
			const src = scripts[i].src || '';
			if (src.includes('bookmarklet.js')) {
				return new URL(src).origin;
			}
		}
		return 'http://do:9022';
	}

	const apiUrl = getApiUrl();

	// Extract metadata
	function getMetadata() {
		const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
		const title = ogTitle || document.title || '';

		const ogDesc = document.querySelector('meta[property="og:description"]')?.content;
		const metaDesc = document.querySelector('meta[name="description"]')?.content;
		const description = ogDesc || metaDesc || '';

		let imageUrl = '';

		function isValidImageUrl(url) {
			if (!url || typeof url !== 'string') return false;
			if (url.startsWith('data:')) return false;
			if (url.includes('about:blank')) return false;
			if (url.includes('placeholder')) return false;
			return url.startsWith('http://') || url.startsWith('https://');
		}

		// Try og:image first (more reliable)
		const ogImage = document.querySelector('meta[property="og:image"]')?.content;
		if (isValidImageUrl(ogImage)) {
			imageUrl = ogImage;
		}

		// Then twitter:image
		if (!imageUrl) {
			const twitterImage = document.querySelector('meta[name="twitter:image"]')?.content ||
								  document.querySelector('meta[property="twitter:image"]')?.content;
			if (isValidImageUrl(twitterImage)) {
				imageUrl = twitterImage;
			}
		}

		// Then find a large image on page
		if (!imageUrl) {
			const images = Array.from(document.querySelectorAll('img'));
			const prominentImage = images.find(img => {
				if (img.width < 200 || img.height < 150) return false;
				const src = img.src || '';
				if (!isValidImageUrl(src)) return false;
				if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) return false;
				if (img.alt?.toLowerCase().includes('logo')) return false;
				return true;
			});
			if (prominentImage && isValidImageUrl(prominentImage.src)) {
				imageUrl = prominentImage.src;
			}
		}

		return {
			url: window.location.href,
			title: title.substring(0, 500),
			description: description.substring(0, 1000),
			image_url: imageUrl
		};
	}

	const metadata = getMetadata();

	// Open popup window with the save dialog
	const params = new URLSearchParams({
		url: metadata.url,
		title: metadata.title,
		description: metadata.description,
		image_url: metadata.image_url
	});

	const popupUrl = apiUrl + '/save?' + params.toString();
	const popup = window.open(popupUrl, 'quickmark_save', 'width=500,height=600,scrollbars=yes,resizable=yes');

	if (!popup || popup.closed || typeof popup.closed === 'undefined') {
		alert('Please allow popups for this site to use QuickMark bookmarklet.');
	}
})();
