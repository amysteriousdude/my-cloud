<script lang="ts">
  import { onMount } from 'svelte';
  import {
    IconSearch, IconBook, IconLanguage, IconLetterA,
    IconRefresh, IconExternalLink, IconLoader2,
    IconLetterCaseLower, IconAlphabetGreek, IconAbacus,
    IconBook2, IconHash, IconStar,
  } from '@tabler/icons-svelte';

  let query = $state('');
  let loading = $state(false);
  let activeSource = $state('all');
  let results: Record<string, any> = $state({});
  let error = $state('');

  const SOURCES = [
    { id: 'all',        label: 'All Sources',         icon: IconSearch },
    { id: 'freedic',    label: 'Free Dictionary',     icon: IconBook },
    { id: 'wiktionary', label: 'Wiktionary',           icon: IconLanguage },
    { id: 'merriam',    label: 'Merriam-Webster',      icon: IconBook2 },
    { id: 'wordsapi',   label: 'WordsAPI',             icon: IconLetterA },
    { id: 'datamuse',   label: 'Datamuse',             icon: IconHash },
    { id: 'lastletter', label: 'Last Letter Library',  icon: IconLetterCaseLower },
    { id: 'oxford',     label: 'Oxford Learner',       icon: IconAlphabetGreek },
  ];

  const SOURCE_COLORS: Record<string, string> = {
    freedic: '#4ade80',
    wiktionary: '#60a5fa',
    merriam: '#f472b6',
    wordsapi: '#facc15',
    datamuse: '#c084fc',
    lastletter: '#fb923c',
    oxford: '#34d399',
  };

  async function search() {
    if (!query.trim()) return;
    loading = true;
    error = '';
    results = {};

    const sources = activeSource === 'all'
      ? SOURCES.filter(s => s.id !== 'all')
      : SOURCES.filter(s => s.id === activeSource);

    const promises = sources.map(s => fetchSource(s.id, query.trim()));
    await Promise.allSettled(promises);
    loading = false;
  }

  async function fetchSource(sourceId: string, word: string) {
    try {
      switch (sourceId) {
        case 'freedic':
          await fetchFreeDict(word);
          break;
        case 'wiktionary':
          await fetchWiktionary(word);
          break;
        case 'merriam':
          await fetchMerriam(word);
          break;
        case 'wordsapi':
          await fetchWordsAPI(word);
          break;
        case 'datamuse':
          await fetchDatamuse(word);
          break;
        case 'lastletter':
          await fetchLastLetter(word);
          break;
        case 'oxford':
          await fetchOxford(word);
          break;
      }
    } catch (e: any) {
      results[sourceId] = { error: e.message || 'Failed to fetch' };
    }
  }

  async function fetchFreeDict(word: string) {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('No results found');
    const data = await res.json();
    results['freedic'] = data.map((entry: any) => ({
      word: entry.word,
      phonetic: entry.phonetic || entry.phonetics?.[0]?.text || '',
      audio: entry.phonetics?.find((p: any) => p.audio)?.audio,
      meanings: entry.meanings?.map((m: any) => ({
        partOfSpeech: m.partOfSpeech,
        definitions: m.definitions?.slice(0, 3).map((d: any) => ({
          definition: d.definition,
          example: d.example,
          synonyms: d.synonyms?.slice(0, 3),
        })),
      })),
    }));
  }

  async function fetchWiktionary(word: string) {
    const res = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`
    );
    if (!res.ok) throw new Error('No results found');
    const data = await res.json();
    const languages = ['en'];
    const filtered = languages
      .map(lang => data[lang])
      .filter(Boolean)
      .flat();
    results['wiktionary'] = filtered.map((entry: any) => ({
      partOfSpeech: entry.partOfSpeech,
      definitions: entry.definitions?.slice(0, 3).map((d: any) => ({
        definition: d.definition?.replace(/<[^>]*>/g, ''),
        example: d.examples?.[0]?.replace(/<[^>]*>/g, ''),
      })),
    }));
  }

  async function fetchMerriam(word: string) {
    const res = await fetch(
      `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=`
    );
    if (!res.ok) throw new Error('No results found');
    const data = await res.json();
    if (!data || !data.length || typeof data[0] === 'string') {
      throw new Error('No results found');
    }
    results['merriam'] = data.slice(0, 3).map((entry: any) => ({
      word: entry.hwi?.hw || word,
      functionalLabel: entry.fl,
      shortdef: entry.shortdef?.slice(0, 3),
      audio: entry.hwi?.prs?.[0]?.sound?.audio,
      definitions: entry.shortdef?.slice(0, 3).map((d: string) => ({
        definition: d,
      })),
    }));
  }

  async function fetchWordsAPI(word: string) {
    const res = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${encodeURIComponent(word)}`, {
      headers: {
        'X-RapidAPI-Key': 'public-demo',
        'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com',
      },
    });
    if (!res.ok) throw new Error('No results found');
    const data = await res.json();
    results['wordsapi'] = {
      word: data.word,
      syllables: data.syllables?.count,
      pronunciations: data.pronunciations?.all,
      definitions: data.results?.slice(0, 5).map((r: any) => ({
        definition: r.definition,
        partOfSpeech: r.partOfSpeech,
        examples: r.examples?.slice(0, 1),
        synonyms: r.synonyms?.slice(0, 3),
        typeOf: r.typeOf?.slice(0, 2),
        hasTypes: r.hasTypes?.slice(0, 2),
        inCategory: r.inCategory?.slice(0, 2),
      })),
    };
  }

  async function fetchDatamuse(word: string) {
    const [defRes, rhymeRes, synRes] = await Promise.allSettled([
      fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`),
      fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=8`),
      fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=8`),
    ]);

    const definition = defRes.status === 'fulfilled' && defRes.value.ok ? await defRes.value.json() : [];
    const rhymes = rhymeRes.status === 'fulfilled' && rhymeRes.value.ok ? await rhymeRes.value.json() : [];
    const synonyms = synRes.status === 'fulfilled' && synRes.value.ok ? await synRes.value.json() : [];

    results['datamuse'] = {
      definition: definition[0]?.defs?.map((d: string) => {
        const [pos, def] = d.split('\t');
        return { partOfSpeech: pos, definition: def };
      }),
      rhymes: rhymes.filter((r: any) => r.word !== word).slice(0, 8),
      synonyms: synonyms.filter((s: any) => s.word !== word).slice(0, 8),
    };
  }

  async function fetchLastLetter(word: string) {
    const lastChar = word.slice(-1).toLowerCase();
    const res = await fetch(`https://api.datamuse.com/words?sp=*${lastChar}&md=d&max=12`);
    if (!res.ok) throw new Error('No results found');
    const data = await res.json();
    const filtered = data.filter((w: any) => w.word.endsWith(lastChar) && w.word !== word);
    results['lastletter'] = {
      lastLetter: lastChar,
      words: filtered.map((w: any) => ({
        word: w.word,
        definitions: w.defs?.map((d: string) => {
          const [pos, def] = d.split('\t');
          return { partOfSpeech: pos, definition: def };
        })?.slice(0, 1),
      })),
    };
  }

  async function fetchOxford(word: string) {
    const res = await fetch(`https://od-api.oxforddictionaries.com/api/v2/entries/en-us/${encodeURIComponent(word.toLowerCase())}`, {
      headers: { 'app_id': 'public', 'app_key': 'public' },
    });
    if (!res.ok) throw new Error('No results found');
    const data = await res.json();
    const lexicalEntries = data.results?.[0]?.lexicalEntries || [];
    results['oxford'] = lexicalEntries.slice(0, 3).map((le: any) => ({
      partOfSpeech: le.lexicalCategory?.id,
      entries: le.entries?.slice(0, 1).map((e: any) => ({
        pronunciation: e.pronunciations?.[0]?.phoneticSpelling,
        definitions: e.senses?.slice(0, 3).map((s: any) => ({
          definition: s.definitions?.[0],
          example: s.examples?.[0]?.text,
          synonyms: s.synonyms?.slice(0, 2).map((syn: any) => syn.text),
        })),
      })),
    }));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') search();
  }

  onMount(() => {
    const saved = localStorage.getItem('dict-query');
    if (saved) query = saved;
  });

  $effect(() => {
    if (query) localStorage.setItem('dict-query', query);
  });
</script>

<div class="dict-root">
  <div class="dict-header">
    <div class="dict-title">
      <IconBook size={20} stroke={1.8} />
      <span>Dictionary</span>
    </div>
    <p class="dict-subtitle">Search across 7+ dictionary sources</p>
  </div>

  <div class="dict-search-row">
    <div class="dict-input-wrap">
      <IconSearch size={16} stroke={1.8} />
      <input
        type="text"
        class="dict-input"
        placeholder="Type a word..."
        bind:value={query}
        onkeydown={handleKeydown}
        autofocus
      />
      {#if query}
        <button class="dict-clear" onclick={() => { query = ''; results = {}; error = ''; }}>
          ✕
        </button>
      {/if}
    </div>
    <button class="dict-search-btn" onclick={search} disabled={loading || !query.trim()}>
      {#if loading}
        <IconLoader2 size={16} stroke={2} class="spin" />
      {:else}
        <IconSearch size={16} stroke={2} />
      {/if}
      Search
    </button>
  </div>

  <div class="dict-sources">
    {#each SOURCES as source}
      {@const isActive = activeSource === source.id}
      {@const hasResult = results[source.id] !== undefined}
      <button
        class="dict-source-chip"
        class:active={isActive}
        class:has-result={hasResult && !isActive}
        style={isActive ? `--chip-color: ${SOURCE_COLORS[source.id] || 'var(--accent)'}` : ''}
        onclick={() => activeSource = source.id}
      >
        <source.icon size={13} stroke={1.8} />
        <span>{source.label}</span>
        {#if hasResult && !isActive}
          <span class="dict-chip-dot" style="background: {SOURCE_COLORS[source.id]}"></span>
        {/if}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="dict-error">{error}</div>
  {/if}

  <div class="dict-results">
    {#if loading}
      <div class="dict-loading">
        <IconLoader2 size={32} stroke={1.5} class="spin" />
        <span>Searching dictionaries...</span>
      </div>
    {:else if Object.keys(results).length === 0}
      <div class="dict-empty">
        <IconBook size={48} stroke={1} />
        <span>Search for a word to get definitions, synonyms, rhymes, and more</span>
      </div>
    {:else}
      {#each Object.entries(results) as [sourceId, data]}
        {#if data && !data.error}
          <div class="dict-card" style="border-left-color: {SOURCE_COLORS[sourceId] || 'var(--border)'}">
            <div class="dict-card-header">
              <span class="dict-card-source" style="color: {SOURCE_COLORS[sourceId]}">
                {SOURCES.find(s => s.id === sourceId)?.label || sourceId}
              </span>
            </div>

            {#if sourceId === 'freedic' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-card-word">{entry.word}</div>
                {#if entry.phonetic}
                  <div class="dict-card-phonetic">{entry.phonetic}</div>
                {/if}
                {#if entry.meanings}
                  {#each entry.meanings as meaning}
                    <div class="dict-pos">{meaning.partOfSpeech}</div>
                    {#if meaning.definitions}
                      {#each meaning.definitions as def, i}
                        <div class="dict-def">
                          <span class="dict-def-num">{i + 1}.</span>
                          {def.definition}
                        </div>
                        {#if def.example}
                          <div class="dict-example">"{def.example}"</div>
                        {/if}
                        {#if def.synonyms?.length}
                          <div class="dict-synonyms">
                            Synonyms: {def.synonyms.join(', ')}
                          </div>
                        {/if}
                      {/each}
                    {/if}
                  {/each}
                {/if}
              {/each}

            {:else if sourceId === 'wiktionary' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-pos">{entry.partOfSpeech}</div>
                {#if entry.definitions}
                  {#each entry.definitions as def, i}
                    <div class="dict-def">
                      <span class="dict-def-num">{i + 1}.</span>
                      {@html def.definition}
                    </div>
                    {#if def.example}
                      <div class="dict-example">"{def.example}"</div>
                    {/if}
                  {/each}
                {/if}
              {/each}

            {:else if sourceId === 'merriam' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-card-word">{entry.word}</div>
                {#if entry.functionalLabel}
                  <div class="dict-pos">{entry.functionalLabel}</div>
                {/if}
                {#if entry.definitions}
                  {#each entry.definitions as def, i}
                    <div class="dict-def">
                      <span class="dict-def-num">{i + 1}.</span>
                      {def.definition}
                    </div>
                  {/each}
                {/if}
              {/each}

            {:else if sourceId === 'wordsapi'}
              <div class="dict-card-word">{data.word}</div>
              {#if data.syllables}
                <div class="dict-card-meta">Syllables: {data.syllables}</div>
              {/if}
              {#if data.definitions}
                {#each data.definitions as def, i}
                  {#if def.partOfSpeech}
                    <div class="dict-pos">{def.partOfSpeech}</div>
                  {/if}
                  <div class="dict-def">
                    <span class="dict-def-num">{i + 1}.</span>
                    {def.definition}
                  </div>
                  {#if def.examples?.length}
                    <div class="dict-example">"{def.examples[0]}"</div>
                  {/if}
                  {#if def.synonyms?.length}
                    <div class="dict-synonyms">Synonyms: {def.synonyms.join(', ')}</div>
                  {/if}
                {/each}
              {/if}

            {:else if sourceId === 'datamuse'}
              {#if data.definition?.length}
                <div class="dict-section-label">Definitions</div>
                {#each data.definition as def, i}
                  <div class="dict-def">
                    <span class="dict-def-num">{i + 1}.</span>
                    <span class="dict-pos">{def.partOfSpeech}</span> {def.definition}
                  </div>
                {/each}
              {/if}
              {#if data.rhymes?.length}
                <div class="dict-section-label">Rhymes</div>
                <div class="dict-tag-list">
                  {#each data.rhymes as rhyme}
                    <span class="dict-tag">{rhyme.word}{rhyme.numSyllables ? ` (${rhyme.numSyllables})` : ''}</span>
                  {/each}
                </div>
              {/if}
              {#if data.synonyms?.length}
                <div class="dict-section-label">Related Words</div>
                <div class="dict-tag-list">
                  {#each data.synonyms as syn}
                    <span class="dict-tag">{syn.word}</span>
                  {/each}
                </div>
              {/if}

            {:else if sourceId === 'lastletter'}
              <div class="dict-section-label">Words ending in "{data.lastLetter}"</div>
              <div class="dict-grid">
                {#each data.words as w}
                  <div class="dict-grid-item">
                    <span class="dict-grid-word">{w.word}</span>
                    {#if w.definitions?.length}
                      <span class="dict-grid-def">{w.definitions[0].definition}</span>
                    {/if}
                  </div>
                {/each}
              </div>

            {:else if sourceId === 'oxford' && Array.isArray(data)}
              {#each data as entry}
                <div class="dict-pos">{entry.partOfSpeech}</div>
                {#if entry.entries}
                  {#each entry.entries as e}
                    {#if e.pronunciation}
                      <div class="dict-card-phonetic">/{e.pronunciation}/</div>
                    {/if}
                    {#if e.definitions}
                      {#each e.definitions as def, i}
                        <div class="dict-def">
                          <span class="dict-def-num">{i + 1}.</span>
                          {def.definition}
                        </div>
                        {#if def.example}
                          <div class="dict-example">"{def.example}"</div>
                        {/if}
                        {#if def.synonyms?.length}
                          <div class="dict-synonyms">Synonyms: {def.synonyms.join(', ')}</div>
                        {/if}
                      {/each}
                    {/if}
                  {/each}
                {/if}
              {/each}
            {/if}
          </div>
        {:else if data?.error}
          <div class="dict-card dict-card-error" style="border-left-color: var(--red)">
            <div class="dict-card-header">
              <span class="dict-card-source" style="color: {SOURCE_COLORS[sourceId]}">
                {SOURCES.find(s => s.id === sourceId)?.label || sourceId}
              </span>
            </div>
            <div class="dict-no-result">No results found</div>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .dict-root {
    padding: 24px 32px;
    max-width: 960px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .dict-header { margin-bottom: 20px; }
  .dict-title {
    display: flex; align-items: center; gap: 10px;
    font-size: 22px; font-weight: 700; color: var(--text-1);
  }
  .dict-subtitle { color: var(--text-3); font-size: 13px; margin-top: 4px; }

  .dict-search-row {
    display: flex; gap: 10px; margin-bottom: 16px;
  }
  .dict-input-wrap {
    flex: 1; display: flex; align-items: center; gap: 8px;
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 10px; padding: 0 12px;
    transition: border-color .15s;
  }
  .dict-input-wrap:focus-within { border-color: var(--accent); }
  .dict-input-wrap :global(svg) { color: var(--text-3); flex-shrink: 0; }
  .dict-input {
    flex: 1; background: none; border: none; outline: none;
    color: var(--text-1); font-size: 14px; font-family: 'Geist', sans-serif;
    padding: 10px 0;
  }
  .dict-input::placeholder { color: var(--text-3); }
  .dict-clear {
    background: none; border: none; color: var(--text-3);
    cursor: pointer; font-size: 12px; padding: 4px;
    border-radius: 4px; transition: .13s;
  }
  .dict-clear:hover { color: var(--text-1); background: var(--hover); }

  .dict-search-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 0 18px; border-radius: 10px; border: none;
    background: var(--accent); color: #fff;
    font-size: 13px; font-weight: 600; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: .15s; white-space: nowrap;
  }
  .dict-search-btn:hover { opacity: .9; }
  .dict-search-btn:disabled { opacity: .5; cursor: not-allowed; }

  .dict-sources {
    display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px;
  }
  .dict-source-chip {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-3); color: var(--text-2);
    font-size: 11.5px; font-weight: 500; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: .13s; white-space: nowrap;
  }
  .dict-source-chip:hover { border-color: var(--border-hover); color: var(--text-1); }
  .dict-source-chip.active {
    border-color: var(--chip-color, var(--accent));
    color: var(--chip-color, var(--accent));
    background: color-mix(in srgb, var(--chip-color, var(--accent)) 8%, transparent);
  }
  .dict-source-chip.has-result { opacity: .6; }
  .dict-chip-dot {
    width: 5px; height: 5px; border-radius: 50%;
  }

  .dict-results {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px;
    padding-bottom: 32px;
  }

  .dict-loading, .dict-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px;
    padding: 60px 0; color: var(--text-3); font-size: 14px;
  }
  .dict-loading :global(svg), .dict-empty :global(svg) {
    color: var(--text-3);
  }

  .dict-card {
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 12px; border-left: 3px solid var(--border);
    padding: 16px 18px;
  }
  .dict-card-error { opacity: .7; }

  .dict-card-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px;
  }
  .dict-card-source {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px;
  }

  .dict-card-word {
    font-size: 18px; font-weight: 700; color: var(--text-1);
    margin-bottom: 2px;
  }
  .dict-card-phonetic {
    font-size: 13px; color: var(--text-2);
    font-family: 'Geist Mono', monospace; margin-bottom: 8px;
  }
  .dict-card-meta {
    font-size: 12px; color: var(--text-3); margin-bottom: 6px;
  }

  .dict-pos {
    display: inline-block; font-size: 11px; font-weight: 600;
    color: var(--accent); font-style: italic;
    margin: 8px 0 4px; padding: 2px 7px;
    background: rgba(99,102,241,.08); border-radius: 5px;
  }

  .dict-def {
    font-size: 13.5px; color: var(--text-1); line-height: 1.55;
    margin: 3px 0; padding-left: 2px;
  }
  .dict-def-num {
    color: var(--text-3); font-size: 12px; margin-right: 4px;
  }

  .dict-example {
    font-size: 12.5px; color: var(--text-2); font-style: italic;
    margin: 2px 0 4px 18px; padding-left: 8px;
    border-left: 2px solid var(--border);
  }

  .dict-synonyms {
    font-size: 12px; color: var(--text-3); margin: 2px 0 4px 18px;
  }

  .dict-section-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; color: var(--text-3);
    margin: 10px 0 6px;
  }

  .dict-tag-list {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .dict-tag {
    display: inline-block; padding: 3px 8px; border-radius: 6px;
    background: var(--bg-2); border: 1px solid var(--border);
    font-size: 12px; color: var(--text-2);
    font-family: 'Geist Mono', monospace;
  }

  .dict-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .dict-grid-item {
    display: flex; flex-direction: column; gap: 2px;
    padding: 8px 10px; border-radius: 8px;
    background: var(--bg-2); border: 1px solid var(--border);
  }
  .dict-grid-word {
    font-size: 13px; font-weight: 600; color: var(--text-1);
  }
  .dict-grid-def {
    font-size: 11.5px; color: var(--text-3); line-height: 1.4;
  }

  .dict-no-result {
    font-size: 13px; color: var(--text-3); font-style: italic;
  }

  .dict-error {
    padding: 10px 14px; border-radius: 8px;
    background: var(--red-bg); border: 1px solid var(--red-border);
    color: var(--red); font-size: 13px; margin-bottom: 16px;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 600px) {
    .dict-root { padding: 16px; }
    .dict-search-row { flex-direction: column; }
    .dict-search-btn { justify-content: center; padding: 10px; }
    .dict-sources { gap: 4px; }
    .dict-source-chip { padding: 5px 8px; font-size: 10.5px; }
    .dict-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
