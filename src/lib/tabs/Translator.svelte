<script lang="ts">
  import {
    IconLanguage, IconLoader2, IconArrowRight, IconCopy,
    IconVolume, IconX, IconRefresh, IconStar, IconStarFilled,
  } from '@tabler/icons-svelte';

  let sourceText = $state('');
  let translatedText = $state('');
  let sourceLang = $state('auto');
  let targetLang = $state('es');
  let loading = $state(false);
  let history: { from: string; to: string; src: string; result: string; time: string }[] = $state([]);
  let favorites = $state<Set<string>>(new Set());

  const LANGUAGES = [
    { code: 'auto', label: 'Auto Detect' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ru', label: 'Russian' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ar', label: 'Arabic' },
    { code: 'hi', label: 'Hindi' },
    { code: 'tr', label: 'Turkish' },
    { code: 'nl', label: 'Dutch' },
    { code: 'sv', label: 'Swedish' },
    { code: 'pl', label: 'Polish' },
    { code: 'uk', label: 'Ukrainian' },
    { code: 'vi', label: 'Vietnamese' },
    { code: 'th', label: 'Thai' },
    { code: 'id', label: 'Indonesian' },
  ];

  function fetchTimeout(url: string, opts?: RequestInit, ms = 8000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
  }

  async function translate() {
    if (!sourceText.trim()) return;
    loading = true;
    translatedText = '';

    try {
      const res = await fetchTimeout(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText.trim())}&langpair=${sourceLang}|${targetLang}`
      );
      if (!res.ok) throw new Error('Translation failed');
      const data = await res.json();
      translatedText = data.responseData?.translatedText || '';

      if (sourceLang === 'auto' && data.responseData?.detectedLanguage) {
        sourceLang = data.responseData.detectedLanguage;
      }

      history = [{
        from: sourceLang, to: targetLang,
        src: sourceText.trim(), result: translatedText,
        time: new Date().toISOString(),
      }, ...history].slice(0, 20);
    } catch (e: any) {
      translatedText = `Error: ${e.message}`;
    }
    loading = false;
  }

  function swapLanguages() {
    if (sourceLang === 'auto') return;
    [sourceLang, targetLang] = [targetLang, sourceLang];
    [sourceText, translatedText] = [translatedText, sourceText];
  }

  function copyResult() {
    if (translatedText) navigator.clipboard.writeText(translatedText);
  }

  async function speak(text: string, lang: string) {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'auto' ? 'en' : lang;
    speechSynthesis.speak(u);
  }

  function toggleFav(key: string) {
    const f = new Set(favorites);
    if (f.has(key)) f.delete(key); else f.add(key);
    favorites = f;
  }

  let debounce: ReturnType<typeof setTimeout>;
  function autoTranslate() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { if (sourceText.trim()) translate(); }, 600);
  }
</script>

<div class="tr-root">
  <div class="tr-header">
    <div class="tr-title"><IconLanguage size={20} stroke={1.8}/><span>Translator</span></div>
    <p class="tr-sub">21 languages via MyMemory API</p>
  </div>

  <div class="tr-lang-bar">
    <select class="tr-select" bind:value={sourceLang}>
      {#each LANGUAGES as l}<option value={l.code}>{l.label}</option>{/each}
    </select>
    <button class="tr-swap" onclick={swapLanguages} title="Swap languages">⇄</button>
    <select class="tr-select" bind:value={targetLang}>
      {#each LANGUAGES.filter(l => l.code !== 'auto') as l}<option value={l.code}>{l.label}</option>{/each}
    </select>
  </div>

  <div class="tr-panels">
    <div class="tr-panel">
      <textarea class="tr-textarea" bind:value={sourceText} oninput={autoTranslate}
        placeholder="Type or paste text..." spellcheck="false"></textarea>
      <div class="tr-panel-actions">
        <span class="tr-charcount">{sourceText.length}</span>
        {#if sourceText}
          <button class="tr-icon-btn" onclick={() => speak(sourceText, sourceLang)} title="Listen"><IconVolume size={14}/></button>
          <button class="tr-icon-btn" onclick={() => { sourceText = ''; translatedText = ''; }} title="Clear"><IconX size={14}/></button>
        {/if}
      </div>
    </div>

    <div class="tr-divider">
      <IconArrowRight size={16}/>
    </div>

    <div class="tr-panel tr-panel-out">
      {#if loading}
        <div class="tr-loading"><IconLoader2 size={20} class="spin"/><span>Translating...</span></div>
      {:else}
        <div class="tr-output">{translatedText || 'Translation will appear here...'}</div>
      {/if}
      <div class="tr-panel-actions">
        {#if translatedText}
          <button class="tr-icon-btn" onclick={copyResult} title="Copy"><IconCopy size={14}/></button>
          <button class="tr-icon-btn" onclick={() => speak(translatedText, targetLang)} title="Listen"><IconVolume size={14}/></button>
        {/if}
      </div>
    </div>
  </div>

  <button class="tr-translate-btn" onclick={translate} disabled={loading || !sourceText.trim()}>
    {#if loading}<IconLoader2 size={16} class="spin"/>{:else}Translate{/if}
  </button>

  {#if history.length > 0}
    <div class="tr-section">
      <div class="tr-section-title">Recent Translations</div>
      {#each history.slice(0, 5) as h}
        <div class="tr-history-item">
          <div class="tr-history-langs">{h.from} → {h.to}</div>
          <div class="tr-history-src">{h.src}</div>
          <div class="tr-history-result">{h.result}</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tr-root{padding:24px 32px;max-width:800px;margin:0 auto}
  .tr-header{margin-bottom:16px}
  .tr-title{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;color:var(--text-1)}
  .tr-sub{color:var(--text-3);font-size:13px;margin-top:4px}

  .tr-lang-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px}
  .tr-select{flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);font-size:13px;font-family:'Geist',sans-serif;cursor:pointer}
  .tr-select:focus{outline:none;border-color:var(--accent)}
  .tr-swap{background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:.13s;flex-shrink:0}
  .tr-swap:hover{border-color:var(--accent);color:var(--accent)}

  .tr-panels{display:flex;gap:0;margin-bottom:12px}
  .tr-panel{flex:1;display:flex;flex-direction:column;min-height:180px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;overflow:hidden}
  .tr-panel:first-child{border-radius:10px 0 0 10px;border-right:none}
  .tr-panel:last-child,.tr-panel-out{border-radius:0 10px 10px 0}
  .tr-divider{display:flex;align-items:center;justify-content:center;width:32px;flex-shrink:0;color:var(--text-3)}
  .tr-textarea{flex:1;background:none;border:none;color:var(--text-1);padding:12px;font-size:14px;font-family:'Geist',sans-serif;resize:none;outline:none;line-height:1.6}
  .tr-textarea::placeholder{color:var(--text-3)}
  .tr-output{flex:1;padding:12px;font-size:14px;color:var(--text-1);line-height:1.6;white-space:pre-wrap}
  .tr-loading{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text-3);font-size:13px}

  .tr-panel-actions{display:flex;align-items:center;gap:4px;padding:6px 8px;border-top:1px solid var(--border)}
  .tr-charcount{font-size:10px;color:var(--text-3);font-family:'Geist Mono',monospace;margin-right:auto}
  .tr-icon-btn{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:4px;display:flex;transition:.1s}
  .tr-icon-btn:hover{color:var(--text-1);background:var(--hover)}

  .tr-translate-btn{width:100%;padding:10px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;font-family:'Geist',sans-serif;cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center;gap:6px}
  .tr-translate-btn:hover{opacity:.9}
  .tr-translate-btn:disabled{opacity:.5;cursor:not-allowed}

  .tr-section{margin-top:20px}
  .tr-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);margin-bottom:8px}
  .tr-history-item{padding:8px 10px;border-radius:6px;background:var(--bg-3);border:1px solid var(--border);margin-bottom:6px}
  .tr-history-langs{font-size:10px;color:var(--accent);font-weight:600;margin-bottom:3px}
  .tr-history-src{font-size:12px;color:var(--text-2);margin-bottom:2px}
  .tr-history-result{font-size:12px;color:var(--text-1);font-weight:500}

  :global(.spin){animation:spin 1s linear infinite}
  @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

  @media(max-width:600px){
    .tr-root{padding:16px}
    .tr-panels{flex-direction:column}
    .tr-panel:first-child{border-radius:10px 10px 0 0;border-right:1px solid var(--border);border-bottom:none}
    .tr-panel-out{border-radius:0 0 10px 10px}
    .tr-divider{width:auto;height:24px;transform:rotate(90deg)}
  }
</style>
