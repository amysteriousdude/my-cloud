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
  :root { --bg-1: #0f172a; --bg-2: #1e293b; --bg-3: #334155; --border: #475569; --text-1: #f8fafc; --text-2: #cbd5e1; --text-3: #94a3b8; --accent: #818cf8; --accent-hover: #6366f1; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg-1); color: var(--text-1); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
  .container { max-width: 700px; margin: 0 auto; padding: 40px 20px; }
  .badge { display: inline-block; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; font-size: 11px; color: var(--text-3); margin-bottom: 20px; }
  h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; background: linear-gradient(135deg, var(--text-1), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  p.lead { font-size: 17px; color: var(--text-2); margin-bottom: 32px; max-width: 520px; }
  .hint { background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 28px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; color: var(--accent); white-space: pre-wrap; }
  .repos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 32px; }
  .repo-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; transition: border-color 0.2s; }
  .repo-card:hover { border-color: var(--accent); }
  .repo-name { font-family: ui-monospace, monospace; font-weight: 700; font-size: 15px; color: var(--text-1); margin-bottom: 6px; }
  .repo-desc { font-size: 12.5px; color: var(--text-3); margin-bottom: 8px; }
  .repo-meta { display: flex; gap: 10px; font-size: 11px; color: var(--text-3); }
  .clone-hint { margin-top: 32px; color: var(--text-3); font-size: 14px; }
  .clone-hint code { color: var(--accent); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <span class="badge">ts · git · cloud</span>
  <h1>ts is my git repo</h1>
  <p class="lead">A personal git server riding on Telegram storage. Clone, push, and browse repositories straight from the cloud.</p>
  <div class="hint">git clone https://cloud.omarplayz.eu.org/git/&lt;repo-name&gt;</div>
  <div class="repos-grid" id="repos"></div>
  <div class="clone-hint">Not in a browser? You're seeing the plain-text endpoint. Open <a href="/git">https://cloud.omarplayz.eu.org/git</a> for the web version.</div>
</div>
<script>
  (async () => {
    try {
      const res = await fetch('/api/git/repos');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const container = document.getElementById('repos');
      if (!data.repos?.length) {
        container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-3)">No public repositories yet.</div>';
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
