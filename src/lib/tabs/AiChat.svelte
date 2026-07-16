<script lang="ts">
  import { IconPlayerStop, IconSend, IconSettings, IconChevronDown, IconChevronUp, IconBrain, IconHistory, IconPlus, IconTrash, IconUser, IconLink, IconChevronRight } from '@tabler/icons-svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';

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

  // Markdown renderer — custom engine
  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inlineMarkdown(text: string): string {
    let s = escapeHtml(text);
    // images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // bold+italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // strikethrough
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  function renderMarkdown(text: string, citations?: string[]): string {
    try {
      const lines = text.split('\n');
      let html = '';
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        // Fenced code block
        if (line.trimStart().startsWith('```')) {
          const lang = line.trimStart().slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
            codeLines.push(escapeHtml(lines[i]));
            i++;
          }
          i++; // skip closing ```
          const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
          html += `<pre${langAttr}><code>${codeLines.join('\n')}</code></pre>`;
          continue;
        }

        // Table
        if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|:\s]+\s*\|?$/.test(lines[i + 1])) {
          const parseRow = (row: string) => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
          const headers = parseRow(line);
          i += 2; // skip header + separator
          const alignments = parseRow(lines[i - 1]).map(c => {
            if (c.startsWith(':') && c.endsWith(':')) return 'center';
            if (c.endsWith(':')) return 'right';
            return 'left';
          });
          let table = '<div class="md-table-wrap"><table><thead><tr>';
          headers.forEach((h, idx) => {
            table += `<th style="text-align:${alignments[idx] || 'left'}">${inlineMarkdown(h)}</th>`;
          });
          table += '</tr></thead><tbody>';
          while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
            const cells = parseRow(lines[i]);
            table += '<tr>';
            cells.forEach((c, idx) => {
              table += `<td style="text-align:${alignments[idx] || 'left'}">${inlineMarkdown(c)}</td>`;
            });
            table += '</tr>';
            i++;
          }
          table += '</tbody></table></div>';
          html += table;
          continue;
        }

        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          html += `<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`;
          i++;
          continue;
        }

        // Horizontal rule
        if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
          html += '<hr />';
          i++;
          continue;
        }

        // Blockquote
        if (line.startsWith('>')) {
          const quoteLines: string[] = [];
          while (i < lines.length && lines[i].startsWith('>')) {
            quoteLines.push(lines[i].replace(/^>\s?/, ''));
            i++;
          }
          html += `<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`;
          continue;
        }

        // Unordered list
        if (/^(\s*)([-*+])\s+/.test(line)) {
          const listLines: string[] = [];
          while (i < lines.length && /^(\s*)([-*+])\s+/.test(lines[i])) {
            listLines.push(lines[i]);
            i++;
          }
          html += renderList(listLines, false);
          continue;
        }

        // Ordered list
        if (/^(\s*)\d+\.\s+/.test(line)) {
          const listLines: string[] = [];
          while (i < lines.length && /^(\s*)\d+\.\s+/.test(lines[i])) {
            listLines.push(lines[i]);
            i++;
          }
          html += renderList(listLines, true);
          continue;
        }

        // Paragraph — collect consecutive non-empty, non-special lines
        if (line.trim() !== '') {
          const paraLines: string[] = [];
          while (i < lines.length && lines[i].trim() !== '' &&
            !lines[i].trimStart().startsWith('```') &&
            !lines[i].startsWith('#') &&
            !lines[i].startsWith('>') &&
            !lines[i].match(/^(\s*)([-*+])\s+/) &&
            !lines[i].match(/^(\s*)\d+\.\s+/) &&
            !lines[i].match(/^(\*{3,}|-{3,}|_{3,})\s*$/) &&
            !(lines[i].includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|:\s]+\s*\|?$/.test(lines[i + 1]))
          ) {
            paraLines.push(lines[i]);
            i++;
          }
          html += `<p>${inlineMarkdown(paraLines.join('\n'))}</p>`;
          continue;
        }

        i++;
      }

      // Citation references
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
      return `<p>${escapeHtml(text)}</p>`;
    }
  }

  function renderList(lines: string[], ordered: boolean): string {
    const tag = ordered ? 'ol' : 'ul';
    let html = `<${tag}>`;
    for (const line of lines) {
      const content = line.replace(/^(\s*)([-*+]|\d+\.)\s+/, '');
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      const isNested = indent >= 2;
      if (isNested) {
        // Wrap nested content in a nested list
        const inner = content.replace(/^(\s*)([-*+]|\d+\.)\s+/, '');
        html += `<li>${inlineMarkdown(content)}</li>`;
      } else {
        // Check if next line is indented (nested list)
        const idx = lines.indexOf(line);
        const nextLine = lines[idx + 1];
        const nextIndent = nextLine?.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (nextIndent > indent && nextLine) {
          // This item has nested content - collect nested lines
          html += `<li>${inlineMarkdown(content)}`;
          const nestedLines: string[] = [];
          let j = idx + 1;
          while (j < lines.length && (lines[j].match(/^(\s*)/)?.[1]?.length ?? 0) > indent) {
            nestedLines.push(lines[j]);
            j++;
          }
          const isNestedOrdered = /^\s*\d+\./.test(nestedLines[0] ?? '');
          html += renderList(nestedLines, isNestedOrdered);
          html += `</li>`;
          // Skip the nested lines we already processed
          // We handle this by just not re-processing them
        } else {
          html += `<li>${inlineMarkdown(content)}</li>`;
        }
      }
    }
    html += `</${tag}>`;
    return html;
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

      let files: any[] = [];
      if (folderId) {
        const res = await fetch(`/api/telegram/ls?api_key=${apiKey}&folderId=${folderId}&_t=${Date.now()}`);
        const data = await res.json();
        files = data.files ?? [];
      }

      if (files.length === 0) {
        const res = await fetch(`/api/telegram/ls?api_key=${apiKey}&_t=${Date.now()}`);
        const data = await res.json();
        files = (data.files ?? []).filter((f: any) =>
          f.fileName?.endsWith('.json') && (f.fileName?.includes('history') || f.fileName?.startsWith('chat_'))
        );
      }

      const loaded = new Map<string, ChatHistory>();
      const fetches = files.map(async (file: any) => {
        try {
          const resp = await fetch(`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`);
          const text = await resp.text();
          const chat = JSON.parse(text) as ChatHistory;
          if (chat.id && chat.messages?.length > 0 && !loaded.has(chat.id)) {
            loaded.set(chat.id, chat);
          }
        } catch {}
      });

      await Promise.allSettled(fetches);

      const sorted = [...loaded.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      chatHistory = sorted;
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      loadingHistory = false;
    }
  }

  let saving = false;

  async function deleteExistingFile(chatId: string) {
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
  }

  async function saveChat() {
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

      if (existing) {
        await deleteExistingFile(chat.id);
      }

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
        <span>History</span>
        <button class="ai-history-close" onclick={() => showHistory = false}>✕</button>
      </div>
      <div class="ai-history-list">
        {#if loadingHistory}
          <div class="ai-history-empty">Loading...</div>
        {:else if chatHistory.length === 0}
          <div class="ai-history-empty">No saved chats yet</div>
        {:else}
          {#each chatHistory as chat, idx (chat.id + '-' + idx)}
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

  <!-- Header: provider pills + controls -->
  <div class="ai-header">
    <div class="ai-header-row">
      <button class="ai-icon-btn" onclick={() => { showHistory = !showHistory; if (showHistory) loadHistory(); }} title="Chat history" class:active={showHistory}>
        <IconHistory size={15} />
      </button>
      <button class="ai-icon-btn" onclick={newChat} title="New chat">
        <IconPlus size={15} />
      </button>

      <div class="ai-sep"></div>

      {#each PROVIDERS as p}
        <button
          class="ai-provider-pill"
          class:active={selectedProvider.id === p.id}
          style="--pill-color: {p.color}"
          onclick={() => { selectedProvider = p; }}
        >
          <BrandIcon brand={p.id} size={13} />
          <span>{p.label}</span>
        </button>
      {/each}

      <div class="ai-header-spacer"></div>

      {#if currentChatId}
        <span class="ai-current-title">{chatHistory.find(c => c.id === currentChatId)?.title ?? 'Chat'}</span>
      {/if}
      {#if titleGenerating}
        <span class="ai-current-title ai-generating">Generating title...</span>
      {/if}

      <button class="ai-icon-btn" onclick={() => showSystem = !showSystem} title="System prompt" class:active={showSystem}>
        <IconSettings size={15} />
      </button>

      {#if messages.length > 0}
        <button class="ai-icon-btn ai-danger-btn" onclick={clearChat} title="Clear chat">
          <IconTrash size={15} />
        </button>
      {/if}
    </div>

    {#if showSystem}
      <div class="ai-system-row">
        <input
          class="ai-system-input"
          type="text"
          placeholder="System prompt (optional)..."
          bind:value={systemPrompt}
        />
      </div>
    {/if}
  </div>

  <!-- Chat messages -->
  <div class="ai-messages">
    {#if messages.length === 0}
      <div class="ai-empty">
        <div class="ai-empty-icon">
          <IconBrain size={40} stroke={1.2} />
        </div>
        <p class="ai-empty-title">Start a conversation</p>
        <p class="ai-empty-sub">Choose a provider and model below, then type your message</p>
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
                    <span>{msg.citations.length} sources</span>
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
              <div class="ai-msg-content ai-msg-user-content">{msg.content}</div>
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
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 8px;
    flex-shrink: 0;
  }

  .ai-header-row {
    display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
  }

  .ai-sep {
    width: 1px; height: 18px; background: var(--border); margin: 0 2px; flex-shrink: 0;
  }

  .ai-icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 8px;
    border: none; background: transparent;
    color: var(--text-3); cursor: pointer; transition: all .12s;
  }
  .ai-icon-btn:hover { color: var(--text-1); background: var(--hover); }
  .ai-icon-btn.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .ai-danger-btn:hover { color: var(--red); background: rgba(248,113,113,.08); }

  .ai-provider-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 9px; border-radius: 8px;
    border: none; background: transparent;
    color: var(--text-3); font-size: 11px; font-weight: 600;
    font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .12s;
  }
  .ai-provider-pill:hover { color: var(--text-2); background: var(--hover); }
  .ai-provider-pill.active {
    color: var(--pill-color);
    background: color-mix(in srgb, var(--pill-color) 10%, transparent);
  }

  .ai-header-spacer { flex: 1; }

  .ai-current-title {
    font-size: 11px; color: var(--text-3); font-weight: 500;
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ai-generating { opacity: .6; }

  .ai-system-row { margin-top: 2px; }

  .ai-system-input {
    width: 100%; background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 12px; outline: none;
    color: var(--text-1); font-size: 12px; font-family: 'Geist', sans-serif;
  }
  .ai-system-input::placeholder { color: var(--text-3); }
  .ai-system-input:focus { border-color: var(--accent); }

  /* ── Messages ──────────────────────────────────────────── */
  .ai-messages {
    flex: 1; overflow-y: auto; padding: 20px 24px;
    display: flex; flex-direction: column; gap: 14px;
  }

  .ai-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; flex: 1; gap: 12px;
  }
  .ai-empty-icon {
    width: 72px; height: 72px; border-radius: 20px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    display: flex; align-items: center; justify-content: center;
    color: var(--accent);
  }
  .ai-empty-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-1); }
  .ai-empty-sub { margin: 0; font-size: 12px; color: var(--text-3); }

  .ai-msg {
    display: flex; gap: 10px; max-width: 92%;
  }
  .ai-msg.user { align-self: flex-end; flex-direction: row-reverse; max-width: 70%; }
  .ai-msg.assistant { align-self: flex-start; }

  .ai-msg-avatar {
    width: 28px; height: 28px; border-radius: 8px;
    background: var(--bg-3); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: var(--text-3);
    flex-shrink: 0;
  }
  .ai-msg.user .ai-msg-avatar { background: var(--accent); color: #fff; border-color: var(--accent); }

  .ai-msg-content {
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 12px; padding: 12px 16px;
    font-size: 13px; line-height: 1.6; color: var(--text-1);
    word-break: break-word; min-width: 0;
  }
  .ai-msg-user-content {
    background: var(--accent); color: #fff; border-color: var(--accent);
  }

  .ai-msg-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  /* ── Markdown rendering ─────────────────────────────────── */
  .ai-markdown { white-space: normal; line-height: 1.65; }
  .ai-markdown p { margin: 0 0 10px; }
  .ai-markdown p:last-child { margin-bottom: 0; }
  .ai-markdown strong { font-weight: 600; color: var(--text-1); }
  .ai-markdown em { font-style: italic; }
  .ai-markdown del { text-decoration: line-through; opacity: .6; }
  .ai-markdown code {
    background: rgba(99,102,241,.1); padding: 2px 6px; border-radius: 4px;
    font-family: 'Geist Mono', monospace; font-size: 12px;
    color: color-mix(in srgb, var(--accent) 90%, var(--text-1));
  }
  .ai-markdown pre {
    background: var(--bg-1); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px 16px; overflow-x: auto; margin: 12px 0;
    position: relative;
  }
  .ai-markdown pre code { background: none; padding: 0; color: var(--text-1); font-size: 12px; line-height: 1.5; }
  .ai-markdown pre[data-lang]::before {
    content: attr(data-lang);
    position: absolute; top: 8px; right: 12px;
    font-size: 10px; font-weight: 600; color: var(--text-3);
    text-transform: uppercase; letter-spacing: .5px;
  }
  .ai-markdown ul, .ai-markdown ol { margin: 6px 0 10px; padding-left: 24px; }
  .ai-markdown li { margin: 4px 0; line-height: 1.6; }
  .ai-markdown li > p { margin: 4px 0; }
  .ai-markdown a { color: var(--accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .ai-markdown blockquote {
    border-left: 3px solid var(--accent); margin: 10px 0; padding: 8px 14px;
    color: var(--text-2); background: rgba(99,102,241,.04); border-radius: 0 10px 10px 0;
  }
  .ai-markdown blockquote p { margin: 4px 0; }
  .ai-markdown h1, .ai-markdown h2, .ai-markdown h3, .ai-markdown h4, .ai-markdown h5, .ai-markdown h6 {
    margin: 18px 0 8px; font-weight: 700; line-height: 1.3; color: var(--text-1);
  }
  .ai-markdown h1 { font-size: 18px; }
  .ai-markdown h2 { font-size: 16px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .ai-markdown h3 { font-size: 14px; }
  .ai-markdown h4 { font-size: 13px; }
  .ai-markdown hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

  /* Tables */
  .md-table-wrap { overflow-x: auto; margin: 10px 0; border-radius: 8px; border: 1px solid var(--border); }
  .ai-markdown table { border-collapse: collapse; width: 100%; }
  .ai-markdown th, .ai-markdown td {
    padding: 8px 12px; font-size: 12px; text-align: left;
    border-bottom: 1px solid var(--border); border-right: 1px solid var(--border);
  }
  .ai-markdown th {
    background: var(--bg-3); font-weight: 600; color: var(--text-1);
    position: sticky; top: 0; font-size: 11px; text-transform: uppercase; letter-spacing: .3px;
  }
  .ai-markdown td { color: var(--text-2); }
  .ai-markdown tr:last-child td { border-bottom: none; }
  .ai-markdown tr:hover td { background: var(--hover); }

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
    border: none; background: var(--hover);
    color: var(--text-3); font-size: 11px; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: all .12s;
  }
  .ai-sources-btn:hover { color: var(--text-2); background: color-mix(in srgb, var(--text-1) 8%, transparent); }

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
    font-size: 14px; padding: 2px; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
  }
  .ai-history-close:hover { color: var(--text-1); background: var(--hover); }

  .ai-history-list {
    flex: 1; overflow-y: auto; padding: 8px;
  }

  .ai-history-empty {
    text-align: center; color: var(--text-3); font-size: 12px; padding: 20px;
  }

  .ai-history-item {
    display: flex; flex-direction: column; gap: 2px;
    width: 100%; text-align: left; padding: 10px 12px; border-radius: 8px;
    border: none; background: transparent;
    color: var(--text-1); font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .12s; position: relative;
  }
  .ai-history-item:hover { background: var(--hover); }
  .ai-history-item.active { background: color-mix(in srgb, var(--accent) 8%, transparent); }

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
    padding: 2px; border-radius: 4px; opacity: 0; transition: opacity .12s;
    display: flex; align-items: center; justify-content: center;
  }
  .ai-history-item:hover .ai-history-delete { opacity: 1; }
  .ai-history-delete:hover { color: var(--red); background: rgba(248,113,113,.08); }

  /* ── Scrollbar ──────────────────────────────────────────── */
  .ai-messages::-webkit-scrollbar { width: 6px; }
  .ai-messages::-webkit-scrollbar-track { background: transparent; }
  .ai-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  @media (max-width: 600px) {
    .ai-header { padding: 8px 12px; }
    .ai-messages { padding: 14px; }
    .ai-msg { max-width: 95%; }
  }
</style>
