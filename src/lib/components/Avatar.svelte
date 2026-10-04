<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { branding } from '$lib/branding.svelte';

  let {
    name,
  }: { name: string } = $props();
</script>

{#if branding.pfp}
  <img class="av-img" src={branding.pfp} alt="" />
{:else}
  {(name || '?')[0].toUpperCase()}
{/if}

<style>
  .av-img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    border-radius: inherit; font-size: 0;
  }
</style>
