<script lang="ts">
	import { onMount } from 'svelte';
	import 'bootstrap/dist/css/bootstrap.min.css';
	import 'bootstrap-icons/font/bootstrap-icons.css';

	let { children } = $props();

	let theme = $state('dark');

	onMount(() => {
		// Load theme from localStorage
		const savedTheme = localStorage.getItem('theme') || 'dark';
		theme = savedTheme;
		document.documentElement.setAttribute('data-bs-theme', theme);
	});

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-bs-theme', theme);
		localStorage.setItem('theme', theme);
	}
</script>

<nav class="navbar bg-body-tertiary border-bottom">
	<div class="container-fluid">
		<span class="navbar-brand mb-0 h1">🔖 QuickMark</span>
		<button class="btn btn-sm btn-outline-secondary" onclick={toggleTheme} aria-label="Toggle theme">
			{#if theme === 'dark'}
				☀️ Light
			{:else}
				🌙 Dark
			{/if}
		</button>
	</div>
</nav>
<div class="container-fluid py-4">
	{@render children()}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
