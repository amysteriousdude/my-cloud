<script lang="ts">
  import { onMount } from 'svelte';
  let { entry, onready, children }: { entry: any; onready: (urls?: any) => void; children?: any } = $props();
  onMount(() => { onready(); });
</script>
{@render children?.()}
