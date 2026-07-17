<script lang="ts">
  import { IconPlayerStop, IconSend, IconBrain, IconHistory, IconPlus, IconTrash, IconLink, IconChevronRight, IconCopy, IconCheck, IconArrowUp, IconDownload, IconClock, IconBook, IconAdjustments } from '@tabler/icons-svelte';

  let { apiKey = '', barConfig = $bindable(null) }: { apiKey?: string; barConfig?: any } = $props();

  type BarButton = { icon: any; label: string; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean };

  type ChatHistory = {
    id: string;
    title: string;
    messages: { role: 'user' | 'assistant' | 'system'; content: string; citations?: string[]; _searchInfo?: { query: string; source: string; summary: string } | null }[];
    provider: string;
    model: string;
    systemPrompt: string;
    webSearch: boolean;
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
    { id: 'custom', label: 'Custom', color: '#ec4899', apiBase: 'https://g4f.space/custom/srv_mrgynwuz08a167112109' },
  ];
  let selectedProvider = $state(PROVIDERS[0]);
  let models = $state<any[]>([]);
  let selectedModel = $state('');
  let messages = $state<{ role: 'user' | 'assistant' | 'system'; content: string; citations?: string[]; _searchInfo?: { query: string; source: string; summary: string } | null; _showSources?: boolean; _showSearchDetail?: boolean; _collapsed?: boolean }[]>([]);
  let input = $state('');
  let isStreaming = $state(false);
  let systemPrompt = $state('');
  let loadingModels = $state(false);
  let abortController: AbortController | null = null;

  // Extras (secondary controls)
  let temperature = $state(0.7);
  let topP = $state(0.9);
  let maxTokens = $state(4096);
  let streaming = $state(false);
  let webSearch = $state(false);
  let reasoning = $state(false);
  let copiedStates = $state<Record<string, boolean>>({});
  let expandedCollapsibles = $state<Record<string, boolean>>({});
  let showBackToTop = $state(false);
  let messagesContainer: HTMLDivElement;

  // Chat history
  let chatHistory = $state<ChatHistory[]>([]);
  let currentChatId = $state<string | null>(null);
  let showHistory = $state(false);
  let showExtras = $state(false);
  let titleGenerating = $state(false);
  let loadingHistory = $state(false);

  // ── Utility helpers ──────────────────────────────────────────
  function isRtl(text: string): boolean {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0590-\u05FF]/.test(text);
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function wordCount(text: string): number {
    // Strip markdown syntax, code blocks, inline code, HTML tags
    let s = text
      .replace(/```[\s\S]*?```/g, '')        // fenced code blocks
      .replace(/`[^`]+`/g, '')                // inline code
      .replace(/<[^>]+>/g, '')                // HTML tags
      .replace(/#{1,6}\s+/g, '')             // headings
      .replace(/\*\*|__/g, '')               // bold
      .replace(/\*|_/g, '')                  // italic
      .replace(/~~|~/g, '')                  // strikethrough
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → keep text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')  // images → remove
      .replace(/^[\s]*[-*+]\s+/gm, '')       // unordered list markers
      .replace(/^[\s]*\d+\.\s+/gm, '')       // ordered list markers
      .replace(/^[\s]*>\s?/gm, '')           // blockquotes
      .replace(/^[\s]*[-*_]{3,}\s*$/gm, '')  // horizontal rules
      .replace(/\|/g, ' ')                   // table pipes
      .replace(/^[-:]+$/gm, '')              // table alignment rows
      .replace(/\[ \]|\[x\]/gi, '')          // task checkboxes
      .replace(/^[#*>\-|_\[\]()~`]+$/gm, '') // lines that are only syntax
      .trim();
    if (!s) return 0;
    // Split on any whitespace (handles Arabic, English, mixed)
    // Unicode \p{L} matches any letter from any script
    const words = s.split(/\s+/).filter(w => w.length > 0 && /\p{L}/u.test(w));
    return words.length;
  }

  function readingTime(text: string): string {
    const wc = wordCount(text);
    if (wc < 30) return `${wc} words`;
    const mins = Math.max(1, Math.ceil(wc / 250));
    if (mins === 1) return '~1 min read';
    return `~${mins} min read`;
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

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedStates[key] = true;
      setTimeout(() => { copiedStates[key] = false; }, 2000);
    } catch {}
  }

  // ── Smart Internet Search ─────────────────────────────────
  const SEARCH_TRIGGERS = /\b(latest|recent|current|today|now|this (?:week|month|year)|yesterday|news|weather|stock|price|score|result|live|real.?time|who (?:won|is|was|are)|what (?:is|are) (?:the|new|latest)|when (?:did|was|is)|where (?:is|are|can)|how (?:much|many|old)|update|release|version|announce)\b/i;
  const SEARCH_DOMAINS = /\b(wikipedia|cnn|bbc|reuters|ap|nytimes|github\.com|stackoverflow|npm|pypi|hacker.?news|reddit|twitter|x\.com|youtube|arxiv)\b/i;

  function needsWebSearch(prompt: string): boolean {
    if (!webSearch) return false;
    const lower = prompt.toLowerCase();
    if (SEARCH_TRIGGERS.test(lower)) return true;
    if (SEARCH_DOMAINS.test(lower)) return true;
    if (/\b\d{4}\b/.test(prompt) && /\b(release|version|update|came out|launch)\b/i.test(prompt)) return true;
    return false;
  }

  function extractSearchQuery(prompt: string): string {
    let q = prompt
      .replace(/\b(please|can you|could you|tell me|explain|what is|what are|who is|who are|where is|how do|how to|help me|I want to know|I need to know)\b/gi, '')
      .replace(/\b(thanks|thank you|hello|hi|hey)\b/gi, '')
      .replace(/[?.!,;:'"()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const words = q.split(' ');
    if (words.length > 8) q = words.slice(0, 8).join(' ');
    return q || prompt.slice(0, 60);
  }

  async function fetchWebSearch(query: string): Promise<{ query: string; source: string; summary: string } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      const abstract = data.AbstractText || data.Abstract || '';
      const answer = data.Answer || '';
      const source = data.AbstractSource || data.Heading || '';
      const text = abstract || answer;
      if (!text || text.length < 10) return null;
      const topics = (data.RelatedTopics || []).slice(0, 3).map((t: any) => t.Text).filter(Boolean);
      const full = topics.length > 0 ? `${text}\n\nRelated: ${topics.join('; ')}` : text;
      return { query, source, summary: full.slice(0, 1500) };
    } catch { return null; }
  }

  // ── Pattern Detection ────────────────────────────────────────
  type PatternType =
    | 'callout-warning' | 'callout-tip' | 'callout-note' | 'callout-error' | 'callout-info'
    | 'definition' | 'faq' | 'comparison' | 'proscons'
    | 'steps' | 'collapsible-list' | 'code-block' | 'table'
    | 'heading' | 'paragraph' | 'list' | 'blockquote' | 'hr';

  interface DetectedPattern {
    type: PatternType;
    content: string;
    meta?: any;
  }

  function detectCalloutType(text: string): PatternType | null {
    const lower = text.toLowerCase().trim();
    if (/^(warning|caution|danger|important):/i.test(lower)) return 'callout-warning';
    if (/^(tip|hint|suggestion|pro tip):/i.test(lower)) return 'callout-tip';
    if (/^(note|info|information|fyi):/i.test(lower)) return 'callout-note';
    if (/^(error|mistake|wrong|bad):/i.test(lower)) return 'callout-error';
    if (/^(remember|keep in mind|note that):/i.test(lower)) return 'callout-info';
    return null;
  }

  function detectDefinition(lines: string[]): boolean {
    if (lines.length < 2 || lines.length > 6) return false;
    const first = lines[0].trim();
    return /^\*\*[^*]+\*\*:?\s*$/.test(first) || /^[A-Z][^.]+:\s*$/.test(first);
  }

  function detectFAQ(lines: string[]): boolean {
    if (lines.length < 4) return false;
    let qCount = 0;
    for (const l of lines) {
      if (/^(Q[:.]|##?\s*Q|FAQ|\?\s*$)/i.test(l.trim()) || l.trim().endsWith('?')) qCount++;
    }
    return qCount >= 2;
  }

  function detectComparison(lines: string[]): boolean {
    if (lines.length < 3) return false;
    const hasTable = lines.some(l => l.includes('|')) && lines.some(l => /^\|?\s*[-:]+/.test(l.trim()));
    if (hasTable) {
      const headerLine = lines.find(l => l.includes('|'));
      if (headerLine) {
        const cells = headerLine.replace(/^\||\|$/g, '').split('|').map(c => c.trim().toLowerCase());
        const compWords = ['vs', 'versus', 'comparison', 'compare', 'pros', 'cons', 'advantage', 'disadvantage'];
        if (cells.some(c => compWords.some(w => c.includes(w)))) return true;
      }
    }
    return false;
  }

  function detectProsCons(lines: string[]): boolean {
    const text = lines.join('\n').toLowerCase();
    return (text.includes('pros') && text.includes('cons')) ||
           (text.includes('advantages') && text.includes('disadvantages')) ||
           (text.includes('好处') && text.includes('坏处'));
  }

  function detectSteps(lines: string[]): boolean {
    if (lines.length < 3) return false;
    let stepCount = 0;
    for (const l of lines) {
      if (/^\d+[\.\)]\s+/.test(l.trim()) || /^step\s+\d+/i.test(l.trim())) stepCount++;
    }
    return stepCount >= 3;
  }

  function detectLongList(lines: string[]): boolean {
    return lines.length > 8;
  }

  // ── Enhanced Inline Markdown ─────────────────────────────────
  function inlineMd(text: string): string {
    let s = escapeHtml(text);
    // images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img" />');
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1<svg class="md-ext-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>');
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
    s = s.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    return s;
  }

  // ── TOC Generator ────────────────────────────────────────────
  function generateToc(html: string): { id: string; text: string; level: number }[] {
    const toc: { id: string; text: string; level: number }[] = [];
    const regex = /<h([1-6])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const level = parseInt(match[1]);
      const id = match[2];
      const text = match[3].replace(/<[^>]+>/g, '');
      toc.push({ id, text, level });
    }
    return toc;
  }

  // ── Smart Markdown Renderer ──────────────────────────────────
  function renderMarkdown(text: string, citations?: string[]): string {
    try {
      const lines = text.split('\n');
      let html = '';
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        // ── Think / Thought block (reasoning) ──────────────
        if (line.trimStart() === '<think>' || line.trimStart() === '<thought>') {
          const thinkLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].trimStart().startsWith('</think>') && !lines[i].trimStart().startsWith('</thought>')) {
            thinkLines.push(lines[i]);
            i++;
          }
          if (i < lines.length && (lines[i].trimStart().startsWith('</think>') || lines[i].trimStart().startsWith('</thought>'))) i++;
          const thinkId = `think-${Math.random().toString(36).slice(2, 8)}`;
          const thinkContent = thinkLines.join('\n').trim();
          if (thinkContent) {
            html += `<details class="think-block" id="${thinkId}">
              <summary class="think-summary"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span>Reasoning</span></summary>
              <div class="think-content">${escapeHtml(thinkContent)}</div>
            </details>`;
          }
          continue;
        }

        // ── Fenced code block ────────────────────────────
        if (line.trimStart().startsWith('```')) {
          const lang = line.trimStart().slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
            codeLines.push(escapeHtml(lines[i]));
            i++;
          }
          i++;
          const codeId = `code-${Math.random().toString(36).slice(2, 8)}`;
          const codeContent = codeLines.join('\n');
          const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
          html += `<div class="code-block" id="${codeId}">
            <div class="code-header">${langLabel}
              <button class="code-copy-btn" onclick="window.__aiCopy?.('${codeId}', this)" title="Copy code">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Copy</span>
              </button>
            </div>
            <pre class="code-pre"><code>${codeContent}</code></pre>
          </div>`;
          continue;
        }

        // ── Table ────────────────────────────────────────
        if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|:\s]+\s*\|?$/.test(lines[i + 1])) {
          const parseRow = (row: string) => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
          const headers = parseRow(line);
          i += 2;
          const alignments = parseRow(lines[i - 1]).map(c => {
            if (c.startsWith(':') && c.endsWith(':')) return 'center';
            if (c.endsWith(':')) return 'right';
            return 'left';
          });
          const rows: string[][] = [];
          while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
            rows.push(parseRow(lines[i]));
            i++;
          }
          const tableId = `tbl-${Math.random().toString(36).slice(2, 8)}`;
          let table = `<div class="md-table-wrap" id="${tableId}"><table><thead><tr>`;
          headers.forEach((h, idx) => {
            table += `<th style="text-align:${alignments[idx] || 'left'}">${inlineMd(h)}</th>`;
          });
          table += '</tr></thead><tbody>';
          rows.forEach((cells, rowIdx) => {
            table += `<tr class="${rowIdx % 2 === 0 ? 'even' : 'odd'}">`;
            cells.forEach((c, idx) => {
              table += `<td style="text-align:${alignments[idx] || 'left'}">${inlineMd(c)}</td>`;
            });
            table += '</tr>';
          });
          table += '</tbody></table></div>';
          html += table;
          continue;
        }

        // ── Heading ──────────────────────────────────────
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = headingMatch[2];
          const id = slugify(text.replace(/[*_`]/g, ''));
          html += `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true">#</a>${inlineMd(text)}</h${level}>`;
          i++;
          continue;
        }

        // ── Horizontal rule ──────────────────────────────
        if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
          html += '<hr class="md-hr" />';
          i++;
          continue;
        }

        // ── Blockquote / Callout detection ───────────────
        if (line.startsWith('>')) {
          const quoteLines: string[] = [];
          while (i < lines.length && lines[i].startsWith('>')) {
            quoteLines.push(lines[i].replace(/^>\s?/, ''));
            i++;
          }
          const quoteText = quoteLines.join('\n');
          const calloutType = detectCalloutType(quoteText);
          if (calloutType) {
            const calloutId = `callout-${Math.random().toString(36).slice(2, 8)}`;
            const icons: Record<string, string> = {
              'callout-warning': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
              'callout-tip': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
              'callout-note': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
              'callout-error': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
              'callout-info': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
            };
            const labels: Record<string, string> = {
              'callout-warning': 'Warning',
              'callout-tip': 'Tip',
              'callout-note': 'Note',
              'callout-error': 'Error',
              'callout-info': 'Important',
            };
            const colorMap: Record<string, string> = {
              'callout-warning': 'var(--md-warn)',
              'callout-tip': 'var(--md-success)',
              'callout-note': 'var(--md-accent)',
              'callout-error': 'var(--md-error)',
              'callout-info': 'var(--md-accent)',
            };
            const cleanText = quoteText.replace(/^(warning|caution|danger|tip|hint|note|info|error|remember|keep in mind|note that|important|suggestion|pro tip|information|fyi|mistake|wrong|bad|caution)[:\s]*/i, '').trim();
            html += `<div class="callout callout-${calloutType.split('-')[1]}" style="--callout-accent:${colorMap[calloutType]}" id="${calloutId}">
              <div class="callout-header">${icons[calloutType]}<span>${labels[calloutType]}</span></div>
              <div class="callout-body">${renderMarkdown(cleanText)}</div>
            </div>`;
          } else {
            html += `<blockquote class="md-blockquote">${renderMarkdown(quoteText)}</blockquote>`;
          }
          continue;
        }

        // ── Task list ────────────────────────────────────
        if (/^- \[[ x]\]\s+/.test(line.trim())) {
          const taskLines: string[] = [];
          while (i < lines.length && /^- \[[ x]\]\s+/.test(lines[i].trim())) {
            taskLines.push(lines[i]);
            i++;
          }
          const taskId = `tasks-${Math.random().toString(36).slice(2, 8)}`;
          html += `<div class="task-list">`;
          for (const tl of taskLines) {
            const checked = tl.includes('[x]');
            const content = tl.replace(/^-\s*\[[ x]\]\s+/, '');
            html += `<label class="task-item">
              <input type="checkbox" ${checked ? 'checked' : ''} disabled />
              <span class="task-check"></span>
              <span class="task-text${checked ? ' done' : ''}">${inlineMd(content)}</span>
            </label>`;
          }
          html += `</div>`;
          continue;
        }

        // ── Unordered list ───────────────────────────────
        if (/^(\s*)([-*+])\s+/.test(line)) {
          const listLines: string[] = [];
          while (i < lines.length && /^(\s*)([-*+])\s+/.test(lines[i])) {
            listLines.push(lines[i]);
            i++;
          }
          if (detectLongList(listLines)) {
            const listId = `list-${Math.random().toString(36).slice(2, 8)}`;
            expandedCollapsibles[listId] = expandedCollapsibles[listId] ?? false;
            html += `<div class="collapsible-list" id="${listId}">
              <button class="collapsible-toggle" onclick="window.__aiToggleList?.('${listId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                <span>Show ${listLines.length} items</span>
              </button>
              <div class="collapsible-content">${renderList(listLines, false)}</div>
            </div>`;
          } else {
            html += renderList(listLines, false);
          }
          continue;
        }

        // ── Ordered list ─────────────────────────────────
        if (/^(\s*)\d+\.\s+/.test(line)) {
          const listLines: string[] = [];
          while (i < lines.length && /^(\s*)\d+\.\s+/.test(lines[i])) {
            listLines.push(lines[i]);
            i++;
          }
          if (detectSteps(listLines)) {
            const stepId = `steps-${Math.random().toString(36).slice(2, 8)}`;
            html += renderSteps(listLines, stepId);
          } else if (detectLongList(listLines)) {
            const listId = `list-${Math.random().toString(36).slice(2, 8)}`;
            expandedCollapsibles[listId] = expandedCollapsibles[listId] ?? false;
            html += `<div class="collapsible-list" id="${listId}">
              <button class="collapsible-toggle" onclick="window.__aiToggleList?.('${listId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                <span>Show ${listLines.length} steps</span>
              </button>
              <div class="collapsible-content">${renderList(listLines, true)}</div>
            </div>`;
          } else {
            html += renderList(listLines, true);
          }
          continue;
        }

        // ── Paragraph ────────────────────────────────────
        if (line.trim() !== '') {
          const paraLines: string[] = [];
          while (i < lines.length && lines[i].trim() !== '' &&
            !lines[i].trimStart().startsWith('```') &&
            !lines[i].startsWith('#') &&
            !lines[i].startsWith('>') &&
            !lines[i].match(/^(\s*)([-*+])\s+/) &&
            !lines[i].match(/^(\s*)\d+\.\s+/) &&
            !lines[i].match(/^(\*{3,}|-{3,}|_{3,})\s*$/) &&
            !lines[i].match(/^- \[[ x]\]/) &&
            !(lines[i].includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|:\s]+\s*\|?$/.test(lines[i + 1]))
          ) {
            paraLines.push(lines[i]);
            i++;
          }
          html += `<p class="md-paragraph">${inlineMd(paraLines.join('\n'))}</p>`;
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
      return `<p class="md-paragraph">${escapeHtml(text)}</p>`;
    }
  }

  function renderList(lines: string[], ordered: boolean): string {
    const tag = ordered ? 'ol' : 'ul';
    let html = `<${tag} class="md-${tag}">`;
    for (const line of lines) {
      const content = line.replace(/^(\s*)([-*+]|\d+\.)\s+/, '');
      html += `<li>${inlineMd(content)}</li>`;
    }
    html += `</${tag}>`;
    return html;
  }

  function renderSteps(lines: string[], id: string): string {
    let html = `<div class="step-timeline" id="${id}">`;
    for (let idx = 0; idx < lines.length; idx++) {
      const content = lines[idx].replace(/^(\s*)\d+[\.\)]\s+/, '');
      const stepNum = idx + 1;
      html += `<div class="step-item">
        <div class="step-marker">${stepNum}</div>
        <div class="step-content">${inlineMd(content)}</div>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  // ── Global copy handler ──────────────────────────────────────
  if (typeof window !== 'undefined') {
    (window as any).__aiCopy = (id: string, btn: HTMLElement) => {
      const block = document.getElementById(id);
      if (!block) return;
      const code = block.querySelector('code');
      if (code) {
        navigator.clipboard.writeText(code.textContent ?? '');
        const span = btn.querySelector('span');
        if (span) span.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          if (span) span.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }
    };
    (window as any).__aiToggleList = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('open');
      const span = el.querySelector('.collapsible-toggle span');
      if (span) {
        const isOpen = el.classList.contains('open');
        const count = el.querySelectorAll('li').length;
        span.textContent = isOpen ? 'Collapse' : `Show ${count} items`;
      }
    };
  }

  // ── Message actions ──────────────────────────────────────────
  function getWordCount(msgIdx: number): number {
    const msg = messages[msgIdx];
    if (!msg || msg.role !== 'assistant') return 0;
    return wordCount(msg.content);
  }

  function getReadingTime(msgIdx: number): string {
    const msg = messages[msgIdx];
    if (!msg || msg.role !== 'assistant') return '';
    return readingTime(msg.content);
  }

  function exportAsMarkdown(msgIdx: number): void {
    const msg = messages[msgIdx];
    if (!msg) return;
    const blob = new Blob([msg.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Owners map ───────────────────────────────────────────────
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
      const url = selectedProvider.id === 'custom'
        ? `${selectedProvider.apiBase}/models`
        : `${selectedProvider.apiBase}/api/${selectedProvider.id}/models`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
      const data = await res.json();
      const filtered = (data.data ?? []).filter((m: any) => {
        const out = m.output_modalities;
        if (!out || !Array.isArray(out) || out.length === 0) return true;
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

  // System prompt is managed separately to avoid circular reactivity
  let systemPromptVersion = $state(0);

  $effect(() => {
    const _ = systemPromptVersion;
    buildBarConfig();
  });

  function buildBarConfig() {
    const btns: BarButton[] = [];
    if (isStreaming) {
      btns.push({ icon: IconPlayerStop, label: 'Stop', onClick: () => abortController?.abort(), danger: true });
    } else {
      btns.push({ icon: IconSend, label: 'Send', onClick: sendMessage, primary: true, disabled: !input.trim() || !selectedModel });
    }

    const providers = PROVIDERS.map(p => ({
      id: p.id,
      label: p.label,
      color: p.color,
      active: selectedProvider.id === p.id,
      onClick: () => { selectedProvider = p; },
    }));

    const chatActions: BarButton[] = [
      { icon: IconHistory, label: 'History', onClick: () => { showHistory = !showHistory; if (showHistory) loadHistory(); } },
      { icon: IconPlus, label: 'New Chat', onClick: newChat },
      { icon: IconAdjustments, label: 'Settings', onClick: () => { showExtras = !showExtras; } },
    ];
    if (messages.length > 0) {
      chatActions.push({ icon: IconTrash, label: 'Clear', onClick: clearChat, danger: true });
    }

    barConfig = {
      aiChat: {
        providers,
        chatActions,
      },
      selects: [{
        value: selectedModel,
        options: models.map(m => ({ value: m.id, label: getDisplayName(m), owner: getOwner(m.id) })),
        onchange: (v: string) => { selectedModel = v; },
        label: loadingModels ? 'Loading...' : 'Model',
        variant: 'model',
        accent: selectedProvider.color,
      }],
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

  function updateBarConfig() {
    buildBarConfig();
  }

  function chatUrl(provider: typeof PROVIDERS[0]): string {
    return provider.id === 'custom'
      ? `${provider.apiBase}/chat/completions`
      : `${provider.apiBase}/v1/chat/completions`;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming || !selectedModel) return;
    input = '';
    messages = [...messages, { role: 'user', content: text }];
    isStreaming = true;
    updateBarConfig();

    // Intelligent web search
    let searchInfo: { query: string; source: string; summary: string } | null = null;
    if (needsWebSearch(text)) {
      const query = extractSearchQuery(text);
      searchInfo = await fetchWebSearch(query);
    }

    const apiMessages: { role: string; content: string }[] = [];
    if (systemPrompt.trim()) apiMessages.push({ role: 'system', content: systemPrompt.trim() });
    for (const m of messages) apiMessages.push({ role: m.role, content: m.content });

    // Inject search results as context
    if (searchInfo) {
      const searchContext = `[Web search result for "${searchInfo.query}" from ${searchInfo.source}]\n${searchInfo.summary}\n\nUse this information to enhance your response if relevant. If not relevant, respond from your own knowledge.`;
      apiMessages.push({ role: 'system', content: searchContext });
    }

    messages = [...messages, { role: 'assistant', content: '', _searchInfo: searchInfo }];
    try {
      abortController = new AbortController();
      let res: Response | null = null;
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        res = await fetch(chatUrl(selectedProvider), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, messages: apiMessages, stream: false }),
          signal: abortController.signal,
        });
        if (res.ok) break;
        if (res.status === 402 || res.status === 429) {
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, Math.min(2000 * (attempt + 1), 10000)));
            continue;
          }
        }
        throw new Error(`API error: ${res.status}`);
      }
      if (!res || !res.ok) throw new Error(`API error: ${res?.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      const citations = data.citations ?? [];
      messages = messages.map((m, i) => i === messages.length - 1 ? { ...m, content, citations } : m);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        messages = messages.map((m, i) => i === messages.length - 1 ? { ...m, content: m.content || `Error: ${e.message}` } : m);
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

  // ── Chat History ──────────────────────────────────────────────
  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function generateTitle(): Promise<string> {
    if (messages.length === 0) return 'New Chat';
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return 'New Chat';
    const firstUserMsg = userMsgs[0].content.slice(0, 500);
    const firstAssistantMsg = messages.find(m => m.role === 'assistant')?.content.slice(0, 500) ?? '';
    const titlePrompt = `Generate a concise title (2-6 words) summarizing this conversation. Plain text only, no markdown, no quotes, no punctuation at the end.\n\nUser: ${firstUserMsg}\nAssistant: ${firstAssistantMsg}`;
    try {
      const res = await fetch(chatUrl(selectedProvider), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: [{ role: 'user', content: titlePrompt }], stream: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const title = data.choices?.[0]?.message?.content?.trim();
      return title && title.length > 0 && title.length < 100 ? title : 'New Chat';
    } catch { return 'New Chat'; }
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
      } catch { return null; }
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
        headers: { 'X-Api-Key': apiKey, 'X-Chunk-Index': '0', 'X-File-Name': encodeURIComponent(fileName), 'Content-Type': 'application/json' },
        body: blob,
      });
      if (!chunkRes.ok) throw new Error(`Chunk upload failed: ${chunkRes.status}`);
      const chunkData = await chunkRes.json();
      const finalRes = await fetch('/api/telegram/finalizeUpload', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, type: 'application/json', totalBytes: blob.size, chunks: [chunkData], folderId: folderId ?? null }),
      });
      const finalData = await finalRes.json();
      if (finalData.error) throw new Error(finalData.error);
      return true;
    } catch (e) { console.error('Failed to save chat:', e); return false; }
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
        files = (data.files ?? []).filter((f: any) => f.fileName?.endsWith('.json') && (f.fileName?.includes('history') || f.fileName?.startsWith('chat_')));
      }
      const loaded = new Map<string, ChatHistory>();
      await Promise.allSettled(files.map(async (file: any) => {
        try {
          const resp = await fetch(`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`);
          const text = await resp.text();
          const chat = JSON.parse(text) as ChatHistory;
          if (chat.id && chat.messages?.length > 0 && !loaded.has(chat.id)) loaded.set(chat.id, chat);
        } catch {}
      }));
      chatHistory = [...loaded.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) { console.error('Failed to load history:', e); }
    finally { loadingHistory = false; }
  }

  let saving = false;
  async function deleteExistingFile(chatId: string) {
    try {
      const folderId = await ensureHistoryFolder();
      const res = await fetch(`/api/telegram/ls?api_key=${apiKey}${folderId ? `&folderId=${folderId}` : ''}&_t=${Date.now()}`);
      const data = await res.json();
      const file = (data.files ?? []).find((f: any) => f.fileName === `${chatId}.json`);
      if (file) await fetch('/api/telegram/deleteFile', { method: 'DELETE', headers: { 'X-Api-Key': apiKey, 'X-Meta-File-Id': file.metaFileId } });
    } catch {}
  }

  async function saveChat() {
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0 || saving) return;
    saving = true;
    try {
      const needsTitle = !currentChatId || !chatHistory.find(c => c.id === currentChatId);
      let title = 'New Chat';
      if (needsTitle) { titleGenerating = true; title = await generateTitle(); titleGenerating = false; }
      const now = Date.now();
      const existing = currentChatId ? chatHistory.find(c => c.id === currentChatId) : null;
      const chat: ChatHistory = { id: currentChatId ?? generateId(), title: existing?.title ?? title, messages: [...messages], provider: selectedProvider.id, model: selectedModel, systemPrompt, webSearch, createdAt: existing?.createdAt ?? now, updatedAt: now };
      if (existing) await deleteExistingFile(chat.id);
      const ok = await uploadChatJson(chat);
      if (ok) {
        currentChatId = chat.id;
        if (existing) chatHistory = chatHistory.map(c => c.id === chat.id ? chat : c);
        else chatHistory = [chat, ...chatHistory];
      }
    } catch (e) { console.error('Failed to save chat:', e); }
    finally { saving = false; }
  }

  function loadChat(chat: ChatHistory) {
    currentChatId = chat.id;
    messages = [...chat.messages];
    systemPrompt = chat.systemPrompt;
    webSearch = (chat as any).webSearch ?? false;
    systemPromptVersion++;
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
      if (file) await fetch('/api/telegram/deleteFile', { method: 'DELETE', headers: { 'X-Api-Key': apiKey, 'X-Meta-File-Id': file.metaFileId } });
    } catch {}
    chatHistory = chatHistory.filter(c => c.id !== chatId);
    if (currentChatId === chatId) { currentChatId = null; messages = []; }
  }

  function newChat() { currentChatId = null; messages = []; systemPrompt = ''; webSearch = false; systemPromptVersion++; }

  // Auto-save
  let wasStreaming = false;
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const streaming = isStreaming;
    const userMsgs = messages.filter(m => m.role === 'user');
    const lastMsg = messages[messages.length - 1];
    if (wasStreaming && !streaming && userMsgs.length > 0 && lastMsg?.role === 'assistant' && lastMsg.content) {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => { saveChat(); }, 300);
    }
    wasStreaming = streaming;
  });

  // Load history on mount
  let historyLoaded = false;
  $effect(() => {
    if (apiKey && !historyLoaded) { historyLoaded = true; loadHistory(); }
  });

  // Back to top visibility
  function onMessagesScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    showBackToTop = scrollTop > 400;
  }

  function scrollToTop() {
    messagesContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

<div class="ai-root">
  <!-- History sidebar -->
  {#if showHistory}
    <div class="ai-history-panel">
      <div class="ai-history-header">
        <span>History</span>
        <button class="ai-history-close" onclick={() => showHistory = false}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="ai-history-list">
        {#if loadingHistory}
          <div class="ai-history-empty">Loading...</div>
        {:else if chatHistory.length === 0}
          <div class="ai-history-empty">No saved chats yet</div>
        {:else}
          {#each chatHistory as chat, idx (chat.id + '-' + idx)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="ai-history-item" class:active={currentChatId === chat.id} onclick={() => loadChat(chat)}>
              <div class="ai-history-title">{chat.title}</div>
              <div class="ai-history-meta">{new Date(chat.updatedAt).toLocaleDateString()} &middot; {chat.messages.length} msgs</div>
              <button class="ai-history-delete" onclick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}>
                <IconTrash size={12} />
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Extras panel -->
  {#if showExtras}
    <div class="ai-extras-overlay" onclick={() => showExtras = false}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ai-extras-panel" onclick={(e) => e.stopPropagation()}>
        <div class="ai-extras-header">
          <span>Settings</span>
          <button class="ai-extras-close" onclick={() => showExtras = false}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ai-extras-body">
          <div class="ai-extras-group">
            <label class="ai-extras-label">System Prompt</label>
            <textarea class="ai-extras-textarea" placeholder="Optional system prompt..." value={systemPrompt} oninput={(e) => { systemPrompt = (e.target as HTMLTextAreaElement).value; systemPromptVersion++; }} rows={2}></textarea>
          </div>
          <div class="ai-extras-divider"></div>
          <div class="ai-extras-group">
            <label class="ai-extras-label">Temperature <span class="ai-extras-val">{temperature.toFixed(1)}</span></label>
            <input type="range" class="ai-extras-range" min="0" max="2" step="0.1" bind:value={temperature} />
          </div>
          <div class="ai-extras-group">
            <label class="ai-extras-label">Top P <span class="ai-extras-val">{topP.toFixed(1)}</span></label>
            <input type="range" class="ai-extras-range" min="0" max="1" step="0.05" bind:value={topP} />
          </div>
          <div class="ai-extras-group">
            <label class="ai-extras-label">Max Tokens</label>
            <input type="number" class="ai-extras-number" min="256" max="128000" step="256" bind:value={maxTokens} />
          </div>
          <div class="ai-extras-divider"></div>
          <div class="ai-extras-toggle-row">
            <span>Streaming</span>
            <button class="ai-extras-toggle" class:active={streaming} onclick={() => streaming = !streaming}>
              <span class="ai-extras-toggle-thumb"></span>
            </button>
          </div>
          <div class="ai-extras-toggle-row">
            <span>🌐 Internet</span>
            <button class="ai-extras-toggle" class:active={webSearch} onclick={() => webSearch = !webSearch}>
              <span class="ai-extras-toggle-thumb"></span>
            </button>
          </div>
          <div class="ai-extras-toggle-row">
            <span>Reasoning</span>
            <button class="ai-extras-toggle" class:active={reasoning} onclick={() => reasoning = !reasoning}>
              <span class="ai-extras-toggle-thumb"></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div class="ai-messages" bind:this={messagesContainer} onscroll={onMessagesScroll}>
    {#if messages.length === 0}
      <div class="ai-empty">
        <div class="ai-empty-icon">
          <IconBrain size={40} stroke={1.2} />
        </div>
        <p class="ai-empty-title">Start a conversation</p>
        <p class="ai-empty-sub">Choose a provider and model, then type your message</p>
      </div>
    {:else}
      {#each messages as msg, idx (idx)}
          {#if msg.role === 'user'}
            {@const rtl = isRtl(msg.content)}
            <div class="msg-user-wrap" class:rtl>
              <div class="msg-user-bubble">{msg.content}</div>
            </div>
        {:else}
          {@const rtl = isRtl(msg.content)}
          <div class="msg-assistant-wrap" class:rtl>
            <div class="msg-assistant-card">
              {#if msg.content}
                <div class="md-rendered">{@html renderMarkdown(msg.content, msg.citations)}</div>
              {:else if isStreaming && idx === messages.length - 1}
                <div class="md-rendered msg-streaming"><span class="cursor-blink"></span></div>
              {/if}
              {#if msg._searchInfo}
                <div class="msg-search-indicator">
                  <span class="msg-search-icon">🌐</span>
                  <span class="msg-search-text">Searched the web</span>
                  <button class="msg-search-expand" onclick={() => { msg._showSearchDetail = !msg._showSearchDetail; messages = [...messages]; }}>
                    <span class="chevron" class:open={msg._showSearchDetail}><IconChevronRight size={10} /></span>
                  </button>
                  {#if msg._showSearchDetail}
                    <div class="msg-search-detail">
                      <span class="msg-search-query">Query: {msg._searchInfo!.query}</span>
                      {#if msg._searchInfo!.source}<span class="msg-search-source">Source: {msg._searchInfo!.source}</span>{/if}
                    </div>
                  {/if}
                </div>
              {/if}
              {#if msg.content && msg.role === 'assistant'}
                <div class="msg-meta-bar">
                  <span class="msg-stat"><IconClock size={12} />{getReadingTime(idx)}</span>
                  <span class="msg-stat"><IconBook size={12} />{getWordCount(idx)} words</span>
                  <div class="msg-meta-spacer"></div>
                  <button class="msg-action-btn" onclick={() => copyToClipboard(msg.content, `msg-${idx}`)} title="Copy">
                    {#if copiedStates[`msg-${idx}`]}<IconCheck size={13} />{:else}<IconCopy size={13} />{/if}
                  </button>
                  <button class="msg-action-btn" onclick={() => exportAsMarkdown(idx)} title="Export markdown">
                    <IconDownload size={13} />
                  </button>
                </div>
              {/if}
            </div>
            {#if msg.citations && msg.citations.length > 0}
              <div class="msg-sources">
                <button class="msg-sources-toggle" onclick={() => { msg._showSources = !msg._showSources; messages = [...messages]; }}>
                  <IconLink size={12} />
                  <span>{msg.citations.length} sources</span>
                  <span class="chevron" class:open={msg._showSources}><IconChevronRight size={12} /></span>
                </button>
                {#if msg._showSources}
                  <div class="msg-sources-list">
                    {#each msg.citations as url, i}
                      <a class="source-link" href={url} target="_blank" rel="noopener" title={url}>
                        <img class="source-favicon" src={getFaviconUrl(url)} alt="" width="14" height="14" />
                        <span class="source-num">{i + 1}</span>
                        <span class="source-domain">{getDomain(url)}</span>
                      </a>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <!-- Back to top -->
  {#if showBackToTop}
    <button class="back-to-top" onclick={scrollToTop} title="Back to top">
      <IconArrowUp size={18} />
    </button>
  {/if}
</div>

<style>
  :root {
    --md-bg: #0B0B0D;
    --md-surface: #111215;
    --md-elevated: #17181D;
    --md-border: rgba(255,255,255,.08);
    --md-accent: #7C6CFF;
    --md-success: #41D37D;
    --md-warn: #F7C65C;
    --md-error: #FF6B6B;
    --md-text: #E8E8EC;
    --md-text-2: #8A8A9A;
    --md-text-3: #555566;
  }

  .ai-root {
    display: flex; flex-direction: column;
    position: fixed;
    top: 16px; left: 50%; transform: translateX(-50%);
    width: min(1100px, calc(100vw - 32px));
    height: calc(100vh - 100px);
    overflow: hidden;
    font-family: 'Geist', sans-serif;
    background: color-mix(in srgb, var(--md-bg) 92%, transparent);
    backdrop-filter: blur(20px) saturate(1.3);
    color: var(--md-text);
    border-radius: 20px;
    box-shadow: 0 24px 80px rgba(0,0,0,.5), 0 0 0 1px color-mix(in srgb, var(--md-border) 40%, transparent);
    z-index: 190;
    animation: aiPanelIn .28s cubic-bezier(.16,1,.3,1);
  }
  @keyframes aiPanelIn {
    from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(.97); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }

  /* ── Messages Container ──────────────────────────────────── */
  .ai-messages {
    flex: 1; overflow-y: auto; padding: 24px 24px 40px;
    display: flex; flex-direction: column; gap: 16px;
    scroll-behavior: smooth;
  }

  .ai-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; flex: 1; gap: 12px;
    opacity: .7;
  }
  .ai-empty-icon {
    width: 64px; height: 64px; border-radius: 18px;
    background: linear-gradient(135deg, rgba(124,108,255,.12), rgba(124,108,255,.04));
    display: flex; align-items: center; justify-content: center;
    color: var(--md-accent);
    border: 1px solid rgba(124,108,255,.15);
  }
  .ai-empty-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--md-text); letter-spacing: -.02em; }
  .ai-empty-sub { margin: 0; font-size: 12px; color: var(--md-text-3); }

  /* ── User Message ────────────────────────────────────────── */
  .msg-user-wrap { display: flex; justify-content: flex-end; padding: 0 24px; }
  .msg-user-wrap.rtl { justify-content: flex-start; }
  .msg-user-wrap.rtl .msg-user-bubble { border-radius: 14px 14px 14px 4px; }
  .msg-user-bubble {
    max-width: 420px; padding: 9px 14px;
    background: var(--md-accent); color: #fff;
    border-radius: 14px 14px 4px 14px;
    font-size: 13px; line-height: 1.55;
    word-break: break-word;
  }

  /* ── Assistant Message (Document Card) ───────────────────── */
  .msg-assistant-wrap { display: flex; flex-direction: column; max-width: 1000px; width: 100%; margin: 0 auto; }
  .msg-assistant-wrap.rtl .md-rendered { direction: rtl; text-align: right; }
  .msg-assistant-card {
    background: color-mix(in srgb, var(--md-surface) 85%, transparent);
    border: 1px solid var(--md-border);
    border-radius: 16px;
    padding: 18px 22px;
    transition: border-color .2s;
  }
  .msg-assistant-card:hover { border-color: rgba(255,255,255,.12); }

  .msg-streaming { display: flex; align-items: center; }
  .cursor-blink {
    display: inline-block; width: 2px; height: 18px;
    background: var(--md-accent); border-radius: 1px;
    animation: blink .8s step-end infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }

  .msg-meta-bar {
    display: flex; align-items: center; gap: 12px;
    margin-top: 20px; padding-top: 16px;
    border-top: 1px solid var(--md-border);
  }
  .msg-stat {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: var(--md-text-3); font-weight: 500;
  }
  .msg-meta-spacer { flex: 1; }
  .msg-action-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 8px;
    border: none; background: transparent;
    color: var(--md-text-3); cursor: pointer; transition: all .12s;
  }
  .msg-action-btn:hover { color: var(--md-text); background: rgba(255,255,255,.06); }

  /* ── Search Indicator ────────────────────────────────────── */
  .msg-search-indicator {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 12px; padding: 5px 10px; border-radius: 8px;
    background: rgba(59,130,246,.06); border: 1px solid rgba(59,130,246,.12);
    font-size: 11px; color: #93c5fd; width: fit-content;
  }
  .msg-search-icon { font-size: 12px; }
  .msg-search-text { font-weight: 500; }
  .msg-search-expand {
    display: inline-flex; align-items: center; padding: 0; margin-left: 2px;
    border: none; background: none; color: #93c5fd; cursor: pointer;
  }
  .msg-search-detail {
    display: flex; flex-direction: column; gap: 2px;
    margin-top: 6px; padding-top: 6px;
    border-top: 1px solid rgba(59,130,246,.12);
  }
  .msg-search-query, .msg-search-source {
    font-size: 10px; color: rgba(147,197,253,.6);
    font-family: 'Geist Mono', monospace;
  }

  /* ── Markdown Rendered ───────────────────────────────────── */
  .md-rendered {
    font-size: 15px; line-height: 1.8; color: var(--md-text);
    letter-spacing: -.005em;
  }
  .md-rendered :global(p) { margin: 0 0 16px; max-width: 72ch; }
  .md-rendered :global(p:last-child) { margin-bottom: 0; }
  .md-rendered :global(strong) { font-weight: 600; color: #fff; }
  .md-rendered :global(em) { font-style: italic; }
  .md-rendered :global(del) { text-decoration: line-through; opacity: .5; }

  /* Headings */
  .md-rendered :global(h1), .md-rendered :global(h2), .md-rendered :global(h3),
  .md-rendered :global(h4), .md-rendered :global(h5), .md-rendered :global(h6) {
    font-weight: 700; line-height: 1.25; color: #fff;
    margin: 32px 0 12px; letter-spacing: -.02em;
    position: relative;
  }
  .md-rendered :global(h1) { font-size: 32px; margin-top: 40px; }
  .md-rendered :global(h2) { font-size: 24px; padding-bottom: 10px; border-bottom: 1px solid var(--md-border); }
  .md-rendered :global(h3) { font-size: 20px; }
  .md-rendered :global(h4) { font-size: 17px; }
  .md-rendered :global(h5) { font-size: 15px; }
  .md-rendered :global(h6) { font-size: 14px; color: var(--md-text-2); }

  :global(.heading-anchor) {
    position: absolute; left: -24px; top: 50%; transform: translateY(-50%);
    color: var(--md-text-3); text-decoration: none; font-weight: 400;
    opacity: 0; transition: opacity .15s; font-size: 0.85em;
  }
  :global(h1:hover .heading-anchor), :global(h2:hover .heading-anchor),
  :global(h3:hover .heading-anchor), :global(h4:hover .heading-anchor) { opacity: 1; }

  /* Lists */
  .md-rendered :global(ul), .md-rendered :global(ol) {
    margin: 8px 0 16px; padding-left: 24px;
  }
  .md-rendered :global(li) { margin: 6px 0; line-height: 1.7; }
  .md-rendered :global(li::marker) { color: var(--md-accent); }

  /* Code */
  :global(.code-block) {
    margin: 16px 0; border-radius: 14px;
    background: var(--md-bg); border: 1px solid var(--md-border);
    overflow: hidden;
  }
  :global(.code-header) {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; background: var(--md-elevated);
    border-bottom: 1px solid var(--md-border);
  }
  :global(.code-lang) {
    font-size: 11px; font-weight: 600; color: var(--md-accent);
    text-transform: uppercase; letter-spacing: .5px;
    background: rgba(124,108,255,.1); padding: 2px 8px; border-radius: 6px;
  }
  :global(.code-copy-btn) {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 6px; border: none;
    background: rgba(255,255,255,.06); color: var(--md-text-3);
    font-size: 11px; font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .12s;
  }
  :global(.code-copy-btn:hover) { color: var(--md-text); background: rgba(255,255,255,.1); }
  :global(.code-copy-btn.copied) { color: var(--md-success); }
  :global(.code-pre) {
    margin: 0; padding: 16px 18px; overflow-x: auto;
    font-family: 'Geist Mono', monospace; font-size: 13px;
    line-height: 1.6; color: var(--md-text);
  }
  :global(.code-pre code) { background: none; }

  .md-rendered :global(.md-inline-code) {
    background: rgba(124,108,255,.1); padding: 2px 7px; border-radius: 6px;
    font-family: 'Geist Mono', monospace; font-size: 13px;
    color: var(--md-accent);
  }

  /* Links */
  :global(.md-link) {
    color: var(--md-accent); text-decoration: none; font-weight: 500;
    transition: opacity .12s;
  }
  :global(.md-link:hover) { text-decoration: underline; text-underline-offset: 3px; }
  :global(.md-ext-icon) { margin-left: 3px; opacity: .5; vertical-align: super; }

  /* Images */
  :global(.md-img) {
    max-width: 100%; border-radius: 12px; margin: 12px 0;
    border: 1px solid var(--md-border);
  }

  /* Blockquote */
  :global(.md-blockquote) {
    border-left: 3px solid var(--md-accent);
    margin: 16px 0; padding: 12px 18px;
    color: var(--md-text-2);
    background: rgba(124,108,255,.04);
    border-radius: 0 12px 12px 0;
    font-style: italic;
  }

  /* HR */
  :global(.md-hr) {
    border: none; border-top: 1px solid var(--md-border);
    margin: 32px 0;
  }

  /* Tables */
  :global(.md-table-wrap) {
    overflow-x: auto; margin: 16px 0;
    border-radius: 12px; border: 1px solid var(--md-border);
  }
  .md-rendered :global(table) { border-collapse: collapse; width: 100%; }
  .md-rendered :global(th), .md-rendered :global(td) {
    padding: 10px 14px; font-size: 13px; text-align: left;
    border-bottom: 1px solid var(--md-border); border-right: 1px solid var(--md-border);
  }
  .md-rendered :global(th) {
    background: var(--md-elevated); font-weight: 600; color: #fff;
    position: sticky; top: 0; font-size: 11px;
    text-transform: uppercase; letter-spacing: .4px;
  }
  .md-rendered :global(td) { color: var(--md-text-2); }
  .md-rendered :global(tr:last-child td) { border-bottom: none; }
  .md-rendered :global(tr.odd td) { background: rgba(255,255,255,.02); }
  .md-rendered :global(tr:hover td) { background: rgba(255,255,255,.04); }

  /* ── Callouts ────────────────────────────────────────────── */
  :global(.callout) {
    margin: 20px 0; border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--callout-accent) 25%, transparent);
    background: color-mix(in srgb, var(--callout-accent) 5%, var(--md-surface));
    overflow: hidden;
  }
  :global(.callout-header) {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; font-size: 12px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .5px;
    color: var(--callout-accent);
    border-bottom: 1px solid color-mix(in srgb, var(--callout-accent) 15%, transparent);
  }
  :global(.callout-body) {
    padding: 14px 16px; font-size: 14px; line-height: 1.7;
  }
  :global(.callout-body p) { margin: 0 0 8px; }
  :global(.callout-body p:last-child) { margin-bottom: 0; }

  /* ── Task Lists ──────────────────────────────────────────── */
  :global(.task-list) { margin: 12px 0; display: flex; flex-direction: column; gap: 6px; }
  :global(.task-item) {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 0; cursor: default;
  }
  :global(.task-item input) { display: none; }
  :global(.task-check) {
    width: 18px; height: 18px; border-radius: 5px;
    border: 2px solid var(--md-text-3); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: all .15s;
  }
  :global(.task-item input:checked + .task-check) {
    background: var(--md-success); border-color: var(--md-success);
  }
  :global(.task-item input:checked + .task-check::after) {
    content: ''; display: block; width: 5px; height: 9px;
    border: solid #fff; border-width: 0 2px 2px 0;
    transform: rotate(45deg) translate(-1px, -1px);
  }
  :global(.task-text) { font-size: 14px; line-height: 1.5; }
  :global(.task-text.done) { text-decoration: line-through; opacity: .5; }

  /* ── Step Timeline ───────────────────────────────────────── */
  :global(.step-timeline) {
    margin: 20px 0; padding-left: 0; list-style: none;
    display: flex; flex-direction: column; gap: 0;
  }
  :global(.step-item) {
    display: flex; gap: 16px; padding: 14px 0;
    border-left: 2px solid var(--md-border); margin-left: 12px;
    padding-left: 24px; position: relative;
  }
  :global(.step-item:last-child) { border-left-color: transparent; }
  :global(.step-marker) {
    position: absolute; left: -13px; top: 14px;
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--md-accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
    box-shadow: 0 0 0 4px var(--md-bg);
  }
  :global(.step-content) {
    font-size: 14px; line-height: 1.6; padding-top: 2px;
  }

  /* ── Collapsible Lists ───────────────────────────────────── */
  :global(.collapsible-list) {
    margin: 12px 0; border-radius: 12px;
    border: 1px solid var(--md-border); overflow: hidden;
  }
  :global(.collapsible-toggle) {
    display: flex; align-items: center; gap: 6px;
    width: 100%; padding: 10px 14px;
    background: var(--md-elevated); border: none;
    color: var(--md-text-2); font-size: 12px; font-weight: 600;
    font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .12s;
  }
  :global(.collapsible-toggle:hover) { color: var(--md-text); background: rgba(255,255,255,.04); }
  :global(.collapsible-toggle svg) { transition: transform .2s; }
  :global(.collapsible-list.open .collapsible-toggle svg) { transform: rotate(180deg); }
  :global(.collapsible-content) {
    max-height: 0; overflow: hidden; transition: max-height .3s ease;
  }
  :global(.collapsible-list.open .collapsible-content) { max-height: 2000px; }
  :global(.collapsible-content ul), :global(.collapsible-content ol) {
    padding: 12px 16px 12px 36px; margin: 0;
  }

  /* ── Think / Reasoning Block ──────────────────────────────── */
  :global(.think-block) {
    margin: 12px 0; border-radius: 12px;
    border: 1px solid var(--md-border);
    background: color-mix(in srgb, var(--md-accent) 4%, var(--md-surface));
    overflow: hidden;
  }
  :global(.think-summary) {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px; cursor: pointer;
    font-size: 11px; font-weight: 600; color: var(--md-text-2);
    user-select: none; font-family: 'Geist', sans-serif;
    transition: color .12s;
  }
  :global(.think-summary:hover) { color: var(--md-text); }
  :global(.think-summary svg) { flex-shrink: 0; opacity: .6; }
  :global(.think-content) {
    padding: 0 12px 10px; font-size: 12px; line-height: 1.6;
    color: var(--md-text-3); white-space: pre-wrap;
    font-family: 'Geist', sans-serif;
  }

  /* ── Citations ───────────────────────────────────────────── */
  :global(.cite-ref a) {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 4px;
    background: rgba(124,108,255,.15); color: var(--md-accent);
    border-radius: 5px; font-size: 10px; font-weight: 700;
    text-decoration: none; vertical-align: super;
    transition: all .12s;
  }
  :global(.cite-ref a:hover) { background: var(--md-accent); color: #fff; }

  /* ── Sources ─────────────────────────────────────────────── */
  .msg-sources { margin-top: 8px; }
  .msg-sources-toggle {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 8px; width: fit-content;
    border: none; background: rgba(255,255,255,.04);
    color: var(--md-text-3); font-size: 11px; font-weight: 600;
    font-family: 'Geist', sans-serif; cursor: pointer; transition: all .12s;
  }
  .msg-sources-toggle:hover { color: var(--md-text-2); background: rgba(255,255,255,.06); }
  .chevron { display: flex; transition: transform .15s; }
  .chevron.open { transform: rotate(90deg); }
  .msg-sources-list {
    display: flex; flex-direction: column; gap: 2px;
    padding: 6px; margin-top: 6px;
    background: var(--md-elevated); border: 1px solid var(--md-border);
    border-radius: 10px; max-height: 200px; overflow-y: auto;
  }
  .source-link {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; border-radius: 8px; text-decoration: none;
    color: var(--md-text-2); font-size: 12px; transition: background .1s;
  }
  .source-link:hover { background: rgba(255,255,255,.04); color: var(--md-text); }
  .source-favicon { border-radius: 3px; flex-shrink: 0; }
  .source-num { font-size: 10px; font-weight: 700; color: var(--md-accent); min-width: 14px; text-align: center; }
  .source-domain { color: var(--md-text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Back to Top ─────────────────────────────────────────── */
  .back-to-top {
    position: absolute; bottom: 20px; left: 20px;
    width: 36px; height: 36px; border-radius: 10px;
    border: 1px solid var(--md-border);
    background: var(--md-elevated); color: var(--md-text-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 50;
    box-shadow: 0 4px 20px rgba(0,0,0,.3);
    transition: all .2s;
    animation: fadeUp .2s ease-out;
  }
  .back-to-top:hover { color: var(--md-text); border-color: rgba(255,255,255,.15); transform: translateY(-2px); }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  /* ── History Panel ───────────────────────────────────────── */
  .ai-history-panel {
    position: absolute; top: 0; left: 0; bottom: 0;
    width: 260px; background: var(--md-surface); border-right: 1px solid var(--md-border);
    display: flex; flex-direction: column; z-index: 10;
    border-radius: 20px 0 0 20px;
  }
  .ai-history-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--md-border);
    font-size: 13px; font-weight: 600; color: var(--md-text);
  }
  .ai-history-close {
    background: none; border: none; color: var(--md-text-3); cursor: pointer;
    padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  }
  .ai-history-close:hover { color: var(--md-text); background: rgba(255,255,255,.06); }
  .ai-history-list { flex: 1; overflow-y: auto; padding: 8px; }
  .ai-history-empty { text-align: center; color: var(--md-text-3); font-size: 12px; padding: 24px; }
  .ai-history-item {
    display: flex; flex-direction: column; gap: 3px;
    width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px;
    border: none; background: transparent;
    color: var(--md-text); font-family: 'Geist', sans-serif; cursor: pointer;
    transition: all .12s; position: relative;
  }
  .ai-history-item:hover { background: rgba(255,255,255,.04); }
  .ai-history-item.active { background: rgba(124,108,255,.08); }
  .ai-history-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px; }
  .ai-history-meta { font-size: 11px; color: var(--md-text-3); }
  .ai-history-delete {
    position: absolute; top: 10px; right: 10px;
    background: none; border: none; color: var(--md-text-3); cursor: pointer;
    padding: 2px; border-radius: 4px; opacity: 0; transition: opacity .12s;
    display: flex; align-items: center; justify-content: center;
  }
  .ai-history-item:hover .ai-history-delete { opacity: 1; }
  .ai-history-delete:hover { color: var(--md-error); background: rgba(255,107,107,.08); }

  /* ── Extras Panel ──────────────────────────────────────── */
  .ai-extras-overlay {
    position: absolute; inset: 0; z-index: 20;
    background: rgba(0,0,0,.5); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    border-radius: 20px;
  }
  .ai-extras-panel {
    background: var(--md-surface); border: 1px solid var(--md-border);
    border-radius: 16px; width: 340px; max-width: 90vw;
    box-shadow: 0 20px 60px rgba(0,0,0,.5);
    animation: extrasIn .2s cubic-bezier(.16,1,.3,1);
  }
  @keyframes extrasIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  .ai-extras-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--md-border);
    font-size: 13px; font-weight: 600; color: var(--md-text);
  }
  .ai-extras-close {
    background: none; border: none; color: var(--md-text-3); cursor: pointer;
    padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  }
  .ai-extras-close:hover { color: var(--md-text); background: rgba(255,255,255,.06); }
  .ai-extras-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .ai-extras-group { display: flex; flex-direction: column; gap: 6px; }
  .ai-extras-label {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; font-weight: 500; color: var(--md-text-2);
  }
  .ai-extras-val { font-family: 'Geist Mono', monospace; color: var(--md-accent); font-size: 11px; }
  .ai-extras-range {
    width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
    background: var(--md-elevated); border-radius: 2px; outline: none;
  }
  .ai-extras-range::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
    background: var(--md-accent); cursor: pointer; border: 2px solid var(--md-surface);
    box-shadow: 0 1px 4px rgba(0,0,0,.3);
  }
  .ai-extras-number {
    width: 100%; background: var(--md-elevated); border: 1px solid var(--md-border);
    border-radius: 8px; padding: 6px 10px; outline: none;
    color: var(--md-text); font-size: 12px; font-family: 'Geist Mono', monospace;
  }
  .ai-extras-number:focus { border-color: var(--md-accent); }
  .ai-extras-textarea {
    width: 100%; background: var(--md-elevated); border: 1px solid var(--md-border);
    border-radius: 8px; padding: 6px 10px; outline: none; resize: vertical;
    color: var(--md-text); font-size: 12px; font-family: 'Geist', sans-serif;
    line-height: 1.5; min-height: 40px;
  }
  .ai-extras-textarea:focus { border-color: var(--md-accent); }
  .ai-extras-textarea::placeholder { color: var(--md-text-3); }
  .ai-extras-divider { border-top: 1px solid var(--md-border); }
  .ai-extras-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; font-weight: 500; color: var(--md-text-2);
  }
  .ai-extras-toggle {
    width: 36px; height: 20px; border-radius: 10px;
    border: none; background: var(--md-elevated); cursor: pointer;
    position: relative; transition: background .2s; padding: 0;
  }
  .ai-extras-toggle.active { background: var(--md-accent); }
  .ai-extras-toggle-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #fff; transition: transform .2s;
    box-shadow: 0 1px 3px rgba(0,0,0,.3);
  }
  .ai-extras-toggle.active .ai-extras-toggle-thumb { transform: translateX(16px); }

  /* ── Scrollbar ───────────────────────────────────────────── */
  .ai-messages::-webkit-scrollbar { width: 6px; }
  .ai-messages::-webkit-scrollbar-track { background: transparent; }
  .ai-messages::-webkit-scrollbar-thumb { background: var(--md-border); border-radius: 3px; }

  @media (max-width: 700px) {
    .ai-root {
      top: 8px; left: 8px; right: 8px; transform: none;
      width: auto; height: calc(100vh - 80px);
      border-radius: 16px;
    }
    @keyframes aiPanelIn {
      from { opacity: 0; transform: translateY(12px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .ai-messages { padding: 16px 14px 80px; }
    .msg-user-wrap { padding: 0 14px; }
    .msg-assistant-card { padding: 18px 16px; border-radius: 14px; }
    .msg-user-bubble { max-width: 90%; }
    .ai-history-panel { width: 220px; border-radius: 16px 0 0 16px; }
  }
</style>
