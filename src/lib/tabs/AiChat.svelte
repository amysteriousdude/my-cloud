<script lang="ts">
  import { IconPlayerStop, IconSend, IconSettings, IconChevronDown, IconChevronUp, IconBrain, IconHistory, IconPlus, IconTrash, IconUser, IconLink, IconChevronRight } from '@tabler/icons-svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import { marked } from 'marked';

  let { apiKey = '', barConfig = $bindable(null) }: { apiKey?: string; barConfig?: any } = $props();

  type BarButton = { icon: any; label: string; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean };

  type ChatHistory = {
    id: string;
    title: string;
    messages: { role: 'user' | 'assistant' | 'system'; content: string; citations?: string[] }[];
    provider: string;
    model: string;
    systemPrompt: string;
    createdAt: number;
    updatedAt: number;
    folderId?: string;
  };

  const HISTORY_FOLDER = 'ai/history';
  let historyFolderId = $state<string | null>(null);

  const PROVIDERS = [
    { id: 'pollinations', label: 'Pollinations', color: '#a855f7', apiBase: 'https://g4f.space' },
    { id: 'groq', label: 'Groq', color: '#f97316', apiBase: 'https://g4f.space' },
    { id: 'ollama', label: 'Ollama', color: '#14b8a6', apiBase: 'https://g4f.space' },
    { id: 'nvidia', label: 'Nvidia', color: '#76B900', apiBase: 'https://g4f.space' },
    { id: 'gemini', label: 'Gemini', color: '#3b82f6', apiBase: 'https://g4f.space' },
  ];

  let selectedProvider = $state(PROVIDERS[0]);
  let models = $state<any[]>([]);
  let selectedModel = $state('');
  let messages = $state<{ role: 'user' | 'assistant' | 'system'; content: string; citations?: string[]; _showSources?: boolean }[]>([]);
  let input = $state('');
  let isStreaming = $state(false);
  let systemPrompt = $state('');
  let showSystem = $state(false);
  let loadingModels = $state(false);
  let abortController: AbortController | null = null;

  // Chat history
  let chatHistory = $state<ChatHistory[]>([]);
  let currentChatId = $state<string | null>(null);
  let showHistory = $state(false);
  let titleGenerating = $state(false);
  let loadingHistory = $state(false);

  // Markdown renderer
  marked.setOptions({ breaks: true, gfm: true });

  function renderMarkdown(text: string, citations?: string[]): string {
    try {
      let html = marked.parse(text) as string;
      // Replace [1][2] style references with superscript links if citations exist
      if (citations && citations.length > 0) {
        html = html.replace(/\[(\d+)\]/g, (match, num) => {
          const idx = parseInt(num) - 1;
          if (idx >= 0 && idx < citations.length) {
            return `<sup class="cite-ref"><a href="${citations[idx]}" target="_blank" rel="noopener" title="${citations[idx]}">${num}</a></sup>`;
          }
          return match;
        });
      }
      return html;
    } catch {
      return text;
    }
  }

  function getDomain(url: string): string {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
  }

  function getFaviconUrl(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch { return ''; }
  }

  const OWNERS: Record<string, string> = {
    'openai-fast': 'OpenAI', 'openai': 'OpenAI', 'openai-large': 'OpenAI', 'openai-audio': 'OpenAI',
    'deepseek': 'DeepSeek', 'minimax': 'MiniMax', 'mistral': 'Mistral', 'qwen-coder': 'Alibaba',
    'glm': 'Zhipu AI', 'grok': 'xAI', 'kimi': 'Moonshot AI', 'midijourney': 'Midijourney',
    'perplexity-reasoning': 'Perplexity', 'perplexity-fast': 'Perplexity', 'nova-fast': 'Amazon',
    'openai/gpt-oss-120b': 'OpenAI', 'openai/gpt-oss-20b': 'OpenAI',
    'llama-3.3-70b-versatile': 'Meta', 'qwen/qwen3-32b': 'Alibaba', 'llama-3.1-8b-instant': 'Meta',
    'groq/compound': 'Groq', 'qwen/qwen3.6-27b': 'Alibaba',
    'meta-llama/llama-4-scout-17b-16e-instruct': 'Meta', 'openai/gpt-oss-safeguard-20b': 'OpenAI',
    'groq/compound-mini': 'Groq', 'allam-2-7b': 'SDAIA',
    'whisper-large-v3': 'OpenAI', 'whisper-large-v3-turbo': 'OpenAI',
    'canopylabs/orpheus-arabic-saudi': 'Canopy Labs', 'canopylabs/orpheus-v1-english': 'Canopy Labs',
    'gemma4:31b': 'Google', 'nemotron-3-super': 'NVIDIA', 'glm-4.7': 'Zhipu AI',
    'qwen3-coder-next': 'Alibaba', 'nemotron-3-nano:30b': 'NVIDIA',
    'gpt-oss:20b': 'OpenAI', 'gemma3:27b': 'Google', 'gemma3:12b': 'Google',
    'ministral-3:8b': 'Mistral', 'devstral-2:123b': 'Mistral', 'ministral-3:14b': 'Mistral',
    'gpt-oss:120b': 'OpenAI', 'ministral-3:3b': 'Mistral', 'minimax-m2.5': 'MiniMax',
    'minimax-m2.1': 'MiniMax', 'devstral-small-2:24b': 'Mistral', 'gemma3:4b': 'Google',
    'z-ai/glm-5.2': 'Zhipu AI', 'nvidia/nemotron-3-nano-30b-a3b': 'NVIDIA',
    'minimaxai/minimax-m2.7': 'MiniMax', 'stepfun-ai/step-3.7-flash': 'StepFun',
    'moonshotai/kimi-k2.6': 'Moonshot AI', 'deepseek-ai/deepseek-v4-pro': 'DeepSeek',
    'nvidia/nemotron-3-super-120b-a12b': 'NVIDIA', 'minimaxai/minimax-m3': 'MiniMax',
    'mistralai/mistral-large-3-675b-instruct-2512': 'Mistral',
    'meta/llama-3.1-70b-instruct': 'Meta', 'deepseek-ai/deepseek-v4-flash': 'DeepSeek',
    'google/gemma-4-31b-it': 'Google', 'qwen/qwen3.5-397b-a17b': 'Alibaba',
    'meta/llama-3.2-90b-vision-instruct': 'Meta', 'meta/llama-guard-4-12b': 'Meta',
    'nvidia/llama-3.1-nemotron-safety-guard-8b-v3': 'NVIDIA',
    'nvidia/nemotron-3-ultra-550b-a55b': 'NVIDIA', 'meta/llama-3.2-11b-vision-instruct': 'Meta',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': 'NVIDIA',
    'nvidia/nemotron-nano-12b-v2-vl': 'NVIDIA', 'meta/llama-3.1-8b-instruct': 'Meta',
    'mistralai/mistral-small-4-119b-2603': 'Mistral',
    'nvidia/llama-3.3-nemotron-super-49b-v1.5': 'NVIDIA',
    'meta/llama-3.2-3b-instruct': 'Meta', 'meta/llama-4-maverick-17b-128e-instruct': 'Meta',
    'mistralai/mistral-medium-3.5-128b': 'Mistral',
    'nvidia/llama-3.1-nemotron-nano-8b-v1': 'NVIDIA',
    'stepfun-ai/step-3.5-flash': 'StepFun',
    'models/gemini-2.5-flash': 'Google', 'models/gemini-3.1-flash-lite-preview': 'Google',
    'models/gemini-flash-latest': 'Google', 'models/gemini-3.1-flash-lite': 'Google',
    'models/gemini-3-flash-preview': 'Google', 'models/gemini-flash-lite-latest': 'Google',
    'models/gemini-3.5-flash': 'Google', 'models/gemma-4-31b-it': 'Google',
    'models/gemini-2.5-flash-lite': 'Google', 'models/gemma-4-26b-a4b-it': 'Google',
    'models/gemini-2.5-pro': 'Google', 'models/gemini-2.0-flash': 'Google',
    'models/gemini-2.0-flash-001': 'Google', 'models/gemini-2.0-flash-lite-001': 'Google',
    'models/gemini-2.0-flash-lite': 'Google', 'models/gemini-pro-latest': 'Google',
    'models/gemini-2.5-flash-image': 'Google',
    'models/gemini-3-pro-preview': 'Google', 'models/gemini-3.1-pro-preview': 'Google',
  };

  function getOwner(modelId: string): string {
    return OWNERS[modelId] ?? modelId.split('/')[0]?.split(':')[0] ?? 'Unknown';
  }

  function getDisplayName(model: any): string {
    return model.name ?? model.id?.split('/').pop() ?? model.id;
  }

  async function loadModels() {
    loadingModels = true;
    models = [];
    selectedModel = '';
    try {
      const url = `${selectedProvider.apiBase}/api/${selectedProvider.id}/models`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
      const data = await res.json();
      const filtered = (data.data ?? []).filter((m: any) => {
        const out = m.output_modalities ?? [];
        return out.includes('text') && !out.includes('audio') && !out.includes('speech') && !out.includes('transcription');
      });
      filtered.sort((a: any, b: any) => (b.requests ?? 0) - (a.requests ?? 0));
      models = filtered;
      if (filtered.length > 0) selectedModel = filtered[0].id;
    } catch (e) {
      console.error('Failed to load models:', e);
    } finally {
      loadingModels = false;
    }
  }

  $effect(() => {
    const _ = selectedProvider;
    loadModels();
  });

  $effect(() => {
    const btns: BarButton[] = [];
    if (isStreaming) {
      btns.push({ icon: IconPlayerStop, label: 'Stop', onClick: () => abortController?.abort(), danger: true });
    }
    btns.push({ icon: IconSend, label: 'Send', onClick: sendMessage, primary: true, disabled: !input.trim() || isStreaming || !selectedModel });

    const selects = [
      {
        value: selectedModel,
        options: models.map(m => ({ value: m.id, label: getDisplayName(m) })),
        onchange: (v: string) => { selectedModel = v; },
        label: loadingModels ? 'Loading...' : undefined,
      },
    ];

    barConfig = {
      selects,
      input: {
        placeholder: 'Ask anything...',
        value: input,
        oninput: (v: string) => { input = v; },
        onsubmit: sendMessage,
        loading: isStreaming,
      },
      buttons: btns,
    };
  });

  function updateBarConfig() {
    const btns: BarButton[] = [];
    if (isStreaming) {
      btns.push({ icon: IconPlayerStop, label: 'Stop', onClick: () => abortController?.abort(), danger: true });
    }
    btns.push({ icon: IconSend, label: 'Send', onClick: sendMessage, primary: true, disabled: !input.trim() || isStreaming || !selectedModel });

    const selects = [
      {
        value: selectedModel,
        options: models.map(m => ({ value: m.id, label: getDisplayName(m) })),
        onchange: (v: string) => { selectedModel = v; },
        label: loadingModels ? 'Loading...' : undefined,
      },
    ];

    barConfig = {
      selects,
      input: {
        placeholder: 'Ask anything...',
        value: input,
        oninput: (v: string) => { input = v; },
        onsubmit: sendMessage,
        loading: isStreaming,
      },
      buttons: btns,
    };
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming || !selectedModel) return;

    input = '';
    messages = [...messages, { role: 'user', content: text }];
    isStreaming = true;
    updateBarConfig();

    const apiMessages: { role: string; content: string }[] = [];
    if (systemPrompt.trim()) apiMessages.push({ role: 'system', content: systemPrompt.trim() });
    for (const m of messages) apiMessages.push({ role: m.role, content: m.content });

    messages = [...messages, { role: 'assistant', content: '' }];

    try {
      abortController = new AbortController();

      // Non-streaming request (like PowerShell) — avoids 402/429 rate limits
      let res: Response | null = null;
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        res = await fetch(`${selectedProvider.apiBase}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            messages: apiMessages,
            stream: false,
          }),
          signal: abortController.signal,
        });

        if (res.ok) break;
        if (res.status === 402 || res.status === 429) {
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(2000 * (attempt + 1), 10000);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        throw new Error(`API error: ${res.status}`);
      }

      if (!res || !res.ok) throw new Error(`API error: ${res?.status}`);

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      const citations = data.citations ?? [];

      messages = messages.map((m, i) =>
        i === messages.length - 1 ? { ...m, content, citations } : m
      );
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        messages = messages.map((m, i) =>
          i === messages.length - 1 ? { ...m, content: m.content || `Error: ${e.message}` } : m
        );
      }
    } finally {
      isStreaming = false;
      abortController = null;
      updateBarConfig();
    }
  }

  function clearChat() {
    messages = [];
    currentChatId = null;
  }

  // ── Chat History ──────────────────────────────────────────

  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function generateTitle(): Promise<string> {
    if (messages.length === 0) return 'New Chat';
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return 'New Chat';

    const firstUserMsg = userMsgs[0].content.slice(0, 500);
    const firstAssistantMsg = messages.find(m => m.role === 'assistant')?.content.slice(0, 500) ?? '';

    const titlePrompt = `You are a conversation title generator.

Generate a concise title (2-6 words) that summarizes the conversation.

Requirements:
- Plain text only.
- No markdown.
- No quotes.
- No punctuation at the end.
- No explanations.
- Return only the title.

User: ${firstUserMsg}
Assistant: ${firstAssistantMsg}`;

    try {
      const res = await fetch(`${selectedProvider.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: titlePrompt }],
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const title = data.choices?.[0]?.message?.content?.trim();
      return title && title.length > 0 && title.length < 100 ? title : 'New Chat';
    } catch {
      return 'New Chat';
    }
  }

  let ensureFolderPromise: Promise<string | null> | null = null;
  async function ensureHistoryFolder(): Promise<string | null> {
    if (historyFolderId) return historyFolderId;
    if (ensureFolderPromise) return ensureFolderPromise;
    ensureFolderPromise = (async () => {
    try {
      const res1 = await fetch('/api/telegram/folderOps', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: 'ai', parentId: null }),
      });
      const data1 = await res1.json();
      const aiFolderId = data1.folder?.folderId ?? data1.folder?.id;
      if (!aiFolderId) return null;

      const res2 = await fetch('/api/telegram/folderOps', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: 'history', parentId: aiFolderId }),
      });
      const data2 = await res2.json();
      historyFolderId = data2.folder?.folderId ?? data2.folder?.id ?? null;
      return historyFolderId;
    } catch (e) {
      console.error('Failed to ensure history folder:', e);
      return null;
    }
    })();
    return ensureFolderPromise;
  }

  async function uploadChatJson(chat: ChatHistory): Promise<boolean> {
    try {
      const folderId = await ensureHistoryFolder();
      const json = JSON.stringify(chat, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fileName = `${chat.id}.json`;

      const chunkRes = await fetch('/api/telegram/uploadChunk', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'X-Chunk-Index': '0',
          'X-File-Name': encodeURIComponent(fileName),
          'Content-Type': 'application/json',
        },
        body: blob,
      });
      if (!chunkRes.ok) throw new Error(`Chunk upload failed: ${chunkRes.status}`);
      const chunkData = await chunkRes.json();

      const finalRes = await fetch('/api/telegram/finalizeUpload', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          type: 'application/json',
          totalBytes: blob.size,
          chunks: [chunkData],
          folderId: folderId ?? null,
        }),
      });
      const finalData = await finalRes.json();
      if (finalData.error) throw new Error(finalData.error);
      return true;
    } catch (e) {
      console.error('Failed to save chat:', e);
      return false;
    }
  }

  async function loadHistory() {
    if (loadingHistory) return;
    loadingHistory = true;
    try {
      const folderId = await ensureHistoryFolder();

      // Try folder listing first, fallback to root listing
      let files: any[] = [];
      if (folderId) {
        const res = await fetch(`/api/telegram/ls?api_key=${apiKey}&folderId=${folderId}&_t=${Date.now()}`);
        const data = await res.json();
        files = data.files ?? [];
      }

      // If no files in folder, try root listing for legacy files
      if (files.length === 0) {
        const res = await fetch(`/api/telegram/ls?api_key=${apiKey}&_t=${Date.now()}`);
        const data = await res.json();
        files = (data.files ?? []).filter((f: any) =>
          f.fileName?.endsWith('.json') && (f.fileName?.includes('history') || f.fileName?.startsWith('chat_'))
        );
      }

      const loaded: ChatHistory[] = [];
      for (const file of files) {
        try {
          const resp = await fetch(`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`);
          const text = await resp.text();
          const chat = JSON.parse(text) as ChatHistory;
          if (chat.id && chat.messages?.length > 0) loaded.push(chat);
        } catch {}
      }

      loaded.sort((a, b) => b.updatedAt - a.updatedAt);
      chatHistory = loaded;
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      loadingHistory = false;
    }
  }

  let saving = false;

  async function saveChat() {
    // Only save if there are actual user messages
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0 || saving) return;
    saving = true;

    try {

    const needsTitle = !currentChatId || !chatHistory.find(c => c.id === currentChatId);
    let title = 'New Chat';
    if (needsTitle) {
      titleGenerating = true;
      title = await generateTitle();
      titleGenerating = false;
    }

    const now = Date.now();
    const existing = currentChatId ? chatHistory.find(c => c.id === currentChatId) : null;

    const chat: ChatHistory = {
      id: currentChatId ?? generateId(),
      title: existing?.title ?? title,
      messages: [...messages],
      provider: selectedProvider.id,
      model: selectedModel,
      systemPrompt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const ok = await uploadChatJson(chat);
    if (ok) {
      currentChatId = chat.id;
      if (existing) {
        chatHistory = chatHistory.map(c => c.id === chat.id ? chat : c);
      } else {
        chatHistory = [chat, ...chatHistory];
      }
    }
    } catch (e) {
      console.error('Failed to save chat:', e);
    } finally {
      saving = false;
    }
  }

  function loadChat(chat: ChatHistory) {
    currentChatId = chat.id;
    messages = [...chat.messages];
    systemPrompt = chat.systemPrompt;
    const prov = PROVIDERS.find(p => p.id === chat.provider);
    if (prov) selectedProvider = prov;
    if (chat.model) selectedModel = chat.model;
    showHistory = false;
  }

  async function deleteChat(chatId: string) {
    try {
      const folderId = await ensureHistoryFolder();
      const res = await fetch(`/api/telegram/ls?api_key=${apiKey}${folderId ? `&folderId=${folderId}` : ''}&_t=${Date.now()}`);
      const data = await res.json();
      const file = (data.files ?? []).find((f: any) => f.fileName === `${chatId}.json`);
      if (file) {
        await fetch('/api/telegram/deleteFile', {
          method: 'DELETE',
          headers: { 'X-Api-Key': apiKey, 'X-Meta-File-Id': file.metaFileId },
        });
      }
    } catch {}

    chatHistory = chatHistory.filter(c => c.id !== chatId);
    if (currentChatId === chatId) {
      currentChatId = null;
      messages = [];
    }
  }

  function newChat() {
    currentChatId = null;
    messages = [];
    systemPrompt = '';
  }

  // Auto-save after each assistant reply completes (only if user has sent messages)
  let wasStreaming = false;
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const streaming = isStreaming;
    const userMsgs = messages.filter(m => m.role === 'user');
    const lastMsg = messages[messages.length - 1];

    // Save only when streaming just finished (transition from streaming to not streaming)
    if (wasStreaming && !streaming && userMsgs.length > 0 && lastMsg?.role === 'assistant' && lastMsg.content) {
      // Debounce to prevent rapid saves
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => { saveChat(); }, 300);
    }
    wasStreaming = streaming;
  });

  // Load history on mount — only once
  let historyLoaded = false;
  $effect(() => {
    if (apiKey && !historyLoaded) {
      historyLoaded = true;
      loadHistory();
    }
  });
</script>

<div class="ai-root">
  <!-- History sidebar -->
  {#if showHistory}
    <div class="ai-history-panel">
      <div class="ai-history-header">
        <span>Chat History</span>
        <button class="ai-history-close" onclick={() => showHistory = false}>✕</button>
      </div>
      <div class="ai-history-list">
        {#if chatHistory.length === 0}
          <div class="ai-history-empty">No saved chats yet</div>
        {:else}
          {#each chatHistory as chat (chat.id)}
            <div class="ai-history-item" class:active={currentChatId === chat.id} onclick={() => loadChat(chat)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') loadChat(chat); }}>
              <div class="ai-history-title">{chat.title}</div>
              <div class="ai-history-meta">{new Date(chat.updatedAt).toLocaleDateString()} · {chat.messages.length} msgs</div>
              <button class="ai-history-delete" onclick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}>
                <IconTrash size={12} />
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Header: history/new chat + provider pills + system -->
  <div class="ai-header">
    <div class="ai-header-row">
      <button class="ai-history-btn" onclick={() => { showHistory = !showHistory; if (showHistory) loadHistory(); }} title="Chat history">
        <IconHistory size={14} />
      </button>
      <button class="ai-history-btn" onclick={newChat} title="New chat">
        <IconPlus size={14} />
      </button>

      <div class="ai-sep"></div>

      {#each PROVIDERS as p}
        <button
          class="ai-provider-pill"
          class:active={selectedProvider.id === p.id}
          style="--pill-color: {p.color}"
          onclick={() => { selectedProvider = p; }}
        >
          <BrandIcon brand={p.id} size={14} />
          <span>{p.label}</span>
        </button>
      {/each}

      <div class="ai-header-spacer"></div>

      {#if currentChatId}
        <span class="ai-current-title">{chatHistory.find(c => c.id === currentChatId)?.title ?? 'Chat'}</span>
      {/if}
      {#if titleGenerating}
        <span class="ai-current-title">Generating title...</span>
      {/if}

      <div class="ai-header-spacer"></div>

      <button class="ai-system-toggle" onclick={() => showSystem = !showSystem} title="System prompt">
        {#if showSystem}<IconChevronUp size={14}/>{:else}<IconChevronDown size={14}/>{/if}
        System
      </button>

      {#if messages.length > 0}
        <button class="ai-clear-btn" onclick={clearChat}>Clear</button>
      {/if}
    </div>

    {#if showSystem}
      <div class="ai-system-row">
        <input
          class="ai-system-input"
          type="text"
          placeholder="You are a helpful assistant..."
          bind:value={systemPrompt}
        />
      </div>
    {/if}
  </div>

  <!-- Chat messages -->
  <div class="ai-messages">
    {#if messages.length === 0}
      <div class="ai-empty">
        <IconBrain size={48} stroke={1} />
        <p>Ask anything</p>
        <p class="ai-empty-sub">Select a provider and model, then start chatting</p>
      </div>
    {:else}
      {#each messages as msg, idx (idx)}
        <div class="ai-msg" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
          <div class="ai-msg-avatar">
            {#if msg.role === 'user'}<IconUser size={14} />{:else}
              <BrandIcon brand={getOwner(selectedModel)} size={14} />
            {/if}
          </div>
          <div class="ai-msg-body">
            {#if msg.role === 'assistant'}
              <div class="ai-msg-content ai-markdown">{@html renderMarkdown(msg.content, msg.citations)}</div>
              {#if msg.citations && msg.citations.length > 0}
                <div class="ai-sources">
                  <button class="ai-sources-btn" onclick={() => { msg._showSources = !msg._showSources; messages = [...messages]; }}>
                    <IconLink size={12} />
                    <span>Sources</span>
                    <span class="ai-sources-count">{msg.citations.length}</span>
                    <span class="ai-sources-chevron" class:open={msg._showSources}><IconChevronRight size={12} /></span>
                  </button>
                  {#if msg._showSources}
                    <div class="ai-sources-list">
                      {#each msg.citations as url, i}
                        <a class="cite-link" href={url} target="_blank" rel="noopener" title={url}>
                          <img class="cite-favicon" src={getFaviconUrl(url)} alt="" width="14" height="14" />
                          <span class="cite-num">{i + 1}</span>
                          <span class="cite-domain">{getDomain(url)}</span>
                        </a>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {:else}
              <div class="ai-msg-content">{msg.content}</div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .ai-root {
    display: flex; flex-direction: column;
    height: 100%; overflow: hidden; position: relative;
    font-family: 'Geist', sans-serif;
  }

  /* ── Header ──────────────────────────────────────────────── */
  .ai-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 10px;
    flex-shrink: 0;
  }

  .ai-header-row {
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  }

  .ai-sep {
    width: 1px; height: 20px; background: var(--border); margin: 0 2px; flex-shrink: 0;
  }

  .ai-provider-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 10px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--bg-3);
    color: var(--text-2); font-size: 11px; font-weight: 600;
    font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .15s;
  }
  .ai-provider-pill:hover { border-color: var(--border-hover); color: var(--text-1); }
  .ai-provider-pill.active {
    border-color: var(--pill-color); color: var(--pill-color);
    background: color-mix(in srgb, var(--pill-color) 10%, var(--bg-3));
  }

  .ai-header-spacer { flex: 1; }

  .ai-current-title {
    font-size: 12px; color: var(--text-3); font-weight: 500;
    max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .ai-system-toggle, .ai-clear-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 6px;
    border: 1px solid var(--border); background: var(--bg-3);
    color: var(--text-3); font-size: 11px; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: all .13s;
  }
  .ai-system-toggle:hover, .ai-clear-btn:hover { color: var(--text-2); border-color: var(--border-hover); }

  /* ── History Button ─────────────────────────────────────── */
  .ai-history-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px;
    border: 1px solid var(--border); background: var(--bg-3);
    color: var(--text-3); cursor: pointer; transition: all .13s;
  }
  .ai-history-btn:hover { color: var(--text-2); border-color: var(--border-hover); }

  .ai-system-row { margin-top: 4px; }

  .ai-system-input {
    width: 100%; background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 12px; outline: none;
    color: var(--text-1); font-size: 12px; font-family: 'Geist', sans-serif;
  }
  .ai-system-input::placeholder { color: var(--text-3); }
  .ai-system-input:focus { border-color: var(--accent); }

  /* ── Messages ──────────────────────────────────────────── */
  .ai-messages {
    flex: 1; overflow-y: auto; padding: 20px;
    display: flex; flex-direction: column; gap: 16px;
  }

  .ai-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; flex: 1; gap: 8px;
    color: var(--text-3);
  }
  .ai-empty p { margin: 0; font-size: 14px; font-weight: 500; }
  .ai-empty-sub { font-size: 12px; opacity: .6; }

  .ai-msg {
    display: flex; gap: 10px; max-width: 80%;
  }
  .ai-msg.user { align-self: flex-end; flex-direction: row-reverse; }
  .ai-msg.assistant { align-self: flex-start; }

  .ai-msg-avatar {
    width: 28px; height: 28px; border-radius: 8px;
    background: var(--bg-3); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: var(--text-3);
    flex-shrink: 0;
  }
  .ai-msg.user .ai-msg-avatar { background: var(--accent); color: #fff; }

  .ai-msg-content {
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 12px; padding: 10px 14px;
    font-size: 13px; line-height: 1.5; color: var(--text-1);
    white-space: pre-wrap; word-break: break-word;
  }
  .ai-msg.user .ai-msg-content {
    background: var(--accent); color: #fff; border-color: var(--accent);
  }

  .ai-msg-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  /* ── Markdown rendering ─────────────────────────────────── */
  .ai-markdown { white-space: normal; }
  .ai-markdown p { margin: 0 0 8px; }
  .ai-markdown p:last-child { margin-bottom: 0; }
  .ai-markdown strong { font-weight: 600; }
  .ai-markdown em { font-style: italic; }
  .ai-markdown code {
    background: rgba(99,102,241,.15); padding: 1px 5px; border-radius: 4px;
    font-family: 'Geist Mono', monospace; font-size: 12px;
  }
  .ai-markdown pre {
    background: var(--bg-1); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; overflow-x: auto; margin: 8px 0;
  }
  .ai-markdown pre code { background: none; padding: 0; }
  .ai-markdown ul, .ai-markdown ol { margin: 4px 0 8px; padding-left: 20px; }
  .ai-markdown li { margin: 2px 0; }
  .ai-markdown a { color: var(--accent); text-decoration: underline; }
  .ai-markdown blockquote {
    border-left: 3px solid var(--accent); margin: 8px 0; padding: 4px 12px;
    color: var(--text-2); background: rgba(99,102,241,.05); border-radius: 0 6px 6px 0;
  }
  .ai-markdown h1, .ai-markdown h2, .ai-markdown h3, .ai-markdown h4 {
    margin: 12px 0 6px; font-weight: 600;
  }
  .ai-markdown h1 { font-size: 16px; }
  .ai-markdown h2 { font-size: 14px; }
  .ai-markdown h3 { font-size: 13px; }
  .ai-markdown table { border-collapse: collapse; margin: 8px 0; width: 100%; }
  .ai-markdown th, .ai-markdown td { border: 1px solid var(--border); padding: 6px 10px; font-size: 12px; text-align: left; }
  .ai-markdown th { background: var(--bg-3); font-weight: 600; }
  .ai-markdown hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }

  /* Citation superscript links */
  .cite-ref a {
    color: var(--accent); font-size: 10px; font-weight: 700;
    text-decoration: none; vertical-align: super;
  }
  .cite-ref a:hover { text-decoration: underline; }

  /* ── Sources bar ─────────────────────────────────────────── */
  .ai-sources {
    display: flex; flex-direction: column; gap: 4px;
    margin-top: 4px;
  }

  .ai-sources-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 6px; width: fit-content;
    border: 1px solid var(--border); background: var(--bg-3);
    color: var(--text-3); font-size: 11px; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: all .13s;
  }
  .ai-sources-btn:hover { color: var(--text-2); border-color: var(--border-hover); }

  .ai-sources-count {
    background: var(--bg-1); border-radius: 999px; padding: 0 6px;
    font-size: 10px; font-weight: 700;
  }

  .ai-sources-chevron { display: flex; transition: transform .15s; }
  .ai-sources-chevron.open { transform: rotate(90deg); }

  .ai-sources-list {
    display: flex; flex-direction: column; gap: 2px;
    padding: 6px; background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 8px; max-height: 200px; overflow-y: auto;
  }

  .cite-link {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px; border-radius: 6px; text-decoration: none;
    color: var(--text-2); font-size: 12px; transition: background .1s;
  }
  .cite-link:hover { background: var(--hover); color: var(--text-1); }

  .cite-favicon { border-radius: 3px; flex-shrink: 0; }

  .cite-num {
    font-size: 10px; font-weight: 700; color: var(--accent);
    min-width: 14px; text-align: center;
  }

  .cite-domain { color: var(--text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── History Panel ─────────────────────────────────────── */
  .ai-history-panel {
    position: absolute; top: 0; left: 0; bottom: 0;
    width: 280px; background: var(--bg-2); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; z-index: 10;
  }

  .ai-history-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-bottom: 1px solid var(--border);
    font-size: 13px; font-weight: 600; color: var(--text-1);
  }

  .ai-history-close {
    background: none; border: none; color: var(--text-3); cursor: pointer;
    font-size: 14px; padding: 2px;
  }
  .ai-history-close:hover { color: var(--text-2); }

  .ai-history-list {
    flex: 1; overflow-y: auto; padding: 8px;
  }

  .ai-history-empty {
    text-align: center; color: var(--text-3); font-size: 12px; padding: 20px;
  }

  .ai-history-item {
    display: flex; flex-direction: column; gap: 2px;
    width: 100%; text-align: left; padding: 10px 12px; border-radius: 8px;
    border: 1px solid transparent; background: transparent;
    color: var(--text-1); font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .13s; position: relative;
  }
  .ai-history-item:hover { background: var(--bg-3); border-color: var(--border); }
  .ai-history-item.active { background: var(--bg-3); border-color: var(--accent); }

  .ai-history-title {
    font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding-right: 20px;
  }

  .ai-history-meta {
    font-size: 11px; color: var(--text-3);
  }

  .ai-history-delete {
    position: absolute; top: 10px; right: 10px;
    background: none; border: none; color: var(--text-3); cursor: pointer;
    padding: 2px; border-radius: 4px; opacity: 0; transition: opacity .13s;
  }
  .ai-history-item:hover .ai-history-delete { opacity: 1; }
  .ai-history-delete:hover { color: var(--red); background: var(--red-bg); }

  /* ── Scrollbar ──────────────────────────────────────────── */
  .ai-messages::-webkit-scrollbar { width: 6px; }
  .ai-messages::-webkit-scrollbar-track { background: transparent; }
  .ai-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  @media (max-width: 600px) {
    .ai-header { padding: 12px 14px 10px; }
    .ai-messages { padding: 14px; }
    .ai-msg { max-width: 95%; }
  }
</style>
