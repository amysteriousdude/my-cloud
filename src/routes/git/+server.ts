import type { RequestHandler } from './$types'

const PLAIN_TEXT = `hello there!
ts is my git repo
go to the web version to see what i have made :3
`;

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ts git repo — cloud.omarplayz.eu.org</title>
<style>
  :root { --bg: #0f172a; --bg2: #1e293b; --border: #334155; --text: #f8fafc; --text2: #cbd5e1; --text3: #94a3b8; --accent: #818cf8; --accent-hover: #6366f1; --mono: #a5f3fc; --success: #34d399; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; }
  .container { max-width: 700px; margin: 0 auto; padding: 48px 20px; }
  .badge { display: inline-block; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; color: var(--text3); margin-bottom: 20px; }
  h1 { font-size: 42px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; background: linear-gradient(135deg, var(--text), var(--mono)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  p.lead { font-size: 18px; color: var(--text2); margin-bottom: 32px; max-width: 520px; }
  .hint { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px; color: var(--mono); white-space: pre-wrap; }
  .repos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-top: 32px; }
  .repo-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; transition: transform 0.2s, border-color 0.2s; }
  .repo-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .repo-name { font-family: ui-monospace, monospace; font-weight: 700; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .repo-desc { font-size: 13px; color: var(--text3); margin-bottom: 10px; }
  .repo-meta { display: flex; gap: 10px; font-size: 11px; color: var(--text3); }
  .clone-hint { margin-top: 32px; color: var(--text3); font-size: 14px; }
  .clone-hint code { color: var(--mono); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* create form */
  .create-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
  .create-card h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text); }
  .create-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
  .create-form input[type="text"], .create-form input[type="url"] { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px 12px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 13px; }
  .create-form select { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px 12px; border-radius: 8px; font-size: 13px; }
  .create-btn { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .create-btn:hover { background: var(--accent-hover); }
  .create-result { margin-top: 14px; padding: 12px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--success); display: none; }
  .create-result.show { display: block; }
  .create-error { margin-top: 10px; color: var(--red, #f87171); font-size: 12px; font-family: ui-monospace, monospace; display: none; }

  .clone-hint { margin-top: 32px; color: var(--text3); font-size: 14px; }
  .clone-hint code { color: var(--mono); }
</style>
</head>
<body>
<div class="container">
  <span class="badge">ts · git · cloud</span>
  <h1>ts is my git repo</h1>
  <p class="lead">A personal git server riding on Telegram storage. Clone, push, and browse repositories straight from the cloud.</p>

  <div class="create-card">
    <h2>Create a new repository</h2>
    <form class="create-form" id="createForm">
      <input type="text" name="name" placeholder="repo-name" required minlength="1" maxlength="60" />
      <input type="text" name="description" placeholder="description (optional)" />
      <select name="visibility">
        <option value="public">public</option>
        <option value="private">private</option>
      </select>
      <button type="submit" class="create-btn">Create</button>
    </form>
    <div class="create-result" id="createResult"></div>
    <div class="create-error" id="createError"></div>
  </div>

  <div class="hint">git clone https://cloud.omarplayz.eu.org/git/&lt;repo-name&gt;</div>
  <div class="repos-grid" id="repos"></div>
  <div class="clone-hint">Not in a browser? You're seeing the plain-text endpoint. Open <a href="/git">https://cloud.omarplayz.eu.org/git</a> for the web version.</div>
</div>
<script>
  (async () => {
    const form = document.getElementById('createForm');
    const result = document.getElementById('createResult');
    const error = document.getElementById('createError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      result.style.display = 'none';
      error.style.display = 'none';
      const fd = new FormData(form);
      const body = { name: fd.get('name'), description: fd.get('description'), visibility: fd.get('visibility') };
      try {
        const res = await fetch('/api/git/create/repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { error.textContent = data.error || 'failed'; error.style.display = 'block'; return; }
        result.textContent = 'Created ' + data.name + ' — clone: git clone ' + data.cloneUrl;
        result.style.display = 'block';
        form.reset();
      } catch (err) {
        error.textContent = err.message ?? 'request failed';
        error.style.display = 'block';
      }
    });
  })();

  (async () => {
    try {
      const res = await fetch('/api/git/repos');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const container = document.getElementById('repos');
      if (!data.repos?.length) {
        container.innerHTML = '<div style="grid-column:1/-1;color:var(--text3)">No public repositories yet.</div>';
        return;
      }
      container.innerHTML = data.repos.map(r => {
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<div class="repo-card"><div class="repo-name">' + esc(r.name) + '</div><div class="repo-desc">' + esc(r.description || 'No description') + '</div><div class="repo-meta">' + esc(r.visibility) + '</div></div>';
      }).join('');
    } catch { }
  })();
</script>
</body>
</html>`;

export const GET: RequestHandler = async ({ request }) => {
	const accept = request.headers.get('accept') ?? '';

	// curl / non-browser clients get the plain-text greeting
	if (!accept.includes('text/html')) {
		return new Response(PLAIN_TEXT, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
			},
		});
	}

	// browsers get the full web UI
	return new Response(HTML_PAGE, {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-cache',
		},
	});
};
