<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import NonTablerOnes, { type NonTablerVariant } from './NonTablerOnes.svelte';
  let { size = 24, stroke = 1.5, variant }: { size?: number; stroke?: number; variant?: NonTablerVariant } = $props();
</script>

<NonTablerOnes name="Roblox" {size} {stroke} {variant} />
