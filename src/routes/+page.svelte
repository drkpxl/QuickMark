<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let message = $state('');
	let viewLayout = $state<'compact' | 'card' | 'dense'>('compact');
	let selectedIndex = $state(-1);
	let showHelp = $state(false);
	let showInstall = $state(false);
	let copied = $state('');
	let selectedTags = $state<Set<string>>(new Set());
	let editingBookmark = $state<typeof data.bookmarks[0] | null>(null);
	let editUrl = $state('');
	let editTitle = $state('');
	let editTags = $state('');
	let editDescription = $state('');
	let editImageUrl = $state('');
	let imageBusy = $state(false);
	let imageError = $state('');
	let updating = $state(false);
	let backfilling = $state(false);

	// Autocomplete state for edit form
	let showEditAutocomplete = $state(false);
	let editAutocompleteIndex = $state(-1);
	let editTagInputRef = $state<HTMLInputElement | null>(null);

	// Bookmarklet code - will be populated on mount
	let bookmarkletCode = $state('');

	// The server can't reliably tell its own address (it assumes https), so downloads that
	// need it are told by the browser
	let appOrigin = $state('');

	onMount(() => {
		// Load view preference from localStorage
		const savedView = localStorage.getItem('viewLayout') as 'compact' | 'card' | 'dense' | null;
		if (savedView) {
			viewLayout = savedView;
		}

		// Generate bookmarklet code with current origin
		const apiUrl = window.location.origin;
		appOrigin = apiUrl;
		bookmarkletCode = generateBookmarkletCode(apiUrl);
	});

	function generateBookmarkletCode(apiUrl: string): string {
		// Simplified bookmarklet - just URL and title to avoid syntax errors
		return `javascript:(function(){window.open('${apiUrl}/save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title||''),'quickmark','width=500,height=600,scrollbars=yes')})()`;
	}

	function scrollToBookmark(index: number) {
		const element = document.querySelector(`[data-bookmark-index="${index}"]`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	function copyText(text: string, key: string) {
		navigator.clipboard.writeText(text);
		copied = key;
		setTimeout(() => copied = '', 2000);
	}

	function setViewLayout(layout: 'compact' | 'card' | 'dense') {
		viewLayout = layout;
		localStorage.setItem('viewLayout', layout);
	}

	async function exportBookmarks(format: 'json' | 'html') {
		try {
			const response = await fetch(`/api/export?format=${format}`);
			if (!response.ok) throw new Error('Export failed');

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `bookmarks-${Date.now()}.${format}`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);

			message = `Exported ${filteredBookmarks.length} bookmarks as ${format.toUpperCase()}`;
			setTimeout(() => message = '', 3000);
		} catch (err) {
			message = 'Export failed';
			console.error(err);
			setTimeout(() => message = '', 3000);
		}
	}


	function startEdit(bookmark: typeof data.bookmarks[0]) {
		editingBookmark = bookmark;
		editUrl = bookmark.url;
		editTitle = bookmark.title || '';
		editTags = bookmark.tags || '';
		editDescription = bookmark.description || '';
		editImageUrl = '';
		imageError = '';
	}

	function cancelEdit() {
		editingBookmark = null;
		editUrl = '';
		editTitle = '';
		editTags = '';
		editDescription = '';
	}

	// Image changes save straight away, separately from the rest of the edit form
	async function changeImage(body: Blob | { source: 'refetch' | 'url' | 'remove'; image_url?: string }) {
		if (!editingBookmark) return;

		imageBusy = true;
		imageError = '';

		try {
			const isUpload = body instanceof Blob;
			const response = await fetch(`/api/bookmark/${editingBookmark.id}/image`, {
				method: 'POST',
				headers: { 'Content-Type': isUpload ? body.type : 'application/json' },
				body: isUpload ? body : JSON.stringify(body)
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);

			editingBookmark = result;
			editImageUrl = '';
			await invalidateAll();
		} catch (err) {
			imageError = err instanceof Error && err.message ? err.message : 'Failed to update image';
		} finally {
			imageBusy = false;
		}
	}

	// Shrink big photos before uploading; cards never show them larger than ~600px
	async function shrinkImage(file: File): Promise<Blob> {
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, 1280 / bitmap.width);
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);

			const context = canvas.getContext('2d')!;
			context.fillStyle = '#fff';
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

			return await new Promise((resolve, reject) =>
				canvas.toBlob((blob) => (blob ? resolve(blob) : reject()), 'image/jpeg', 0.85)
			);
		} catch {
			return file;
		}
	}

	async function uploadImage(file: File | undefined) {
		if (!file?.type.startsWith('image/')) return;
		await changeImage(await shrinkImage(file));
	}

	function handleEditPaste(e: ClipboardEvent) {
		const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
		if (file) {
			e.preventDefault();
			uploadImage(file);
		}
	}

	async function backfillImages() {
		backfilling = true;
		message = '';

		try {
			const response = await fetch('/api/backfill', { method: 'POST' });
			if (!response.ok) throw new Error('Backfill failed');

			const { images, favicons, missing } = await response.json();
			await invalidateAll();

			message = `Found ${images} image${images === 1 ? '' : 's'} and ${favicons} icon${favicons === 1 ? '' : 's'}.`;
			if (missing > 0) {
				message += ` ${missing} still have no image — private or local pages need a re-save with the extension to get a screenshot.`;
			}
		} catch (err) {
			message = 'Failed to fetch missing images';
			console.error(err);
		} finally {
			backfilling = false;
			setTimeout(() => message = '', 8000);
		}
	}

	// A steady color per site for cards that have no image
	function domainHue(domain: string): number {
		let hash = 0;
		for (const char of domain) hash = (hash * 31 + char.charCodeAt(0)) % 360;
		return hash;
	}

	async function updateBookmark() {
		if (!editingBookmark || !editUrl.trim()) return;

		updating = true;
		message = '';

		try {
			const response = await fetch(`/api/bookmark/${editingBookmark.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: editUrl.trim(),
					title: editTitle.trim() || null,
					tags: editTags.trim() || null,
					description: editDescription.trim() || null
				})
			});

			if (response.ok) {
				message = 'Bookmark updated!';
				cancelEdit();
				// Reload bookmarks
				window.location.reload();
			} else {
				const error = await response.json();
				message = error.message || 'Failed to update bookmark';
			}
		} catch (err) {
			message = 'Error updating bookmark';
			console.error(err);
		} finally {
			updating = false;
			setTimeout(() => message = '', 3000);
		}
	}

	async function deleteBookmark(id: number) {
		if (!confirm('Delete this bookmark?')) return;

		try {
			const response = await fetch(`/api/bookmark/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				window.location.reload();
			}
		} catch (err) {
			console.error('Error deleting bookmark:', err);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// Don't handle if user is typing in an input
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			if (e.key === 'Escape') {
				searchQuery = '';
				selectedIndex = -1;
			}
			return;
		}

		// Help modal
		if (e.key === '?') {
			e.preventDefault();
			showHelp = !showHelp;
			return;
		}

		// Close help on Escape
		if (e.key === 'Escape' && showHelp) {
			showHelp = false;
			return;
		}

		// Close edit modal on Escape
		if (e.key === 'Escape' && editingBookmark) {
			cancelEdit();
			return;
		}

		// Navigation keys
		if (e.key === 'j' || e.key === 'ArrowDown') {
			e.preventDefault();
			if (filteredBookmarks.length === 0) return;
			selectedIndex = Math.min(selectedIndex + 1, filteredBookmarks.length - 1);
			scrollToBookmark(selectedIndex);
		}

		if (e.key === 'k' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (filteredBookmarks.length === 0) return;
			selectedIndex = Math.max(selectedIndex - 1, 0);
			scrollToBookmark(selectedIndex);
		}

		// Open selected bookmark
		if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
			e.preventDefault();
			const bookmark = filteredBookmarks[selectedIndex];
			window.open(bookmark.url, '_blank', 'noopener,noreferrer');
		}

		// Edit selected bookmark
		if (e.key === 'e' && selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
			e.preventDefault();
			const bookmark = filteredBookmarks[selectedIndex];
			startEdit(bookmark);
		}

		// Delete selected bookmark
		if (e.key === 'd' && selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
			e.preventDefault();
			const bookmark = filteredBookmarks[selectedIndex];
			deleteBookmark(bookmark.id);
		}

		// Focus search
		if (e.key === '/' || (e.key === 'f' && (e.ctrlKey || e.metaKey))) {
			e.preventDefault();
			const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
			searchInput?.focus();
		}
	}

	// Get all unique tags from bookmarks
	let allTags = $derived(
		Array.from(
			new Set(
				data.bookmarks
					.filter(b => b.tags)
					.flatMap(b => b.tags!.split(',').map(t => t.trim()))
					.filter(t => t.length > 0)
			)
		).sort()
	);

	// Get the current tag being typed (after the last comma)
	function getCurrentTag(value: string, cursorPos: number): { prefix: string; currentTag: string; suffix: string } {
		const beforeCursor = value.substring(0, cursorPos);
		const afterCursor = value.substring(cursorPos);
		const lastCommaIndex = beforeCursor.lastIndexOf(',');

		if (lastCommaIndex === -1) {
			return { prefix: '', currentTag: beforeCursor.trim(), suffix: afterCursor };
		}

		const prefix = beforeCursor.substring(0, lastCommaIndex + 1);
		const currentTag = beforeCursor.substring(lastCommaIndex + 1).trim();
		return { prefix, currentTag, suffix: afterCursor };
	}

	// Get filtered autocomplete suggestions for edit form
	let editAutocompleteSuggestions = $derived(() => {
		if (!editTagInputRef || !showEditAutocomplete) return [];
		const cursorPos = editTagInputRef.selectionStart || 0;
		const { currentTag } = getCurrentTag(editTags, cursorPos);

		if (currentTag.length === 0) return [];

		const existingTags = editTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
		return allTags
			.filter(tag =>
				tag.toLowerCase().startsWith(currentTag.toLowerCase()) &&
				!existingTags.includes(tag)
			)
			.slice(0, 10);
	});

	function handleEditTagInput() {
		if (!editTagInputRef) return;
		const cursorPos = editTagInputRef.selectionStart || 0;
		const { currentTag } = getCurrentTag(editTags, cursorPos);

		showEditAutocomplete = currentTag.length > 0;
		editAutocompleteIndex = -1;
	}

	function insertTag(tag: string) {
		if (!editTagInputRef) return;

		const cursorPos = editTagInputRef.selectionStart || 0;
		const { prefix, suffix } = getCurrentTag(editTags, cursorPos);

		const newValue = prefix + (prefix && !prefix.endsWith(' ') ? ' ' : '') + tag + ', ' + suffix;

		editTags = newValue;
		showEditAutocomplete = false;
		editAutocompleteIndex = -1;

		// Set cursor position after the inserted tag
		setTimeout(() => {
			if (editTagInputRef) {
				const newCursorPos = prefix.length + (prefix && !prefix.endsWith(' ') ? 1 : 0) + tag.length + 2;
				editTagInputRef.focus();
				editTagInputRef.setSelectionRange(newCursorPos, newCursorPos);
			}
		}, 0);
	}

	function handleTagKeydown(e: KeyboardEvent) {
		const suggestions = editAutocompleteSuggestions();

		if (!showEditAutocomplete || suggestions.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			editAutocompleteIndex = Math.min(editAutocompleteIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			editAutocompleteIndex = Math.max(editAutocompleteIndex - 1, -1);
		} else if (e.key === 'Enter' && editAutocompleteIndex >= 0) {
			e.preventDefault();
			insertTag(suggestions[editAutocompleteIndex]);
		} else if (e.key === 'Escape') {
			showEditAutocomplete = false;
			editAutocompleteIndex = -1;
		}
	}

	function toggleTag(tag: string) {
		const newSelectedTags = new Set(selectedTags);
		if (newSelectedTags.has(tag)) {
			newSelectedTags.delete(tag);
		} else {
			newSelectedTags.add(tag);
		}
		selectedTags = newSelectedTags;
	}

	let missingImages = $derived(data.bookmarks.filter(b => !b.og_image_path).length);

	let filteredBookmarks = $derived(
		data.bookmarks.filter(bookmark => {
			// Filter by search query
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				const matchesSearch = (
					bookmark.title?.toLowerCase().includes(query) ||
					bookmark.description?.toLowerCase().includes(query) ||
					bookmark.url.toLowerCase().includes(query) ||
					bookmark.domain.toLowerCase().includes(query) ||
					bookmark.tags?.toLowerCase().includes(query)
				);
				if (!matchesSearch) return false;
			}

			// Filter by selected tags
			if (selectedTags.size > 0) {
				if (!bookmark.tags) return false;
				const bookmarkTags = bookmark.tags.split(',').map(t => t.trim());
				const hasSelectedTag = Array.from(selectedTags).some(tag => bookmarkTags.includes(tag));
				if (!hasSelectedTag) return false;
			}

			return true;
		})
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Toolbar -->
<div class="row mb-3">
	<div class="col-12">
		<div class="d-flex flex-wrap gap-2 align-items-center">
			<div class="btn-group" role="group" aria-label="View layout">
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					class:active={viewLayout === 'compact'}
					onclick={() => setViewLayout('compact')}
					title="Compact view"
				>
					📋 Compact
				</button>
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					class:active={viewLayout === 'card'}
					onclick={() => setViewLayout('card')}
					title="Card view"
				>
					🖼️ Cards
				</button>
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					class:active={viewLayout === 'dense'}
					onclick={() => setViewLayout('dense')}
					title="Dense view"
				>
					📝 Dense
				</button>
			</div>
			<button
				type="button"
				class="btn btn-sm btn-primary"
				onclick={() => showInstall = true}
				title="Install the Chrome extension"
			>
				<i class="bi bi-puzzle me-1"></i> Extension
			</button>
			<div class="btn-group" role="group" aria-label="Export">
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					onclick={() => exportBookmarks('json')}
					title="Export as JSON"
				>
					📥 JSON
				</button>
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					onclick={() => exportBookmarks('html')}
					title="Export as HTML"
				>
					📥 HTML
				</button>
			</div>
			{#if missingImages > 0}
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					onclick={backfillImages}
					disabled={backfilling}
					title="Look up preview images for bookmarks that don't have one"
				>
					{#if backfilling}
						<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
					{:else}
						<i class="bi bi-images me-1"></i>
					{/if}
					Fetch {missingImages} missing image{missingImages === 1 ? '' : 's'}
				</button>
			{/if}
			<div class="flex-grow-1" style="min-width: 200px;">
				<input
					type="search"
					class="form-control form-control-sm"
					placeholder="🔍 Search... (/ to focus, ESC to clear)"
					bind:value={searchQuery}
				/>
			</div>
			<small class="text-muted text-nowrap">{filteredBookmarks.length} bookmark{filteredBookmarks.length !== 1 ? 's' : ''}</small>
		</div>
	</div>
</div>

<!-- Tag Filter -->
{#if allTags.length > 0}
	<div class="row mb-2">
		<div class="col-12">
			<div class="d-flex flex-wrap gap-1 align-items-center" style="font-size: 0.875rem;">
				<span class="text-muted me-1">Filter by tags:</span>
				{#each allTags as tag}
					<button
						type="button"
						class="badge rounded-pill"
						class:bg-primary={selectedTags.has(tag)}
						class:text-bg-secondary={!selectedTags.has(tag)}
						onclick={() => toggleTag(tag)}
						style="cursor: pointer; border: none;"
					>
						{tag}
					</button>
				{/each}
				{#if selectedTags.size > 0}
					<button
						type="button"
						class="btn btn-sm btn-link text-muted p-0 ms-1"
						onclick={() => selectedTags = new Set()}
						style="font-size: 0.75rem;"
					>
						Clear
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if message}
	<div class="alert alert-{message.includes('Error') || message.includes('Failed') ? 'danger' : 'success'} mb-3" role="alert">
		{message}
	</div>
{/if}

<div class="row">
	<div class="col-12">
		{#if filteredBookmarks.length === 0}
			<div class="card bg-body-secondary">
				<div class="card-body text-center py-5">
					<div class="text-muted">
						{#if searchQuery}
							<h5>No Results Found</h5>
							<p class="mb-0">No bookmarks match "{searchQuery}"</p>
						{:else}
							<h5>Get Started</h5>
							<p class="mb-2">Install the Chrome extension to start saving bookmarks from any page!</p>
							<button
								type="button"
								class="btn btn-primary"
								onclick={() => showInstall = true}
							>
								<i class="bi bi-puzzle me-1"></i> Install Extension
							</button>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Compact List View -->
			{#if viewLayout === 'compact'}
				<div class="list-group">
					{#each filteredBookmarks as bookmark, index (bookmark.id)}
						<div
							class="list-group-item list-group-item-action d-flex justify-content-between align-items-start"
							class:active={selectedIndex === index}
							data-bookmark-index={index}
						>
							<a
								href={bookmark.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-decoration-none flex-grow-1"
							>
								<div class="d-flex align-items-start">
									{#if bookmark.favicon_path}
										<img
											src={bookmark.favicon_path}
											alt=""
											width="16"
											height="16"
											class="me-2 mt-1"
											style="min-width: 16px;"
										/>
									{:else}
										<span class="me-2">🔖</span>
									{/if}
									<div class="flex-grow-1">
										<div class="fw-bold mb-1">{bookmark.title || bookmark.url}</div>
										<small class="text-muted d-block">{bookmark.domain}</small>
										{#if bookmark.description}
											<small class="text-muted d-block mt-1">{bookmark.description}</small>
										{/if}
										<small class="text-muted d-block mt-1">
											Added {new Date(bookmark.created_at).toLocaleDateString()}
										</small>
									</div>
								</div>
							</a>
							<div class="d-flex gap-1">
								<button
									class="btn btn-sm btn-link text-muted opacity-50"
									onclick={() => startEdit(bookmark)}
									aria-label="Edit bookmark"
									onmouseenter={(e) => { e.currentTarget.classList.remove('opacity-50'); }}
									onmouseleave={(e) => { e.currentTarget.classList.add('opacity-50'); }}
								>
									<i class="bi bi-pencil"></i>
								</button>
								<button
									class="btn btn-sm btn-link text-muted opacity-50"
									onclick={() => deleteBookmark(bookmark.id)}
									aria-label="Delete bookmark"
									onmouseenter={(e) => { e.currentTarget.classList.remove('opacity-50'); e.currentTarget.classList.add('text-danger'); }}
									onmouseleave={(e) => { e.currentTarget.classList.add('opacity-50'); e.currentTarget.classList.remove('text-danger'); }}
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
						</div>
					{/each}
				</div>

			<!-- Card View -->
			{:else if viewLayout === 'card'}
				<div class="card-grid">
					{#each filteredBookmarks as bookmark, index (bookmark.id)}
						<div
							class="card shadow-sm position-relative bookmark-card"
							class:border-primary={selectedIndex === index}
							class:shadow={selectedIndex === index}
							data-bookmark-index={index}
						>
							<div class="card-actions position-absolute top-0 end-0 m-2 d-flex gap-1">
								<button
									class="btn btn-sm"
									onclick={(e) => { e.preventDefault(); startEdit(bookmark); }}
									aria-label="Edit bookmark"
								>
									<i class="bi bi-pencil"></i>
								</button>
								<button
									class="btn btn-sm card-delete"
									onclick={(e) => { e.preventDefault(); deleteBookmark(bookmark.id); }}
									aria-label="Delete bookmark"
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
							<div class="card-thumb card-img-top" style:--hue={domainHue(bookmark.domain)}>
								{#if bookmark.og_image_path}
									<img class="thumb-cover" src={bookmark.og_image_path} alt="" loading="lazy" />
								{:else if bookmark.favicon_path}
									<img class="thumb-icon" src={bookmark.favicon_path} alt="" loading="lazy" />
								{:else}
									<span class="thumb-letter">{bookmark.domain.replace(/^www\./, '').charAt(0).toUpperCase()}</span>
								{/if}
							</div>
							<div class="card-body p-3">
								<div class="d-flex align-items-start gap-2 mb-1">
									{#if bookmark.favicon_path}
										<img src={bookmark.favicon_path} alt="" width="16" height="16" class="mt-1 flex-shrink-0" />
									{/if}
									<h6 class="card-title line-clamp-2 mb-0">
										<a
											href={bookmark.url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-decoration-none stretched-link"
										>
											{bookmark.title || bookmark.url}
										</a>
									</h6>
								</div>
								<p class="card-text small text-muted text-truncate mb-2">
									{bookmark.domain} · {new Date(bookmark.created_at).toLocaleDateString()}
								</p>
								{#if bookmark.description}
									<p class="card-text small line-clamp-2 mb-2">{bookmark.description}</p>
								{/if}
								{#if bookmark.tags}
									<div>
										{#each bookmark.tags.split(',').map(t => t.trim()) as tag}
											<button
												type="button"
												class="badge rounded-pill me-1 mb-1"
												class:bg-primary={selectedTags.has(tag)}
												class:text-bg-secondary={!selectedTags.has(tag)}
												onclick={(e) => { e.preventDefault(); toggleTag(tag); }}
												style="cursor: pointer; border: none; position: relative; z-index: 20;"
											>
												{tag}
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

			<!-- Dense View -->
			{:else if viewLayout === 'dense'}
				<div class="list-group list-group-flush">
					{#each filteredBookmarks as bookmark, index (bookmark.id)}
						<a
							href={bookmark.url}
							target="_blank"
							rel="noopener noreferrer"
							class="list-group-item list-group-item-action d-flex align-items-center py-2"
							class:active={selectedIndex === index}
							data-bookmark-index={index}
						>
							{#if bookmark.favicon_path}
								<img
									src={bookmark.favicon_path}
									alt=""
									width="16"
									height="16"
									class="me-2"
									style="min-width: 16px;"
								/>
							{:else}
								<span class="me-2">🔖</span>
							{/if}
							<span class="flex-grow-1">{bookmark.title || bookmark.url}</span>
							<div class="d-flex gap-1">
								<button
									class="btn btn-sm btn-link text-muted opacity-50"
									onclick={(e) => { e.preventDefault(); startEdit(bookmark); }}
									aria-label="Edit bookmark"
									onmouseenter={(e) => { e.currentTarget.classList.remove('opacity-50'); }}
									onmouseleave={(e) => { e.currentTarget.classList.add('opacity-50'); }}
								>
									<i class="bi bi-pencil"></i>
								</button>
								<button
									class="btn btn-sm btn-link text-muted opacity-50"
									onclick={(e) => { e.preventDefault(); deleteBookmark(bookmark.id); }}
									aria-label="Delete bookmark"
									onmouseenter={(e) => { e.currentTarget.classList.remove('opacity-50'); e.currentTarget.classList.add('text-danger'); }}
									onmouseleave={(e) => { e.currentTarget.classList.add('opacity-50'); e.currentTarget.classList.remove('text-danger'); }}
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Help Button -->
<button
	class="btn btn-sm btn-outline-secondary position-fixed bottom-0 end-0 m-3 opacity-50"
	onclick={() => showHelp = !showHelp}
	title="Keyboard shortcuts (?)"
	style="z-index: 1000; border-radius: 50%; width: 32px; height: 32px; padding: 0;"
	onmouseenter={(e) => e.currentTarget.classList.remove('opacity-50')}
	onmouseleave={(e) => e.currentTarget.classList.add('opacity-50')}
>
	?
</button>

<!-- Help Modal -->
{#if showHelp}
	<div class="modal show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
		<div class="modal-dialog modal-dialog-centered">
			<div class="modal-content">
				<div class="modal-header">
					<h5 class="modal-title">Keyboard Shortcuts</h5>
					<button
						type="button"
						class="btn-close"
						onclick={() => showHelp = false}
						aria-label="Close"
					></button>
				</div>
				<div class="modal-body">
					<table class="table table-sm">
						<tbody>
							<tr>
								<td><kbd>j</kbd> or <kbd>↓</kbd></td>
								<td>Select next bookmark</td>
							</tr>
							<tr>
								<td><kbd>k</kbd> or <kbd>↑</kbd></td>
								<td>Select previous bookmark</td>
							</tr>
							<tr>
								<td><kbd>Enter</kbd></td>
								<td>Open selected bookmark</td>
							</tr>
							<tr>
								<td><kbd>e</kbd></td>
								<td>Edit selected bookmark</td>
							</tr>
							<tr>
								<td><kbd>d</kbd></td>
								<td>Delete selected bookmark</td>
							</tr>
							<tr>
								<td><kbd>/</kbd> or <kbd>Ctrl+F</kbd></td>
								<td>Focus search</td>
							</tr>
							<tr>
								<td><kbd>Esc</kbd></td>
								<td>Clear search / Close help</td>
							</tr>
							<tr>
								<td><kbd>?</kbd></td>
								<td>Toggle this help</td>
							</tr>
						</tbody>
					</table>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" onclick={() => showHelp = false}>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Modal -->
{#if editingBookmark}
	<div class="modal show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
		<div class="modal-dialog modal-dialog-centered">
			<div class="modal-content" onpaste={handleEditPaste}>
				<div class="modal-header">
					<h5 class="modal-title">Edit Bookmark</h5>
					<button
						type="button"
						class="btn-close"
						onclick={cancelEdit}
						aria-label="Close"
					></button>
				</div>
				<div class="modal-body">
					<div class="mb-3">
						<span class="form-label d-block">Preview image</span>
						<div class="d-flex gap-3 align-items-start">
							<div class="card-thumb edit-thumb rounded border" style:--hue={domainHue(editingBookmark.domain)}>
								{#if imageBusy}
									<span class="spinner-border text-secondary" role="status" aria-label="Updating image"></span>
								{:else if editingBookmark.og_image_path}
									<img class="thumb-cover" src={editingBookmark.og_image_path} alt="" />
								{:else}
									<span class="small text-body-secondary">No image</span>
								{/if}
							</div>
							<div class="d-grid gap-2 flex-grow-1">
								<button
									type="button"
									class="btn btn-sm btn-outline-secondary"
									onclick={() => changeImage({ source: 'refetch' })}
									disabled={imageBusy || updating}
								>
									<i class="bi bi-arrow-clockwise me-1"></i> Fetch from site
								</button>
								<label class="btn btn-sm btn-outline-secondary mb-0" class:disabled={imageBusy || updating}>
									<i class="bi bi-upload me-1"></i> Upload
									<input
										type="file"
										accept="image/*"
										hidden
										onchange={(e) => { uploadImage(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }}
									/>
								</label>
								{#if editingBookmark.og_image_path}
									<button
										type="button"
										class="btn btn-sm btn-outline-danger"
										onclick={() => changeImage({ source: 'remove' })}
										disabled={imageBusy || updating}
									>
										<i class="bi bi-x-lg me-1"></i> Remove
									</button>
								{/if}
							</div>
						</div>
						<div class="input-group input-group-sm mt-2">
							<input
								type="url"
								class="form-control"
								bind:value={editImageUrl}
								disabled={imageBusy || updating}
								placeholder="Image URL (or paste an image)"
								aria-label="Image URL"
							/>
							<button
								type="button"
								class="btn btn-outline-secondary"
								onclick={() => changeImage({ source: 'url', image_url: editImageUrl.trim() })}
								disabled={imageBusy || updating || !editImageUrl.trim()}
							>
								Use
							</button>
						</div>
						{#if imageError}
							<div class="form-text text-danger">{imageError}</div>
						{/if}
					</div>
					<div class="mb-3">
						<label for="edit-url" class="form-label">URL</label>
						<input
							type="url"
							class="form-control"
							id="edit-url"
							bind:value={editUrl}
							disabled={updating}
							placeholder="https://example.com"
						/>
					</div>
					<div class="mb-3">
						<label for="edit-title" class="form-label">Title</label>
						<input
							type="text"
							class="form-control"
							id="edit-title"
							bind:value={editTitle}
							disabled={updating}
							placeholder="Custom title for this bookmark"
						/>
					</div>
					<div class="mb-3">
						<label for="edit-description" class="form-label">Description</label>
						<textarea
							class="form-control"
							id="edit-description"
							bind:value={editDescription}
							disabled={updating}
							placeholder="Enter a custom description or leave blank to use metadata"
							rows="3"
						></textarea>
					</div>
					<div class="mb-3">
						<label for="edit-tags" class="form-label">Tags (comma-separated)</label>
						<div class="position-relative">
							<input
								type="text"
								class="form-control"
								id="edit-tags"
								bind:value={editTags}
								bind:this={editTagInputRef}
								disabled={updating}
								placeholder="tag1, tag2, tag3"
								oninput={handleEditTagInput}
								onkeydown={handleTagKeydown}
								onfocus={handleEditTagInput}
								onblur={() => setTimeout(() => showEditAutocomplete = false, 200)}
							/>
							{#if showEditAutocomplete && editAutocompleteSuggestions().length > 0}
								<div class="position-absolute w-100 shadow-sm" style="top: 100%; left: 0; z-index: 1000; max-height: 200px; overflow-y: auto;">
									<div class="list-group">
										{#each editAutocompleteSuggestions() as suggestion, index}
											<button
												type="button"
												class="list-group-item list-group-item-action"
												class:active={index === editAutocompleteIndex}
												onclick={() => insertTag(suggestion)}
												style="cursor: pointer;"
											>
												{suggestion}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="modal-footer">
					<button
						type="button"
						class="btn btn-secondary"
						onclick={cancelEdit}
						disabled={updating}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn btn-primary"
						onclick={updateBookmark}
						disabled={updating || !editUrl.trim()}
					>
						{#if updating}
							<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
							Updating...
						{:else}
							💾 Save Changes
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Extension Installation Modal -->
{#if showInstall}
	<div class="modal show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
		<div class="modal-dialog modal-dialog-centered modal-lg">
			<div class="modal-content">
				<div class="modal-header">
					<h5 class="modal-title"><i class="bi bi-puzzle me-2"></i>Install the Chrome Extension</h5>
					<button
						type="button"
						class="btn-close"
						onclick={() => showInstall = false}
						aria-label="Close"
					></button>
				</div>
				<div class="modal-body">
					<p>
						The extension saves the page you're on with one click. It also takes a screenshot, so
						private and local pages get a preview image too.
					</p>

					<ol class="ps-3">
						<li class="mb-3">
							<a
								href="/api/extension?origin={encodeURIComponent(appOrigin)}"
								class="btn btn-sm btn-primary"
								download="quickmark-extension.zip"
							>
								<i class="bi bi-download me-1"></i> Download extension
							</a>
							<div class="small text-body-secondary mt-1">
								Unzip it and keep the <code>quickmark-extension</code> folder somewhere permanent; Chrome loads the extension from it.
							</div>
						</li>
						<li class="mb-3">
							Open <code>chrome://extensions</code>
							<button
								type="button"
								class="btn btn-sm btn-link p-0 align-baseline"
								onclick={() => copyText('chrome://extensions', 'extensions')}
							>
								{copied === 'extensions' ? 'copied' : 'copy'}
							</button>
							in a new tab and switch on <strong>Developer mode</strong> (top right).
						</li>
						<li class="mb-3">Click <strong>Load unpacked</strong> and choose the <code>quickmark-extension</code> folder.</li>
						<li class="mb-3">
							Click the puzzle-piece icon in Chrome's toolbar and pin <strong>Save to QuickMark</strong>.
							Click it on any page to save that page.
						</li>
					</ol>

					<p class="small text-body-secondary">
						To update it later, download it again, replace the folder, and press the reload arrow on the
						extension's card in <code>chrome://extensions</code>.
					</p>

					<details>
						<summary class="text-muted" style="cursor: pointer;">Another browser? Use the bookmarklet instead</summary>
						<div class="mt-3 small">
							<p class="mb-2">
								The bookmarklet sends the URL and title, and QuickMark looks up the preview image itself.
								It can't take screenshots, so private and local pages won't get an image.
							</p>
							<a
								href="/api/bookmarklet?origin={encodeURIComponent(appOrigin)}"
								class="btn btn-sm btn-outline-secondary mb-2"
								download="quickmark-bookmarklet.html"
							>
								<i class="bi bi-download me-1"></i> Bookmark file to import
							</a>
							<p class="mb-2">Or create a bookmark named "Save to QuickMark" with this as its URL:</p>
							<div class="input-group input-group-sm">
								<input
									type="text"
									class="form-control font-monospace bg-dark text-light"
									value={bookmarkletCode}
									readonly
									aria-label="Bookmarklet code"
								/>
								<button
									class="btn btn-outline-secondary"
									type="button"
									onclick={() => copyText(bookmarkletCode, 'bookmarklet')}
									aria-label="Copy bookmarklet code"
								>
									<i class="bi {copied === 'bookmarklet' ? 'bi-check-lg' : 'bi-clipboard'}"></i>
								</button>
							</div>
						</div>
					</details>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" onclick={() => showInstall = false}>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.card-grid {
		display: grid;
		/* As many ~280px columns as fit: one on phones, up to six on wide screens */
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 1rem;
	}

	.card-thumb {
		aspect-ratio: 16 / 9;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: hsl(var(--hue, 210) 35% 88%);
	}

	:global([data-bs-theme='dark']) .card-thumb {
		background: hsl(var(--hue, 210) 25% 20%);
	}

	.thumb-cover {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-icon {
		width: 56px;
		height: 56px;
		padding: 8px;
		object-fit: contain;
		border-radius: 12px;
		background: #fff;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
	}

	.thumb-letter {
		font-size: 2.75rem;
		font-weight: 600;
		color: hsl(var(--hue, 210) 40% 45%);
	}

	:global([data-bs-theme='dark']) .thumb-letter {
		color: hsl(var(--hue, 210) 45% 70%);
	}

	.edit-thumb {
		width: 160px;
		flex-shrink: 0;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-actions {
		z-index: 10;
		transition: opacity 0.15s;
	}

	.card-actions .btn {
		--bs-btn-padding-y: 0.125rem;
		--bs-btn-padding-x: 0.375rem;
		background: rgba(var(--bs-body-bg-rgb), 0.85);
		color: var(--bs-secondary-color);
	}

	.card-actions .card-delete:hover {
		color: var(--bs-danger);
	}

	/* On devices with a mouse, only show edit/delete when hovering the card */
	@media (hover: hover) {
		.card-actions {
			opacity: 0;
		}

		.bookmark-card:hover .card-actions,
		.card-actions:focus-within {
			opacity: 1;
		}
	}
</style>
