<script lang="ts">
  import type { PageData } from './$types'
  export let data: PageData

  function formatAge(ts: number): string {
    if (!ts) return '—'
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)
    if (mins < 60) return `${mins} min ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 30) return `${days}d ago`
    if (months < 12) return `${months}mo ago`
    return `${years}y ago`
  }

  function shortSha(sha: string): string { return sha.slice(0, 7) }

  function authorColor(name: string): string {
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return `hsl(${Math.abs(h) % 360},55%,52%)`
  }

  function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
  }

  function renderMarkdown(md: string): string {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^#### (.+)$/gm, (_, t) => `<h4 id="${slugify(t)}">${t}</h4>`)
      .replace(/^### (.+)$/gm, (_, t) => `<h3 id="${slugify(t)}">${t}</h3>`)
      .replace(/^## (.+)$/gm, (_, t) => `<h2 id="${slugify(t)}">${t}</h2>`)
      .replace(/^# (.+)$/gm, (_, t) => `<h1 id="${slugify(t)}">${t}</h1>`)
      .replace(/```([\w]*)\n([\s\S]*?)```/gm, '<pre><code class="lang-$1">$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n\n/g, '</p><p>')
  }

  $: sortedTree = [...data.tree].sort((a: any, b: any) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
</script>

<svelte:head>
  <title>{data.repo?.name} · git — cloud.omarplayz.eu.org</title>
</svelte:head>

<div class="git-repo">
  <nav class="repo-nav">
    <div class="nav-brand">
      <span class="octicon repo-icon">›</span>
      <a href="/git" class="repo-root">ts git</a>
      <span class="sep">/</span>
      <a href="/git/{data.repo?.name}" class="repo-current">{data.repo?.name}</a>
    </div>
    <div class="nav-actions">
      {#if data.isOwner}
        <a href="/git/{data.repo?.name}/settings" class="btn-icon" title="Settings">⚙</a>
      {/if}
      <button class="btn-clone" onclick={() => navigator.clipboard.writeText(data.cloneUrl)}>Code</button>
    </div>
  </nav>

  <header class="repo-header">
    <div class="repo-meta">
      <h1 class="repo-name">{data.repo?.name}</h1>
      {#if data.repo?.description}
        <p class="repo-desc">{data.repo.description}</p>
      {/if}
      <div class="repo-stats">
        <span class="stat"><strong>{data.commits.length}</strong> commits</span>
        <span class="stat"><strong>{data.branches.length}</strong> branches</span>
        <span class="stat"><strong>{data.tags.length}</strong> tags</span>
        <span class="stat">{data.repo?.visibility}</span>
      </div>
    </div>
    <div class="clone-box">
      <div class="clone-label">HTTPS</div>
      <div class="clone-input">
        <code class="clone-url">{data.cloneUrl}</code>
        <button class="btn-copy" onclick={() => navigator.clipboard.writeText(data.cloneUrl)}>copy</button>
      </div>
      <div class="clone-hint">git clone {data.cloneUrl}</div>
    </div>
  </header>

  <div class="repo-body">
    <aside class="repo-sidebar">
      <div class="sidebar-section">
        <div class="section-title">Branches</div>
        {#each data.branches as b}
          <div class="branch-item" onclick={() => location.href = `/git/${data.repo?.name}/tree?path=&ref=${b.name}`}>
            <span class="branch-dot" style="background:{authorColor(b.author)}"></span>
            <span class="branch-name">{b.name}</span>
            {#if b.sha === data.headSha}<span class="branch-tag">default</span>{/if}
            <span class="branch-age">{formatAge(b.timestamp)}</span>
          </div>
        {:else}
          <div class="empty-text">No branches</div>
        {/each}
      </div>
      {#if data.tags.length > 0}
        <div class="sidebar-section">
          <div class="section-title">Tags</div>
          {#each data.tags as t}
            <div class="tag-item">{t.name} <span class="tag-sha">{shortSha(t.sha)}</span></div>
          {/each}
        </div>
      {/if}
    </aside>

    <main class="repo-main">
      {#if data.readme}
        <div class="section-title main">README.md</div>
        <div class="readme-body">{@html renderMarkdown(data.readme)}</div>
      {/if}

      {#if sortedTree.length > 0}
        <div class="section-title main">Repository</div>
        <table class="file-list">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Last commit</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedTree as entry}
              <tr class="file-row">
                <td class="file-type">
                  {#if entry.type === 'tree'}
                    <span class="octicon">📁</span>
                  {:else}
                    <span class="octicon">📄</span>
                  {/if}
                </td>
                <td class="file-name">
                  {#if entry.type === 'tree'}
                    <a href="/git/{data.repo?.name}/tree?path={entry.name}">{entry.name}/</a>
                  {:else}
                    <a href="/git/{data.repo?.name}/tree?path={entry.name}">{entry.name}</a>
                  {/if}
                </td>
                <td class="file-age">—</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="empty-state">
          <p>This repository is empty.</p>
          {#if data.isOwner}
            <p>Push your first commit:</p>
            <pre class="git-cmd">git remote add origin {data.cloneUrl}
git push -u origin main</pre>
          {/if}
        </div>
      {/if}

      {#if data.commits.length > 0}
        <div class="section-title main">Recent commits</div>
        <table class="commit-list">
          <thead>
            <tr>
              <th>Commit</th>
              <th>Message</th>
              <th>Author</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {#each data.commits.slice(0, 10) as c}
              <tr class="commit-row">
                <td class="commit-sha">
                  <span class="sha">{shortSha(c.sha)}</span>
                  {#each c.refs as r}
                    {#if r.startsWith('tag:')}
                      <span class="ref-tag">{r.replace('tag: ', '')}</span>
                    {:else}
                      <span class="ref-branch">{r}</span>
                    {/if}
                  {/each}
                </td>
                <td class="commit-message">{c.message}</td>
                <td class="commit-author">
                  <span class="author-dot" style="background:{authorColor(c.author)}"></span>
                  {c.author}
                </td>
                <td class="commit-age">{formatAge(c.timestamp)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </main>
  </div>
</div>

<style>
  :global(html), :global(body) { background: var(--bg-1); color: var(--text-1); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }

  .git-repo { max-width: 1100px; margin: 0 auto; padding: 24px 20px 60px; }

  /* Nav */
  .repo-nav { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .nav-brand { display: flex; align-items: center; gap: 8px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 15px; font-weight: 700; }
  .repo-icon { color: var(--accent); font-size: 18px; }
  .repo-root { color: var(--text-2); text-decoration: none; }
  .repo-root:hover { color: var(--text-1); }
  .sep { color: var(--text-3); font-size: 12px; }
  .repo-current { color: var(--text-1); text-decoration: none; }
  .nav-actions { margin-left: auto; display: flex; gap: 8px; }
  .btn-icon { background: var(--bg-2); border: 1px solid var(--border); color: var(--text-1); width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
  .btn-icon:hover { border-color: var(--accent); }
  .btn-clone { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: var(--accent); color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-clone:hover { filter: brightness(1.1); }

  /* Header */
  .repo-header { display: flex; gap: 24px; margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 24px; }
  .repo-meta { flex: 1; }
  .repo-name { font-size: 28px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.01em; }
  .repo-desc { font-size: 15px; color: var(--text-2); margin: 0 0 14px 0; }
  .repo-stats { display: flex; gap: 16px; font-size: 13px; color: var(--text-3); }
  .repo-stats .stat { white-space: nowrap; }

  .clone-box { width: 320px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .clone-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin-bottom: 8px; display: block; }
  .clone-input { display: flex; gap: 8px; margin-bottom: 8px; }
  .clone-url { flex: 1; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: var(--text-2); background: var(--bg-1); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-copy { padding: 6px 14px; font-size: 12px; background: var(--bg-1); border: 1px solid var(--border); color: var(--text-1); border-radius: 6px; cursor: pointer; white-space: nowrap; }
  .btn-copy:hover { background: var(--border); }
  .clone-hint { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: var(--accent); }

  /* Body */
  .repo-body { display: grid; grid-template-columns: 260px 1fr; gap: 32px; align-items: start; }

  /* Sidebar */
  .repo-sidebar { display: flex; flex-direction: column; gap: 20px; }
  .sidebar-section { display: flex; flex-direction: column; gap: 10px; }
  .section-title { font-size: 13px; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .branch-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 13px; }
  .branch-item:hover { border-color: var(--accent); background: var(--bg-3); }
  .branch-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .branch-name { font-family: ui-monospace, monospace; font-weight: 600; color: var(--text-1); flex: 1; min-width: 0; }
  .branch-tag { font-size: 10px; padding: 1px 6px; background: var(--accent-subtle); color: var(--accent); border-radius: 4px; white-space: nowrap; flex-shrink: 0; }
  .branch-age { font-size: 11px; color: var(--text-3); flex-shrink: 0; }
  .tag-item { display: flex; justify-content: space-between; padding: 6px 10px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: ui-monospace, monospace; }
  .tag-sha { color: var(--text-3); font-size: 11px; }
  .empty-text { color: var(--text-3); font-size: 13px; padding: 12px 10px; }

  /* Main */
  .repo-main { display: flex; flex-direction: column; gap: 30px; }
  .section-title.main { font-size: 15px; font-weight: 700; color: var(--text-1); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }

  .readme-body { border: 1px solid var(--border); border-radius: 10px; padding: 20px 24px; background: var(--bg-2); font-size: 14px; line-height: 1.7; color: var(--text-1); }
  .readme-body h1 { font-size: 22px; margin: 16px 0 10px; border-bottom: 2px solid var(--border); padding-bottom: 6px; }
  .readme-body h2 { font-size: 18px; margin: 14px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .readme-body h3 { font-size: 15px; margin: 12px 0 6px; }
  .readme-body p { margin-bottom: 10px; }
  .readme-body code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; color: var(--accent); }
  .readme-body pre { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; overflow-x: auto; margin: 10px 0; }
  .readme-body pre code { background: none; border: none; padding: 0; color: var(--text-1); }
  .readme-body ul, .readme-body ol { margin-bottom: 10px; padding-left: 22px; }

  .file-list { width: 100%; border-collapse: separate; border-spacing: 0; }
  .file-list th { text-align: left; font-size: 11px; font-weight: 700; color: var(--text-3); padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg-2); }
  .file-list td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text-1); vertical-align: middle; }
  .file-row:hover { background: var(--bg-3); }
  .file-type { width: 30px; font-size: 16px; }
  .file-name a { color: var(--text-1); text-decoration: none; font-family: ui-monospace, monospace; }
  .file-name a:hover { color: var(--accent); text-decoration: underline; }
  .file-age { color: var(--text-3); font-size: 12px; }

  .commit-list { width: 100%; border-collapse: separate; border-spacing: 0; }
  .commit-list th { text-align: left; font-size: 11px; font-weight: 700; color: var(--text-3); padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg-2); }
  .commit-list td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text-1); vertical-align: middle; }
  .commit-row:hover { background: var(--bg-3); }
  .commit-sha { font-family: ui-monospace, monospace; font-size: 12px; }
  .sha { color: var(--text-3); }
  .ref-tag { font-size: 10px; padding: 1px 6px; background: var(--warning-subtle); color: var(--warning); border-radius: 4px; margin-left: 6px; }
  .ref-branch { font-size: 10px; padding: 1px 6px; background: var(--accent-subtle); color: var(--accent); border-radius: 4px; margin-left: 6px; }
  .commit-message { color: var(--text-1); font-size: 14px; }
  .author-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .commit-author { font-size: 13px; color: var(--text-2); }
  .commit-age { color: var(--text-3); font-size: 12px; white-space: nowrap; }

  .empty-state { text-align: center; padding: 60px 20px; color: var(--text-3); }
  .empty-state p { margin-bottom: 16px; }
  .git-cmd { display: block; text-align: left; background: var(--bg-1); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; color: var(--text-1); max-width: 420px; margin: 0 auto; }

  @media (max-width: 768px) {
    .repo-body { grid-template-columns: 1fr; }
    .repo-header { flex-direction: column; gap: 16px; }
    .clone-box { width: 100%; }
  }
</style>
