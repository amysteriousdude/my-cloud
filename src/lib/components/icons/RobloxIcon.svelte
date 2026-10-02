<script lang="ts">
  let { size = 24, stroke = 1.5 }: { size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  stroke="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <path
    fill-rule="evenodd"
    d="M5.51 2.73 21.27 5.51 18.49 21.27 2.73 18.49 5.51 2.73ZM9.59 8.56 15.44 9.59 14.41 15.44 8.56 14.41 9.59 8.56Z"
  />
</svg>
