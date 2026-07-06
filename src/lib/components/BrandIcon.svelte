<script lang="ts">
  let { brand, size = 16, class: className = '' }: { brand: string; size?: number; class?: string } = $props();

  const SVG_BASE = 'https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons';

  const SLUG_MAP: Record<string, string> = {
    'google': 'google',
    'openai': 'openai-chatgpt',
    'meta': 'meta',
    'nvidia': 'nvidia',
    'mistral': 'mistral',
    'mistral ai': 'mistral',
    'alibaba cloud': 'alibaba',
    'qwen': 'alibaba',
    'perplexity': 'perplexity',
    'perplexity ai': 'perplexity',
    'xai': 'xai',
    'moonshot': 'moonshot',
    'moonshot ai': 'moonshot',
    'kimi': 'moonshot',
    'zhipu': 'zhipu',
    'zhipu ai': 'zhipu',
    'glm': 'zhipu',
    'minimax': 'minimax',
    'ollama': 'ollama',
    'stepfun': 'stepfun',
    'stepfun-ai': 'stepfun',
    'databricks': 'databricks',
    'pollinations': 'pollinations',
    'groq': 'groq',
    'deepseek': 'deepseek',
    'deepseek-ai': 'deepseek',
    'ibm': 'ibm',
    'microsoft': 'microsoft',
    'amazon': 'amazon',
    'snowflake': 'snowflake',
    'bytedance': 'bytedance',
    'writer': 'writer',
    'zyphra': 'zyphra',
    'bigcode': 'bigcode',
    'baai': 'baai',
    '01-ai': '01-ai',
    'adept': 'adept',
    'ai21labs': 'ai21labs',
    'aisingapore': 'aisingapore',
    'canopy labs': 'canopylabs',
    'sdaia': 'sdaia',
    'nv-mistralai': 'mistral',
    'midijourney': 'midjourney',
  };

  const FALLBACK_COLORS: Record<string, string> = {
    'meta': '#0668E1',
    'openai': '#10A37F',
    'google': '#4285F4',
    'nvidia': '#76B900',
    'mistral ai': '#FF7000',
    'deepseek': '#4D6BFE',
    'alibaba cloud': '#FF6A00',
    'minimax': '#EC4899',
    'moonshot ai': '#6366F1',
    'xai': '#1DA1F2',
    'zhipu ai': '#7C3AED',
    'ibm': '#0F62FE',
    'microsoft': '#00A4EF',
    'databricks': '#FF3621',
    'perplexity ai': '#20B8CD',
    'amazon': '#FF9900',
    'snowflake': '#29B5E8',
    'stepfun': '#8B5CF6',
    'groq': '#F97316',
    'ollama': '#14B8A6',
    'pollinations': '#A855F7',
    'bytedance': '#FE2C55',
    'writer': '#000000',
    'bigcode': '#10B981',
    '01-ai': '#6366F1',
  };

  let resolved = $derived((() => {
    const key = brand.toLowerCase();
    const slug = SLUG_MAP[key] ?? key;
    const hasSvg = SLUG_MAP.hasOwnProperty(key) || !!SLUG_MAP[key];
    return { slug, hasSvg };
  })());
</script>

{#if resolved.hasSvg}
  <img
    src="{SVG_BASE}/{resolved.slug}/mono.svg"
    alt={brand}
    width={size}
    height={size}
    class="brand-icon {className}"
    style="filter: brightness(0) invert(1); opacity: 0.9;"
    onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
  />
{:else}
  <span
    class="brand-dot {className}"
    style="width:{size}px;height:{size}px;background:{FALLBACK_COLORS[brand.toLowerCase()] ?? '#666'};"
    title={brand}
  ></span>
{/if}

<style>
  .brand-icon {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }
  .brand-dot {
    display: inline-block;
    border-radius: 50%;
    flex-shrink: 0;
    vertical-align: middle;
  }
</style>
