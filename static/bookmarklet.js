(function() {
	'use strict';

	// Get the API URL from the script src
	// document.currentScript is null for dynamically loaded scripts, so we find our script manually
	function getApiUrl() {
		// Try document.currentScript first
		if (document.currentScript?.src) {
			return new URL(document.currentScript.src).origin;
		}
		// Find our script in the document
		const scripts = document.getElementsByTagName('script');
		for (let i = scripts.length - 1; i >= 0; i--) {
			const src = scripts[i].src || '';
			if (src.includes('bookmarklet.js')) {
				return new URL(src).origin;
			}
		}
		// Fallback - this should be updated to your QuickMark URL
		return 'http://do:9022';
	}

	const apiUrl = getApiUrl();

	// Check if popup already exists
	if (document.getElementById('quickmark-popup')) {
		document.getElementById('quickmark-popup').remove();
		return;
	}

	// Extract metadata from the current page
	function getMetadata() {
		// Get title: og:title > document.title
		const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
		const title = ogTitle || document.title || '';

		// Get description: og:description > meta description
		const ogDesc = document.querySelector('meta[property="og:description"]')?.content;
		const metaDesc = document.querySelector('meta[name="description"]')?.content;
		const description = ogDesc || metaDesc || '';

		// Get image: First try to find prominent images, then fall back to og:image
		let imageUrl = '';

		// Helper to check if URL is valid (not blocked/placeholder)
		function isValidImageUrl(url) {
			if (!url || typeof url !== 'string') return false;
			if (url.startsWith('data:')) return false;
			if (url.includes('about:blank')) return false;
			if (url.includes('placeholder')) return false;
			// Must be http/https
			return url.startsWith('http://') || url.startsWith('https://');
		}

		// Strategy 1: Find large images on the page (not icons/logos)
		const images = Array.from(document.querySelectorAll('img'));
		const prominentImage = images.find(img => {
			// Skip tiny images, icons, avatars, logos
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

		// Strategy 2: Fall back to og:image
		if (!imageUrl) {
			const ogImage = document.querySelector('meta[property="og:image"]')?.content;
			if (isValidImageUrl(ogImage)) {
				imageUrl = ogImage;
			}
		}

		// Strategy 3: Try twitter:image
		if (!imageUrl) {
			const twitterImage = document.querySelector('meta[name="twitter:image"]')?.content ||
								  document.querySelector('meta[property="twitter:image"]')?.content;
			if (isValidImageUrl(twitterImage)) {
				imageUrl = twitterImage;
			}
		}

		return {
			url: window.location.href,
			title: title.substring(0, 500),
			description: description.substring(0, 1000),
			image_url: imageUrl
		};
	}

	// Create popup HTML
	function createPopup(metadata, existingTags) {
		const popup = document.createElement('div');
		popup.id = 'quickmark-popup';
		popup.innerHTML = `
			<style>
				#quickmark-popup {
					position: fixed;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background: rgba(0, 0, 0, 0.8);
					z-index: 2147483647;
					display: flex;
					align-items: center;
					justify-content: center;
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
				}
				#quickmark-popup * {
					box-sizing: border-box;
				}
				#quickmark-popup .qm-dialog {
					background: #1a1a2e;
					border-radius: 12px;
					box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
					width: 90%;
					max-width: 500px;
					max-height: 90vh;
					overflow: auto;
					color: #e0e0e0;
				}
				#quickmark-popup .qm-header {
					padding: 16px 20px;
					border-bottom: 1px solid #2d2d44;
					display: flex;
					align-items: center;
					justify-content: space-between;
				}
				#quickmark-popup .qm-header h2 {
					margin: 0;
					font-size: 18px;
					font-weight: 600;
					color: #fff;
				}
				#quickmark-popup .qm-close {
					background: none;
					border: none;
					color: #888;
					font-size: 24px;
					cursor: pointer;
					padding: 0;
					line-height: 1;
				}
				#quickmark-popup .qm-close:hover {
					color: #fff;
				}
				#quickmark-popup .qm-body {
					padding: 20px;
				}
				#quickmark-popup .qm-preview {
					display: flex;
					gap: 12px;
					margin-bottom: 16px;
					padding: 12px;
					background: #16162a;
					border-radius: 8px;
				}
				#quickmark-popup .qm-preview-image {
					width: 80px;
					height: 80px;
					object-fit: cover;
					border-radius: 6px;
					background: #2d2d44;
				}
				#quickmark-popup .qm-preview-info {
					flex: 1;
					overflow: hidden;
				}
				#quickmark-popup .qm-preview-title {
					font-weight: 600;
					color: #fff;
					margin-bottom: 4px;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				#quickmark-popup .qm-preview-url {
					font-size: 12px;
					color: #888;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				#quickmark-popup .qm-field {
					margin-bottom: 16px;
				}
				#quickmark-popup .qm-label {
					display: block;
					font-size: 13px;
					font-weight: 500;
					color: #aaa;
					margin-bottom: 6px;
				}
				#quickmark-popup .qm-input,
				#quickmark-popup .qm-textarea {
					width: 100%;
					padding: 10px 12px;
					background: #16162a;
					border: 1px solid #2d2d44;
					border-radius: 6px;
					color: #fff;
					font-size: 14px;
					transition: border-color 0.2s;
				}
				#quickmark-popup .qm-input:focus,
				#quickmark-popup .qm-textarea:focus {
					outline: none;
					border-color: #4a4af0;
				}
				#quickmark-popup .qm-textarea {
					resize: vertical;
					min-height: 80px;
				}
				#quickmark-popup .qm-tags-container {
					position: relative;
				}
				#quickmark-popup .qm-tags-dropdown {
					position: absolute;
					top: 100%;
					left: 0;
					right: 0;
					background: #16162a;
					border: 1px solid #2d2d44;
					border-radius: 6px;
					max-height: 150px;
					overflow-y: auto;
					z-index: 10;
					display: none;
				}
				#quickmark-popup .qm-tags-dropdown.show {
					display: block;
				}
				#quickmark-popup .qm-tag-option {
					padding: 8px 12px;
					cursor: pointer;
					font-size: 14px;
				}
				#quickmark-popup .qm-tag-option:hover,
				#quickmark-popup .qm-tag-option.selected {
					background: #2d2d44;
				}
				#quickmark-popup .qm-footer {
					padding: 16px 20px;
					border-top: 1px solid #2d2d44;
					display: flex;
					gap: 12px;
					justify-content: flex-end;
				}
				#quickmark-popup .qm-btn {
					padding: 10px 20px;
					border-radius: 6px;
					font-size: 14px;
					font-weight: 500;
					cursor: pointer;
					border: none;
					transition: all 0.2s;
				}
				#quickmark-popup .qm-btn-secondary {
					background: #2d2d44;
					color: #e0e0e0;
				}
				#quickmark-popup .qm-btn-secondary:hover {
					background: #3d3d5c;
				}
				#quickmark-popup .qm-btn-primary {
					background: #4a4af0;
					color: #fff;
				}
				#quickmark-popup .qm-btn-primary:hover {
					background: #5a5aff;
				}
				#quickmark-popup .qm-btn-primary:disabled {
					background: #333;
					color: #666;
					cursor: not-allowed;
				}
				#quickmark-popup .qm-message {
					padding: 12px;
					border-radius: 6px;
					margin-bottom: 16px;
					font-size: 14px;
				}
				#quickmark-popup .qm-message.success {
					background: #1a4d1a;
					color: #4ade4a;
				}
				#quickmark-popup .qm-message.error {
					background: #4d1a1a;
					color: #de4a4a;
				}
				#quickmark-popup .qm-spinner {
					display: inline-block;
					width: 16px;
					height: 16px;
					border: 2px solid rgba(255,255,255,0.3);
					border-radius: 50%;
					border-top-color: #fff;
					animation: qm-spin 1s linear infinite;
					margin-right: 8px;
				}
				@keyframes qm-spin {
					to { transform: rotate(360deg); }
				}
			</style>
			<div class="qm-dialog">
				<div class="qm-header">
					<h2>Save to QuickMark</h2>
					<button class="qm-close" id="qm-close">&times;</button>
				</div>
				<div class="qm-body">
					<div id="qm-message"></div>
					<div class="qm-preview">
						${metadata.image_url ? `<img class="qm-preview-image" src="${metadata.image_url}" alt="" onerror="this.style.display='none'">` : ''}
						<div class="qm-preview-info">
							<div class="qm-preview-title">${escapeHtml(metadata.title || 'Untitled')}</div>
							<div class="qm-preview-url">${escapeHtml(metadata.url)}</div>
						</div>
					</div>
					<div class="qm-field">
						<label class="qm-label">Title</label>
						<input type="text" class="qm-input" id="qm-title" value="${escapeHtml(metadata.title)}" placeholder="Page title">
					</div>
					<div class="qm-field">
						<label class="qm-label">Description</label>
						<textarea class="qm-textarea" id="qm-description" placeholder="Page description">${escapeHtml(metadata.description)}</textarea>
					</div>
					<div class="qm-field">
						<label class="qm-label">Tags (comma-separated)</label>
						<div class="qm-tags-container">
							<input type="text" class="qm-input" id="qm-tags" placeholder="design, inspiration, tutorial">
							<div class="qm-tags-dropdown" id="qm-tags-dropdown">
								${existingTags.map(tag => `<div class="qm-tag-option" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</div>`).join('')}
							</div>
						</div>
					</div>
				</div>
				<div class="qm-footer">
					<button class="qm-btn qm-btn-secondary" id="qm-cancel">Cancel</button>
					<button class="qm-btn qm-btn-primary" id="qm-save">Save Bookmark</button>
				</div>
			</div>
		`;

		return popup;
	}

	function escapeHtml(text) {
		if (!text) return '';
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	// Fetch existing tags for autocomplete
	async function fetchTags() {
		try {
			const response = await fetch(`${apiUrl}/api/tags`);
			if (response.ok) {
				return await response.json();
			}
		} catch (e) {
			console.error('Failed to fetch tags:', e);
		}
		return [];
	}

	// Save bookmark
	async function saveBookmark(data) {
		const response = await fetch(`${apiUrl}/api/bookmark`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to save bookmark');
		}

		return await response.json();
	}

	// Initialize popup
	async function init() {
		const metadata = getMetadata();
		const existingTags = await fetchTags();
		const popup = createPopup(metadata, existingTags);
		document.body.appendChild(popup);

		// Elements
		const closeBtn = document.getElementById('qm-close');
		const cancelBtn = document.getElementById('qm-cancel');
		const saveBtn = document.getElementById('qm-save');
		const titleInput = document.getElementById('qm-title');
		const descInput = document.getElementById('qm-description');
		const tagsInput = document.getElementById('qm-tags');
		const tagsDropdown = document.getElementById('qm-tags-dropdown');
		const messageDiv = document.getElementById('qm-message');

		let selectedTagIndex = -1;

		// Close handlers
		function close() {
			popup.remove();
		}

		closeBtn.addEventListener('click', close);
		cancelBtn.addEventListener('click', close);
		popup.addEventListener('click', (e) => {
			if (e.target === popup) close();
		});

		// Escape key to close
		document.addEventListener('keydown', function escHandler(e) {
			if (e.key === 'Escape') {
				close();
				document.removeEventListener('keydown', escHandler);
			}
		});

		// Tag autocomplete
		function updateTagDropdown() {
			const value = tagsInput.value;
			const lastComma = value.lastIndexOf(',');
			const currentTag = (lastComma >= 0 ? value.substring(lastComma + 1) : value).trim().toLowerCase();
			const usedTags = value.split(',').map(t => t.trim().toLowerCase());

			const filtered = existingTags.filter(tag =>
				tag.toLowerCase().startsWith(currentTag) &&
				currentTag.length > 0 &&
				!usedTags.slice(0, -1).includes(tag.toLowerCase())
			);

			if (filtered.length > 0) {
				tagsDropdown.innerHTML = filtered.map((tag, i) =>
					`<div class="qm-tag-option${i === selectedTagIndex ? ' selected' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</div>`
				).join('');
				tagsDropdown.classList.add('show');
			} else {
				tagsDropdown.classList.remove('show');
			}
		}

		function insertTag(tag) {
			const value = tagsInput.value;
			const lastComma = value.lastIndexOf(',');
			const prefix = lastComma >= 0 ? value.substring(0, lastComma + 1) + ' ' : '';
			tagsInput.value = prefix + tag + ', ';
			tagsDropdown.classList.remove('show');
			selectedTagIndex = -1;
			tagsInput.focus();
		}

		tagsInput.addEventListener('input', () => {
			selectedTagIndex = -1;
			updateTagDropdown();
		});

		tagsInput.addEventListener('focus', updateTagDropdown);

		tagsInput.addEventListener('blur', () => {
			setTimeout(() => tagsDropdown.classList.remove('show'), 200);
		});

		tagsInput.addEventListener('keydown', (e) => {
			const options = tagsDropdown.querySelectorAll('.qm-tag-option');
			if (!tagsDropdown.classList.contains('show') || options.length === 0) return;

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedTagIndex = Math.min(selectedTagIndex + 1, options.length - 1);
				updateTagDropdown();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedTagIndex = Math.max(selectedTagIndex - 1, -1);
				updateTagDropdown();
			} else if (e.key === 'Enter' && selectedTagIndex >= 0) {
				e.preventDefault();
				insertTag(options[selectedTagIndex].dataset.tag);
			}
		});

		tagsDropdown.addEventListener('click', (e) => {
			if (e.target.classList.contains('qm-tag-option')) {
				insertTag(e.target.dataset.tag);
			}
		});

		// Save handler
		saveBtn.addEventListener('click', async () => {
			saveBtn.disabled = true;
			saveBtn.innerHTML = '<span class="qm-spinner"></span>Saving...';
			messageDiv.innerHTML = '';

			try {
				await saveBookmark({
					url: metadata.url,
					title: titleInput.value.trim() || metadata.title,
					description: descInput.value.trim() || metadata.description,
					image_url: metadata.image_url,
					tags: tagsInput.value.trim() || null
				});

				messageDiv.className = 'qm-message success';
				messageDiv.textContent = 'Bookmark saved successfully!';
				saveBtn.textContent = 'Saved!';

				setTimeout(close, 1500);
			} catch (error) {
				messageDiv.className = 'qm-message error';
				messageDiv.textContent = error.message || 'Failed to save bookmark';
				saveBtn.disabled = false;
				saveBtn.textContent = 'Save Bookmark';
			}
		});

		// Focus title input
		titleInput.focus();
		titleInput.select();
	}

	init();
})();
