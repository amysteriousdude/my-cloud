<script lang="ts">
  import {
    IconSearch, IconBook, IconLanguage,
    IconLoader2, IconLetterCaseLower, IconAlphabetGreek,
    IconHash, IconWorld, IconX, IconMoodHappy, IconClock,
  } from '@tabler/icons-svelte';

  let query = $state('');
  let loading = $state(false);
  let activeSource = $state('all');
  let results: Record<string, any> = $state({});
  let suggestions: string[] = $state([]);
  let showSuggestions = $state(false);
  let suggestionIdx = $state(-1);
  let suggestDebounce: ReturnType<typeof setTimeout>;

  const SOURCES = [
    { id: 'all',        label: 'All',          icon: IconSearch },
    { id: 'freedic',    label: 'Free Dict',    icon: IconBook },
    { id: 'wiktionary', label: 'Wiktionary',   icon: IconLanguage },
    { id: 'datamuse',   label: 'Datamuse',     icon: IconHash },
    { id: 'lastletter', label: 'Last Letter',  icon: IconLetterCaseLower },
    { id: 'oxford',     label: 'Oxford',       icon: IconAlphabetGreek },
    { id: 'wordnet',    label: 'WordNet',      icon: IconWorld },
    { id: 'urban',      label: 'Urban Dict',   icon: IconMoodHappy },
    { id: 'etymology',  label: 'Etymology',    icon: IconClock },
  ];

  const COLORS: Record<string, string> = {
    freedic: '#4ade80', wiktionary: '#60a5fa', datamuse: '#c084fc',
    lastletter: '#fb923c', oxford: '#34d399', wordnet: '#facc15',
    urban: '#ef4444', etymology: '#a78bfa',
  };

  function fetchTimeout(url: string, opts?: RequestInit, ms = 5000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
  }

  function onInput() {
    clearTimeout(suggestDebounce);
    suggestionIdx = -1;
    if (query.trim().length < 2) { suggestions = []; showSuggestions = false; return; }
    suggestDebounce = setTimeout(fetchSuggestions, 180);
  }

  async function fetchSuggestions() {
    const q = query.trim();
    if (q.length < 2) return;
    try {
      const r = await fetchTimeout(`https://api.datamuse.com/sug?s=${encodeURIComponent(q)}&max=8`, undefined, 2500);
      if (!r.ok) return;
      const d = await r.json();
      suggestions = d.map((s: any) => s.word);
      showSuggestions = suggestions.length > 0;
    } catch {}
  }

  function pickSuggestion(w: string) {
    query = w; showSuggestions = false; suggestions = []; search();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); suggestionIdx = Math.min(suggestionIdx + 1, suggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); suggestionIdx = Math.max(suggestionIdx - 1, -1); }
    else if (e.key === 'Enter') {
      if (suggestionIdx >= 0 && suggestions[suggestionIdx]) pickSuggestion(suggestions[suggestionIdx]);
      else search();
    } else if (e.key === 'Escape') { showSuggestions = false; }
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    loading = true; results = {}; showSuggestions = false;
    const srcs = activeSource === 'all' ? SOURCES.filter(s => s.id !== 'all') : SOURCES.filter(s => s.id === activeSource);
    await Promise.allSettled(srcs.map(s => fetchSource(s.id, q)));
    loading = false;
  }

  async function fetchSource(id: string, word: string) {
    try {
      if (id === 'freedic') return await fetchFreeDict(word);
      if (id === 'wiktionary') return await fetchWiktionary(word);
      if (id === 'datamuse') return await fetchDatamuse(word);
      if (id === 'lastletter') return await fetchLastLetter(word);
      if (id === 'oxford') return await fetchOxford(word);
      if (id === 'wordnet') return await fetchWordNet(word);
      if (id === 'urban') return await fetchUrban(word);
      if (id === 'etymology') return await fetchEtymology(word);
    } catch (e: any) {
      if (e.name !== 'AbortError') results[id] = { error: e.message || 'Failed' };
    }
  }

  async function fetchFreeDict(word: string) {
    const r = await fetchTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!r.ok) throw new Error('No results');
    const d = await r.json();
    results['freedic'] = (Array.isArray(d) ? d : [d]).slice(0, 2).map((e: any) => ({
      word: e.word,
      phonetic: e.phonetic || e.phonetics?.find((p: any) => p.text)?.text || '',
      meanings: e.meanings?.map((m: any) => ({
        pos: m.partOfSpeech,
        defs: m.definitions?.slice(0, 3).map((df: any) => ({ def: df.definition, ex: df.example, syns: df.synonyms?.slice(0, 3) })),
      })),
    }));
  }

  async function fetchWiktionary(word: string) {
    const r = await fetchTimeout(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
    if (!r.ok) throw new Error('No results');
    const d = await r.json();
    results['wiktionary'] = (d['en'] || []).map((e: any) => ({
      pos: e.partOfSpeech,
      defs: e.definitions?.slice(0, 3).map((df: any) => ({
        def: (df.definition || '').replace(/<[^>]*>/g, ''),
        ex: df.examples?.[0]?.replace(/<[^>]*>/g, ''),
      })),
    }));
  }

  async function fetchDatamuse(word: string) {
    const [defR, rhymeR, synR, slR] = await Promise.allSettled([
      fetchTimeout(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`, undefined, 3000),
      fetchTimeout(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=8`, undefined, 3000),
      fetchTimeout(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=8`, undefined, 3000),
      fetchTimeout(`https://api.datamuse.com/words?sl=${encodeURIComponent(word)}&max=5`, undefined, 3000),
    ]);
    const get = async (r: PromiseSettledResult<Response>) => r.status === 'fulfilled' && r.value.ok ? await r.value.json() : [];
    const defs = await get(defR), rhymes = await get(rhymeR), syns = await get(synR), sl = await get(slR);
    results['datamuse'] = {
      definitions: defs[0]?.defs?.map((d: string) => { const [p, def] = d.split('\t'); return { pos: p, def }; }),
      rhymes: rhymes.filter((r: any) => r.word !== word),
      synonyms: syns.filter((s: any) => s.word !== word),
      soundsLike: sl.filter((s: any) => s.word !== word),
    };
  }

  async function fetchLastLetter(word: string) {
    const last = word.slice(-1).toLowerCase();
    const r = await fetchTimeout(`https://api.datamuse.com/words?sp=*${last}&md=d&max=20`, undefined, 4000);
    if (!r.ok) throw new Error('No results');
    const d = await r.json();
    results['lastletter'] = {
      lastLetter: last,
      words: d.filter((w: any) => w.word.endsWith(last) && w.word.length >= 3).map((w: any) => ({
        word: w.word,
        defs: w.defs?.map((df: string) => { const [p, def] = df.split('\t'); return { pos: p, def }; })?.slice(0, 1),
      })),
    };
  }

  async function fetchOxford(word: string) {
    try {
      const r = await fetchTimeout(
        `https://od-api.oxforddictionaries.com/api/v2/entries/en-us/${encodeURIComponent(word.toLowerCase())}`,
        { headers: { app_id: 'public', app_key: 'public' } }, 4000
      );
      if (!r.ok) throw new Error('No results');
      const d = await r.json();
      const entries = d.results?.[0]?.lexicalEntries || [];
      results['oxford'] = entries.slice(0, 3).map((le: any) => ({
        pos: le.lexicalCategory?.id,
        defs: le.entries?.[0]?.senses?.slice(0, 3).map((s: any) => ({
          def: s.definitions?.[0], ex: s.examples?.[0]?.text,
          syns: s.synonyms?.slice(0, 2).map((sy: any) => sy.text),
        })),
        pronunciation: le.entries?.[0]?.pronunciations?.[0]?.phoneticSpelling,
      }));
    } catch { results['oxford'] = { error: 'No results' }; }
  }

  async function fetchUrban(word: string) {
    const r = await fetchTimeout(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`, undefined, 4000);
    if (!r.ok) throw new Error('No results');
    const d = await r.json();
    if (!d.list?.length) throw new Error('No results');
    results['urban'] = d.list.slice(0, 4).map((e: any) => ({
      word: e.word,
      definition: e.definition?.replace(/\[/g, '').replace(/\]/g, ''),
      example: e.example?.replace(/\[/g, '').replace(/\]/g, ''),
      author: e.author,
      thumbsUp: e.thumbs_up,
      thumbsDown: e.thumbs_down,
      date: e.written_on?.slice(0, 10),
    }));
  }

  async function fetchEtymology(word: string) {
    const r = await fetchTimeout(`https://en.wiktionary.org/api/rest_v1/page/etymology/${encodeURIComponent(word)}`, undefined, 4000);
    if (!r.ok) throw new Error('No results');
    const d = await r.json();
    const etymologies = d.etymologies || [];
    if (!etymologies.length) throw new Error('No results');
    results['etymology'] = etymologies.slice(0, 3).map((e: any) => ({
      language: e.language,
      content: (e.content || []).map((c: any) => c.text || '').filter(Boolean).join(' '),
    }));
  }

  async function fetchWordNet(word: string) {
    const r = await fetchTimeout(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=r&max=1`, undefined, 3000);
    if (!r.ok) throw new Error('No results');
    const d = await r.json();
    if (d.length) {
      results['wordnet'] = {
        word: d[0].word, score: d[0].score,
        defs: d[0].defs?.map((df: string) => { const [p, def] = df.split('\t'); return { pos: p, def }; }),
      };
    } else results['wordnet'] = { error: 'No results' };
  }
</script>

<div class="dict-root">
  <div class="dict-header">
    <div class="dict-title"><IconBook size={20} stroke={1.8}/><span>Dictionary</span></div>
    <p class="dict-sub">Definitions, synonyms, rhymes & word games</p>
  </div>

  <div class="dict-search-row">
    <div class="dict-input-wrap">
      <IconSearch size={16} stroke={1.8}/>
      <input type="text" class="dict-input"
        placeholder="Type a word... (try sphenopalatineganglioneuralgia)"
        bind:value={query} oninput={onInput} onkeydown={onKeydown}
        onblur={() => setTimeout(() => showSuggestions = false, 150)}
        onfocus={() => { if (suggestions.length) showSuggestions = true; }}
        autocomplete="off" spellcheck="false"/>
      {#if query}
        <button class="dict-clear" onclick={() => { query = ''; results = {}; suggestions = []; }}>
          <IconX size={14} stroke={2}/>
        </button>
      {/if}
      {#if showSuggestions && suggestions.length}
        <div class="dict-suggest">
          {#each suggestions as s, i}
            <button class="dict-sug-item" class:active={i === suggestionIdx}
              onmousedown={() => pickSuggestion(s)}>
              <IconSearch size={12} stroke={2}/><span>{s}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="dict-go" onclick={search} disabled={loading || !query.trim()}>
      {#if loading}<IconLoader2 size={16} stroke={2} class="spin"/>{:else}Search{/if}
    </button>
  </div>

  <div class="dict-chips">
    {#each SOURCES as src}
      <button class="dict-chip" class:active={activeSource === src.id}
        style={activeSource === src.id ? `--c:${COLORS[src.id]||'var(--accent)'}` : ''}
        onclick={() => activeSource = src.id}>
        <src.icon size={12} stroke={1.8}/>{src.label}
      </button>
    {/each}
  </div>

  <div class="dict-results">
    {#if loading}
      <div class="dict-loading"><IconLoader2 size={28} stroke={1.5} class="spin"/><span>Searching...</span></div>
    {:else if Object.keys(results).length === 0}
      <div class="dict-empty"><IconBook size={44} stroke={1}/><span>Search a word to see definitions, synonyms, rhymes & more</span></div>
    {:else}
      {#each Object.entries(results) as [sid, data]}
        {#if data && !data.error}
          <div class="dict-card" style="border-left-color:{COLORS[sid]||'var(--border)'}">
            <div class="dict-card-hdr">
              <span class="dict-card-src" style="color:{COLORS[sid]}">{SOURCES.find(s=>s.id===sid)?.label}</span>
            </div>

            {#if sid === 'freedic' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-word">{entry.word}</div>
                {#if entry.phonetic}<div class="dict-phon">{entry.phonetic}</div>{/if}
                {#if entry.meanings}
                  {#each entry.meanings as m}
                    <div class="dict-pos">{m.pos}</div>
                    {#each m.defs as d, i}
                      <div class="dict-def"><b>{i+1}.</b> {d.def}</div>
                      {#if d.ex}<div class="dict-ex">"{d.ex}"</div>{/if}
                      {#if d.syns?.length}<div class="dict-syns">Syn: {d.syns.join(', ')}</div>{/if}
                    {/each}
                  {/each}
                {/if}
              {/each}

            {:else if sid === 'wiktionary' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-pos">{entry.pos}</div>
                {#each entry.defs as d, i}
                  <div class="dict-def"><b>{i+1}.</b> {@html d.def}</div>
                  {#if d.ex}<div class="dict-ex">"{d.ex}"</div>{/if}
                {/each}
              {/each}

            {:else if sid === 'datamuse'}
              {#if data.definitions?.length}
                <div class="dict-sub">Definitions</div>
                {#each data.definitions as d, i}
                  <div class="dict-def"><b>{i+1}.</b> <span class="dict-pos">{d.pos}</span> {d.def}</div>
                {/each}
              {/if}
              {#if data.rhymes?.length}
                <div class="dict-sub">Rhymes</div>
                <div class="dict-tags">{#each data.rhymes as r}<span class="dict-tag">{r.word}</span>{/each}</div>
              {/if}
              {#if data.synonyms?.length}
                <div class="dict-sub">Related Words</div>
                <div class="dict-tags">{#each data.synonyms as s}<span class="dict-tag">{s.word}</span>{/each}</div>
              {/if}
              {#if data.soundsLike?.length}
                <div class="dict-sub">Sounds Like</div>
                <div class="dict-tags">{#each data.soundsLike as s}<span class="dict-tag">{s.word}</span>{/each}</div>
              {/if}

            {:else if sid === 'lastletter'}
              <div class="dict-word">Words ending in "{data.lastLetter}"</div>
              <div class="dict-grid">
                {#each data.words as w}
                  <div class="dict-grid-item">
                    <span class="dict-grid-word">{w.word}</span>
                    {#if w.defs?.length}<span class="dict-grid-def">{w.defs[0].def}</span>{/if}
                  </div>
                {/each}
              </div>
              <div class="dict-lastletter-link">
                <a href="https://lastletterlibrary.com" target="_blank" rel="noopener">
                  Open Last Letter Library <IconWorld size={12} stroke={2}/>
                </a>
              </div>

            {:else if sid === 'oxford' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-pos">{entry.pos}</div>
                {#if entry.pronunciation}<div class="dict-phon">/{entry.pronunciation}/</div>{/if}
                {#each entry.defs as d, i}
                  <div class="dict-def"><b>{i+1}.</b> {d.def}</div>
                  {#if d.ex}<div class="dict-ex">"{d.ex}"</div>{/if}
                  {#if d.syns?.length}<div class="dict-syns">Syn: {d.syns.join(', ')}</div>{/if}
                {/each}
              {/each}

            {:else if sid === 'urban'}
              {#each data as entry}
                <div class="dict-word">{entry.word}</div>
                <div class="dict-def">{entry.definition}</div>
                {#if entry.example}<div class="dict-ex">"{entry.example}"</div>{/if}
                <div class="dict-urban-meta">
                  <span>👍 {entry.thumbsUp}</span>
                  <span>👎 {entry.thumbsDown}</span>
                  <span>by {entry.author}</span>
                  <span>{entry.date}</span>
                </div>
              {/each}

            {:else if sid === 'etymology'}
              {#each data as entry}
                <div class="dict-pos">{entry.language}</div>
                <div class="dict-def">{@html entry.content}</div>
              {/each}

            {:else if sid === 'wordnet'}
              <div class="dict-word">{data.word}</div>
              {#if data.defs?.length}
                {#each data.defs as d, i}
                  <div class="dict-def"><b>{i+1}.</b> <span class="dict-pos">{d.pos}</span> {d.def}</div>
                {/each}
              {/if}
            {/if}
          </div>
        {:else if data?.error}
          <div class="dict-card dict-card-err" style="border-left-color:var(--red)">
            <div class="dict-card-hdr">
              <span class="dict-card-src" style="color:{COLORS[sid]}">{SOURCES.find(s=>s.id===sid)?.label}</span>
            </div>
            <div class="dict-no">No results</div>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .dict-root{padding:24px 32px;max-width:960px;margin:0 auto;height:100%;display:flex;flex-direction:column}
  .dict-header{margin-bottom:16px}
  .dict-title{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;color:var(--text-1)}
  .dict-sub{color:var(--text-3);font-size:13px;margin-top:4px}

  .dict-search-row{display:flex;gap:10px;margin-bottom:14px}
  .dict-input-wrap{flex:1;display:flex;align-items:center;gap:8px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;padding:0 12px;position:relative;transition:border-color .15s}
  .dict-input-wrap:focus-within{border-color:var(--accent)}
  .dict-input-wrap :global(svg){color:var(--text-3);flex-shrink:0}
  .dict-input{flex:1;background:none;border:none;outline:none;color:var(--text-1);font-size:14px;font-family:'Geist',sans-serif;padding:10px 0}
  .dict-input::placeholder{color:var(--text-3)}
  .dict-clear{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:4px;transition:.13s;display:flex}
  .dict-clear:hover{color:var(--text-1);background:var(--hover)}

  .dict-suggest{position:absolute;top:100%;left:0;right:0;z-index:50;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;margin-top:4px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.2)}
  .dict-sug-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:none;border:none;width:100%;text-align:left;color:var(--text-2);font-size:13px;font-family:'Geist',sans-serif;cursor:pointer;transition:.1s}
  .dict-sug-item:hover,.dict-sug-item.active{background:var(--hover);color:var(--text-1)}

  .dict-go{display:flex;align-items:center;gap:6px;padding:0 18px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;font-family:'Geist',sans-serif;cursor:pointer;transition:.15s;white-space:nowrap}
  .dict-go:hover{opacity:.9}
  .dict-go:disabled{opacity:.5;cursor:not-allowed}

  .dict-chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:16px}
  .dict-chip{display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11px;font-weight:500;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;white-space:nowrap}
  .dict-chip:hover{border-color:var(--border-hover);color:var(--text-1)}
  .dict-chip.active{border-color:var(--c,var(--accent));color:var(--c,var(--accent));background:color-mix(in srgb,var(--c,var(--accent)) 8%,transparent)}

  .dict-results{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-bottom:32px}
  .dict-loading,.dict-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 0;color:var(--text-3);font-size:14px}

  .dict-card{background:var(--bg-3);border:1px solid var(--border);border-radius:12px;border-left:3px solid var(--border);padding:14px 16px}
  .dict-card-err{opacity:.7}
  .dict-card-hdr{margin-bottom:8px}
  .dict-card-src{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}

  .dict-word{font-size:17px;font-weight:700;color:var(--text-1);margin-bottom:2px}
  .dict-phon{font-size:13px;color:var(--text-2);font-family:'Geist Mono',monospace;margin-bottom:6px}
  .dict-pos{display:inline-block;font-size:10.5px;font-weight:600;color:var(--accent);font-style:italic;margin:6px 0 3px;padding:2px 6px;background:rgba(99,102,241,.08);border-radius:4px}
  .dict-sub{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);margin:8px 0 4px}
  .dict-def{font-size:13px;color:var(--text-1);line-height:1.5;margin:2px 0;padding-left:2px}
  .dict-ex{font-size:12px;color:var(--text-2);font-style:italic;margin:2px 0 3px 16px;padding-left:8px;border-left:2px solid var(--border)}
  .dict-syns{font-size:11.5px;color:var(--text-3);margin:2px 0 3px 16px}
  .dict-tags{display:flex;gap:5px;flex-wrap:wrap}
  .dict-tag{display:inline-block;padding:3px 7px;border-radius:5px;background:var(--bg-2);border:1px solid var(--border);font-size:11.5px;color:var(--text-2);font-family:'Geist Mono',monospace}
  .dict-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:7px;margin-top:6px}
  .dict-grid-item{display:flex;flex-direction:column;gap:2px;padding:7px 9px;border-radius:7px;background:var(--bg-2);border:1px solid var(--border)}
  .dict-grid-word{font-size:12.5px;font-weight:600;color:var(--text-1)}
  .dict-grid-def{font-size:11px;color:var(--text-3);line-height:1.4}
  .dict-lastletter-link{margin-top:10px}
  .dict-lastletter-link a{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--accent);text-decoration:none;font-weight:500}
  .dict-lastletter-link a:hover{text-decoration:underline}
  .dict-urban-meta{display:flex;gap:12px;font-size:11px;color:var(--text-3);margin-top:6px;flex-wrap:wrap}
  .dict-no{font-size:13px;color:var(--text-3);font-style:italic}

  :global(.spin){animation:spin 1s linear infinite}
  @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

  @media(max-width:600px){
    .dict-root{padding:16px}
    .dict-search-row{flex-direction:column}
    .dict-go{justify-content:center;padding:10px}
    .dict-chips{gap:4px}
    .dict-chip{padding:4px 7px;font-size:10px}
    .dict-grid{grid-template-columns:1fr 1fr}
  }
</style>
