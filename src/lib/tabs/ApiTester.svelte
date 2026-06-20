<script lang="ts">
  import {
    IconSend, IconLoader2, IconCopy, IconChevronDown, IconChevronUp,
    IconPlus, IconTrash, IconClock, IconCheck, IconX,
  } from '@tabler/icons-svelte';

  let method = $state('GET');
  let url = $state('');
  let headers = $state<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  let body = $state('');
  let loading = $state(false);
  let response: {
    status?: number; statusText?: string; time?: number;
    size?: string; headers?: Record<string, string>; body?: string; error?: string;
  } | null = $state(null);
  let showHeaders = $state(false);
  let showResponseHeaders = $state(false);
  let history: { method: string; url: string; status: number; time: string }[] = $state([]);
  let bodyMode = $state<'json' | 'text' | 'none'>('json');

  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  const METHOD_COLORS: Record<string, string> = {
    GET: '#4ade80', POST: '#60a5fa', PUT: '#f59e0b', PATCH: '#c084fc',
    DELETE: '#f87171', HEAD: '#94a3b8', OPTIONS: '#94a3b8',
  };

  function addHeader() { headers = [...headers, { key: '', value: '' }]; }
  function removeHeader(i: number) { headers = headers.filter((_, idx) => idx !== i); }

  async function send() {
    if (!url.trim()) return;
    loading = true;
    response = null;
    const start = performance.now();

    try {
      const h: Record<string, string> = {};
      for (const hdr of headers) {
        if (hdr.key.trim()) h[hdr.key.trim()] = hdr.value;
      }
      if (bodyMode === 'json' && body.trim() && !h['Content-Type']) {
        h['Content-Type'] = 'application/json';
      }

      const opts: RequestInit = { method, headers: h };
      if (!['GET', 'HEAD'].includes(method) && bodyMode !== 'none' && body.trim()) {
        opts.body = body;
      }

      const res = await fetch(url, opts);
      const elapsed = Math.round(performance.now() - start);
      const text = await res.text();

      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });

      const size = new Blob([text]).size;
      const fmtSize = size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(2)} MB`;

      response = {
        status: res.status, statusText: res.statusText,
        time: elapsed, size: fmtSize, headers: respHeaders, body: text,
      };

      history = [{ method, url: url.trim(), status: res.status, time: new Date().toLocaleTimeString() }, ...history].slice(0, 15);
    } catch (e: any) {
      response = { error: e.message || 'Request failed', time: Math.round(performance.now() - start) };
    }
    loading = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
  }

  function formatBody() {
    if (bodyMode !== 'json' || !body.trim()) return;
    try { body = JSON.stringify(JSON.parse(body), null, 2); } catch {}
  }

  function statusColor(s?: number) {
    if (!s) return 'var(--text-3)';
    if (s < 300) return 'var(--green)';
    if (s < 400) return 'var(--accent)';
    if (s < 500) return '#f59e0b';
    return 'var(--red)';
  }
</script>

<div class="api-root">
  <div class="api-header">
    <div class="api-title"><IconSend size={20} stroke={1.8}/><span>API Tester</span></div>
    <p class="api-sub">HTTP client — Ctrl+Enter to send</p>
  </div>

  <div class="api-url-bar">
    <select class="api-method" bind:value={method} style="color:{METHOD_COLORS[method]}">
      {#each METHODS as m}<option value={m}>{m}</option>{/each}
    </select>
    <input class="api-url" type="text" bind:value={url} onkeydown={onKeydown}
      placeholder="https://api.example.com/endpoint" spellcheck="false"/>
    <button class="api-send" onclick={send} disabled={loading || !url.trim()}>
      {#if loading}<IconLoader2 size={16} class="spin"/>{:else}<IconSend size={16}/>{/if}
    </button>
  </div>

  <div class="api-tabs">
    <button class="api-tab" class:active={showHeaders} onclick={() => showHeaders = !showHeaders}>
      Headers {#if headers.filter(h=>h.key).length}<span class="api-tab-badge">{headers.filter(h=>h.key).length}</span>{/if}
      {#if showHeaders}<IconChevronUp size={12}/>{:else}<IconChevronDown size={12}/>{/if}
    </button>
    {#if !['GET', 'HEAD'].includes(method)}
      <button class="api-tab" class:active={bodyMode !== 'none'} onclick={() => bodyMode = bodyMode === 'none' ? 'json' : 'none'}>
        Body {#if bodyMode !== 'none'}<span class="api-tab-badge">{bodyMode}</span>{/if}
      </button>
    {/if}
  </div>

  {#if showHeaders}
    <div class="api-headers">
      {#each headers as _, i}
        <div class="api-header-row">
          <input class="api-hdr-key" type="text" bind:value={headers[i].key} placeholder="Header name" spellcheck="false"/>
          <input class="api-hdr-val" type="text" bind:value={headers[i].value} placeholder="Value" spellcheck="false"/>
          <button class="api-hdr-del" onclick={() => removeHeader(i)}><IconTrash size={12}/></button>
        </div>
      {/each}
      <button class="api-hdr-add" onclick={addHeader}><IconPlus size={12}/> Add header</button>
    </div>
  {/if}

  {#if !['GET', 'HEAD'].includes(method) && bodyMode !== 'none'}
    <div class="api-body-wrap">
      <div class="api-body-bar">
        <select class="api-body-mode" bind:value={bodyMode}>
          <option value="json">JSON</option>
          <option value="text">Text</option>
        </select>
        {#if bodyMode === 'json'}
          <button class="api-icon-sm" onclick={formatBody} title="Format JSON">Format</button>
        {/if}
      </div>
      <textarea class="api-body" bind:value={body} onkeydown={onKeydown}
        placeholder={bodyMode === 'json' ? '{\n  "key": "value"\n}' : 'Request body...'}
        spellcheck="false"></textarea>
    </div>
  {/if}

  {#if response}
    <div class="api-response">
      <div class="api-resp-header">
        <div class="api-resp-status" style="color:{statusColor(response.status)}">
          {#if response.status}
            <span class="api-resp-code">{response.status}</span>
            <span>{response.statusText}</span>
          {:else if response.error}
            <IconX size={14}/><span>{response.error}</span>
          {/if}
        </div>
        <div class="api-resp-meta">
          {#if response.time !== undefined}<span><IconClock size={11}/> {response.time}ms</span>{/if}
          {#if response.size}<span>{response.size}</span>{/if}
          {#if response.body}
            <button class="api-icon-sm" onclick={() => navigator.clipboard.writeText(response!.body || '')}>
              <IconCopy size={12}/> Copy
            </button>
          {/if}
        </div>
      </div>

      {#if response.body}
        <div class="api-resp-tabs">
          <button class="api-resp-tab" class:active={!showResponseHeaders} onclick={() => showResponseHeaders = false}>Body</button>
          <button class="api-resp-tab" class:active={showResponseHeaders} onclick={() => showResponseHeaders = true}>Headers</button>
        </div>
        {#if showResponseHeaders}
          <div class="api-resp-headers">
            {#each Object.entries(response.headers || {}) as [k, v]}
              <div class="api-resp-hdr"><span class="api-resp-hdr-k">{k}:</span> <span>{v}</span></div>
            {/each}
          </div>
        {:else}
          <pre class="api-resp-body"><code>{try { JSON.stringify(JSON.parse(response.body), null, 2) } catch { response.body }}</code></pre>
        {/if}
      {/if}
    </div>
  {/if}

  {#if history.length > 0}
    <div class="api-history">
      <div class="api-history-title">History</div>
      {#each history.slice(0, 5) as h}
        <div class="api-history-item">
          <span class="api-history-method" style="color:{METHOD_COLORS[h.method]}">{h.method}</span>
          <span class="api-history-url">{h.url}</span>
          <span class="api-history-status" style="color:{statusColor(h.status)}">{h.status}</span>
          <span class="api-history-time">{h.time}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .api-root{padding:24px 32px;max-width:900px;margin:0 auto}
  .api-header{margin-bottom:16px}
  .api-title{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;color:var(--text-1)}
  .api-sub{color:var(--text-3);font-size:13px;margin-top:4px}

  .api-url-bar{display:flex;gap:8px;margin-bottom:12px}
  .api-method{padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-3);font-size:12px;font-weight:700;font-family:'Geist Mono',monospace;cursor:pointer;min-width:80px}
  .api-method:focus{outline:none;border-color:var(--accent)}
  .api-url{flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none}
  .api-url:focus{border-color:var(--accent)}
  .api-url::placeholder{color:var(--text-3)}
  .api-send{display:flex;align-items:center;gap:6px;padding:0 16px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;font-family:'Geist',sans-serif;cursor:pointer;transition:.15s}
  .api-send:hover{opacity:.9}
  .api-send:disabled{opacity:.5;cursor:not-allowed}

  .api-tabs{display:flex;gap:4px;margin-bottom:10px}
  .api-tab{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11px;font-weight:500;font-family:'Geist',sans-serif;cursor:pointer;transition:.1s}
  .api-tab:hover{border-color:var(--border-hover);color:var(--text-1)}
  .api-tab.active{border-color:var(--accent);color:var(--accent)}
  .api-tab-badge{background:var(--accent);color:#fff;font-size:9px;padding:1px 5px;border-radius:8px;font-weight:700}

  .api-headers{margin-bottom:10px;display:flex;flex-direction:column;gap:6px}
  .api-header-row{display:flex;gap:6px}
  .api-hdr-key,.api-hdr-val{flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);font-size:12px;font-family:'Geist Mono',monospace;outline:none}
  .api-hdr-key:focus,.api-hdr-val:focus{border-color:var(--accent)}
  .api-hdr-del{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:4px;display:flex}
  .api-hdr-del:hover{color:var(--red)}
  .api-hdr-add{display:flex;align-items:center;gap:4px;background:none;border:1px dashed var(--border);color:var(--text-3);padding:5px 8px;border-radius:6px;font-size:11px;cursor:pointer;font-family:'Geist',sans-serif}
  .api-hdr-add:hover{border-color:var(--accent);color:var(--accent)}

  .api-body-wrap{margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
  .api-body-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bg-3);border-bottom:1px solid var(--border)}
  .api-body-mode{background:none;border:1px solid var(--border);color:var(--text-2);font-size:11px;padding:3px 6px;border-radius:4px;font-family:'Geist',sans-serif;cursor:pointer}
  .api-body{width:100%;min-height:100px;padding:10px;background:var(--bg-1);border:none;color:var(--text-1);font-size:12px;font-family:'Geist Mono',monospace;resize:vertical;outline:none;line-height:1.5}
  .api-body::placeholder{color:var(--text-3)}
  .api-icon-sm{display:flex;align-items:center;gap:3px;background:none;border:none;color:var(--text-3);font-size:10px;cursor:pointer;padding:2px 4px;border-radius:3px;font-family:'Geist',sans-serif}
  .api-icon-sm:hover{color:var(--text-1);background:var(--hover)}

  .api-response{border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px}
  .api-resp-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-3);border-bottom:1px solid var(--border)}
  .api-resp-status{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
  .api-resp-code{font-size:16px;font-weight:800;font-family:'Geist Mono',monospace}
  .api-resp-meta{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text-3)}
  .api-resp-meta span{display:flex;align-items:center;gap:3px}

  .api-resp-tabs{display:flex;gap:0;border-bottom:1px solid var(--border)}
  .api-resp-tab{padding:6px 14px;background:none;border:none;color:var(--text-3);font-size:11px;font-weight:500;cursor:pointer;font-family:'Geist',sans-serif;border-bottom:2px solid transparent}
  .api-resp-tab.active{color:var(--accent);border-bottom-color:var(--accent)}

  .api-resp-headers{padding:10px 12px;max-height:200px;overflow-y:auto}
  .api-resp-hdr{font-size:12px;color:var(--text-2);margin-bottom:3px;font-family:'Geist Mono',monospace}
  .api-resp-hdr-k{color:var(--accent);font-weight:600}

  .api-resp-body{margin:0;padding:12px;background:var(--bg-1);max-height:400px;overflow:auto;font-size:12px;line-height:1.5;color:var(--text-1);font-family:'Geist Mono',monospace}
  .api-resp-body code{background:none;padding:0}

  .api-history{margin-top:12px}
  .api-history-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);margin-bottom:6px}
  .api-history-item{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;font-size:11px;font-family:'Geist Mono',monospace}
  .api-history-item:hover{background:var(--bg-3)}
  .api-history-method{font-weight:700;min-width:50px}
  .api-history-url{flex:1;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .api-history-status{font-weight:600;min-width:30px;text-align:right}
  .api-history-time{color:var(--text-3);min-width:60px;text-align:right}

  :global(.spin){animation:spin 1s linear infinite}
  @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

  @media(max-width:600px){
    .api-root{padding:16px}
    .api-url-bar{flex-direction:column}
    .api-method{min-width:auto}
  }
</style>
