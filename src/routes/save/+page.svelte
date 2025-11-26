<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let url = $state('');
	let title = $state('');
	let description = $state('');
	let imageUrl = $state('');
	let tags = $state('');
	let saving = $state(false);
	let message = $state('');
	let success = $state(false);
	let allTags = $state<string[]>([]);

	// Autocomplete state
	let showAutocomplete = $state(false);
	let autocompleteIndex = $state(-1);
	let tagInputRef = $state<HTMLInputElement | null>(null);

	onMount(async () => {
		// Get params from URL
		const params = $page.url.searchParams;
		url = params.get('url') || '';
		title = params.get('title') || '';
		description = params.get('description') || '';
		imageUrl = params.get('image_url') || '';

		// Fetch existing tags for autocomplete
		try {
			const response = await fetch('/api/tags');
			if (response.ok) {
				allTags = await response.json();
			}
		} catch (e) {
			console.error('Failed to fetch tags:', e);
		}
	});

	function getCurrentTag(value: string, cursorPos: number) {
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

	let autocompleteSuggestions = $derived(() => {
		if (!tagInputRef || !showAutocomplete) return [];
		const cursorPos = tagInputRef.selectionStart || 0;
		const { currentTag } = getCurrentTag(tags, cursorPos);

		if (currentTag.length === 0) return [];

		const existingTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
		return allTags
			.filter(tag =>
				tag.toLowerCase().startsWith(currentTag.toLowerCase()) &&
				!existingTags.includes(tag)
			)
			.slice(0, 10);
	});

	function handleTagInput() {
		if (!tagInputRef) return;
		const cursorPos = tagInputRef.selectionStart || 0;
		const { currentTag } = getCurrentTag(tags, cursorPos);
		showAutocomplete = currentTag.length > 0;
		autocompleteIndex = -1;
	}

	function insertTag(tag: string) {
		if (!tagInputRef) return;
		const cursorPos = tagInputRef.selectionStart || 0;
		const { prefix, suffix } = getCurrentTag(tags, cursorPos);
		const newValue = prefix + (prefix && !prefix.endsWith(' ') ? ' ' : '') + tag + ', ' + suffix;
		tags = newValue;
		showAutocomplete = false;
		autocompleteIndex = -1;
		setTimeout(() => {
			if (tagInputRef) {
				const newCursorPos = prefix.length + (prefix && !prefix.endsWith(' ') ? 1 : 0) + tag.length + 2;
				tagInputRef.focus();
				tagInputRef.setSelectionRange(newCursorPos, newCursorPos);
			}
		}, 0);
	}

	function handleTagKeydown(e: KeyboardEvent) {
		const suggestions = autocompleteSuggestions();
		if (!showAutocomplete || suggestions.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			autocompleteIndex = Math.min(autocompleteIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
		} else if (e.key === 'Enter' && autocompleteIndex >= 0) {
			e.preventDefault();
			insertTag(suggestions[autocompleteIndex]);
		} else if (e.key === 'Escape') {
			showAutocomplete = false;
			autocompleteIndex = -1;
		}
	}

	async function saveBookmark() {
		if (!url.trim()) {
			message = 'URL is required';
			return;
		}

		saving = true;
		message = '';

		try {
			const response = await fetch('/api/bookmark', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: url.trim(),
					title: title.trim() || null,
					description: description.trim() || null,
					image_url: imageUrl.trim() || null,
					tags: tags.trim() || null
				})
			});

			if (response.ok) {
				message = 'Bookmark saved!';
				success = true;
				// Close window after short delay
				setTimeout(() => window.close(), 1500);
			} else {
				const error = await response.json();
				message = error.message || 'Failed to save bookmark';
			}
		} catch (err) {
			message = 'Error saving bookmark';
			console.error(err);
		} finally {
			saving = false;
		}
	}

	function cancel() {
		window.close();
	}
</script>

<svelte:head>
	<title>Save to QuickMark</title>
</svelte:head>

<div class="container-fluid py-3">
	<div class="d-flex align-items-center mb-3">
		<i class="bi bi-bookmark-plus fs-4 me-2 text-primary"></i>
		<h5 class="mb-0">Save to QuickMark</h5>
	</div>

	{#if message}
		<div class="alert alert-{success ? 'success' : 'danger'} py-2" role="alert">
			{#if success}
				<i class="bi bi-check-circle me-1"></i>
			{:else}
				<i class="bi bi-exclamation-circle me-1"></i>
			{/if}
			{message}
		</div>
	{/if}

	{#if !success}
		<!-- Preview -->
		{#if imageUrl || title}
			<div class="card mb-3 bg-body-secondary">
				<div class="row g-0">
					{#if imageUrl}
						<div class="col-4">
							<img
								src={imageUrl}
								class="img-fluid rounded-start"
								alt=""
								style="max-height: 100px; width: 100%; object-fit: cover;"
								onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
							/>
						</div>
					{/if}
					<div class={imageUrl ? 'col-8' : 'col-12'}>
						<div class="card-body py-2">
							<p class="card-text small fw-bold mb-1 text-truncate">{title || 'Untitled'}</p>
							<p class="card-text small text-muted text-truncate mb-0">{url}</p>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<div class="mb-3">
			<label for="title" class="form-label small">Title</label>
			<input
				type="text"
				class="form-control form-control-sm"
				id="title"
				bind:value={title}
				disabled={saving}
				placeholder="Page title"
			/>
		</div>

		<div class="mb-3">
			<label for="description" class="form-label small">Description</label>
			<textarea
				class="form-control form-control-sm"
				id="description"
				bind:value={description}
				disabled={saving}
				placeholder="Page description"
				rows="2"
			></textarea>
		</div>

		<div class="mb-3">
			<label for="tags" class="form-label small">Tags (comma-separated)</label>
			<div class="position-relative">
				<input
					type="text"
					class="form-control form-control-sm"
					id="tags"
					bind:value={tags}
					bind:this={tagInputRef}
					disabled={saving}
					placeholder="design, inspiration, tutorial"
					oninput={handleTagInput}
					onkeydown={handleTagKeydown}
					onfocus={handleTagInput}
					onblur={() => setTimeout(() => showAutocomplete = false, 200)}
				/>
				{#if showAutocomplete && autocompleteSuggestions().length > 0}
					<div class="position-absolute w-100 shadow-sm" style="top: 100%; left: 0; z-index: 1000; max-height: 150px; overflow-y: auto;">
						<div class="list-group list-group-flush">
							{#each autocompleteSuggestions() as suggestion, index}
								<button
									type="button"
									class="list-group-item list-group-item-action py-1 small"
									class:active={index === autocompleteIndex}
									onclick={() => insertTag(suggestion)}
								>
									{suggestion}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="d-flex gap-2">
			<button
				type="button"
				class="btn btn-secondary btn-sm flex-fill"
				onclick={cancel}
				disabled={saving}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn btn-primary btn-sm flex-fill"
				onclick={saveBookmark}
				disabled={saving || !url.trim()}
			>
				{#if saving}
					<span class="spinner-border spinner-border-sm me-1" role="status"></span>
					Saving...
				{:else}
					<i class="bi bi-bookmark-check me-1"></i> Save
				{/if}
			</button>
		</div>
	{:else}
		<div class="text-center py-4">
			<i class="bi bi-check-circle-fill text-success fs-1"></i>
			<p class="mt-2 mb-0">Window will close automatically...</p>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		min-height: auto;
	}
</style>
