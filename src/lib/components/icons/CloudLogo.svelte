<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { CLOUD_ICONS } from '$lib/cloudIcons';
  import { branding } from '$lib/branding.svelte';

  let {
    size = 18,
    stroke = 1.5,
  }: { size?: number; stroke?: number } = $props();

  const Current = $derived(CLOUD_ICONS[branding.icon] ?? CLOUD_ICONS.cloud);
</script>

<Current {size} {stroke} />
