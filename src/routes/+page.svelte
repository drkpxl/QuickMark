<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let url = $state('');
	let tags = $state('');
	let searchQuery = $state('');
	let saving = $state(false);
	let message = $state('');
	let viewLayout = $state<'compact' | 'card' | 'dense'>('compact');
	let selectedIndex = $state(-1);
	let showHelp = $state(false);
	let selectedTags = $state<Set<string>>(new Set());
	let editingBookmark = $state<typeof data.bookmarks[0] | null>(null);
	let editUrl = $state('');
	let editTitle = $state('');
	let editTags = $state('');
	let updating = $state(false);

	onMount(() => {
		// Load view preference from localStorage
		const savedView = localStorage.getItem('viewLayout') as 'compact' | 'card' | 'dense' | null;
		if (savedView) {
			viewLayout = savedView;
		}
	});

	function scrollToBookmark(index: number) {
		const element = document.querySelector(`[data-bookmark-index="${index}"]`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
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

	async function saveBookmark() {
		if (!url.trim()) return;

		saving = true;
		message = '';

		try {
			const response = await fetch('/api/bookmark', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: url.trim(), tags: tags.trim() || null })
			});

			if (response.ok) {
				message = 'Bookmark saved!';
				url = '';
				tags = '';
				// Reload bookmarks
				window.location.reload();
			} else {
				const error = await response.json();
				message = error.message || 'Failed to save bookmark';
			}
		} catch (err) {
			message = 'Error saving bookmark';
			console.error(err);
		} finally {
			saving = false;
			setTimeout(() => message = '', 3000);
		}
	}

	function startEdit(bookmark: typeof data.bookmarks[0]) {
		editingBookmark = bookmark;
		editUrl = bookmark.url;
		editTitle = bookmark.title || '';
		editTags = bookmark.tags || '';
	}

	function cancelEdit() {
		editingBookmark = null;
		editUrl = '';
		editTitle = '';
		editTags = '';
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
					tags: editTags.trim() || null
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
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				saveBookmark();
			}
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

	function toggleTag(tag: string) {
		const newSelectedTags = new Set(selectedTags);
		if (newSelectedTags.has(tag)) {
			newSelectedTags.delete(tag);
		} else {
			newSelectedTags.add(tag);
		}
		selectedTags = newSelectedTags;
	}

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

<!-- Add Bookmark -->
<div class="row mb-3">
	<div class="col-12">
		<div class="card">
			<div class="card-body">
				<div class="row g-2">
					<div class="col-12 col-md-7">
						<input
							type="url"
							class="form-control"
							placeholder="Enter URL to bookmark (Ctrl+Enter to save)"
							bind:value={url}
							disabled={saving}
						/>
					</div>
					<div class="col-12 col-md-3">
						<input
							type="text"
							class="form-control"
							placeholder="Tags (comma-separated)"
							bind:value={tags}
							disabled={saving}
						/>
					</div>
					<div class="col-12 col-md-2">
						<button
							class="btn btn-primary w-100"
							onclick={saveBookmark}
							disabled={saving || !url.trim()}
						>
							{#if saving}
								<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
								Saving...
							{:else}
								💾 Save
							{/if}
						</button>
					</div>
				</div>
				{#if message}
					<div class="alert alert-{message.includes('Error') || message.includes('Failed') ? 'danger' : 'success'} mt-2 mb-0" role="alert">
						{message}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

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
							<p class="mb-0">Add your first bookmark using the input above!</p>
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
				<div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
					{#each filteredBookmarks as bookmark, index (bookmark.id)}
						<div class="col" data-bookmark-index={index}>
							<div
								class="card h-100 shadow-sm position-relative"
								class:border-primary={selectedIndex === index}
								class:shadow={selectedIndex === index}
							>
								<div class="position-absolute top-0 end-0 m-2 d-flex gap-1" style="z-index: 10;">
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
								<div style="height: 200px; background-color: var(--bs-secondary-bg); display: flex; align-items: center; justify-content: center;">
									{#if bookmark.og_image_path}
										<img
											src={bookmark.og_image_path}
											class="card-img-top"
											alt={bookmark.title || 'Bookmark'}
											style="max-height: 200px; max-width: 100%; width: auto; height: auto; object-fit: contain;"
										/>
									{:else}
										<span class="text-muted" style="font-size: 3rem; opacity: 0.3;">🔖</span>
									{/if}
								</div>
								<div class="card-body">
									<div class="d-flex align-items-start mb-2">
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
										<h5 class="card-title mb-0 flex-grow-1">
											<a
												href={bookmark.url}
												target="_blank"
												rel="noopener noreferrer"
												class="text-decoration-none stretched-link"
											>
												{bookmark.title || bookmark.url}
											</a>
										</h5>
									</div>
									<p class="card-text">
										<small class="text-muted">{bookmark.domain}</small>
									</p>
									{#if bookmark.description}
										<p class="card-text small">{bookmark.description}</p>
									{/if}
									{#if bookmark.tags}
										<div class="mb-2">
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
									<p class="card-text">
										<small class="text-muted">
											Added {new Date(bookmark.created_at).toLocaleDateString()}
										</small>
									</p>
								</div>
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
								<td><kbd>Ctrl+Enter</kbd></td>
								<td>Save bookmark (in URL field)</td>
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
			<div class="modal-content">
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
						<label for="edit-tags" class="form-label">Tags (comma-separated)</label>
						<input
							type="text"
							class="form-control"
							id="edit-tags"
							bind:value={editTags}
							disabled={updating}
							placeholder="tag1, tag2, tag3"
						/>
					</div>
					<small class="text-muted">
						Note: If the URL is changed, metadata (description, favicon, image) will be refetched. The title you specify will be preserved.
					</small>
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
