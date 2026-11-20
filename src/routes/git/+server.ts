import type { RequestHandler } from './$types'

const PLAIN_TEXT = `hello there!
ts is my git repo
go to the web version to see what i have made :3
`;

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

	// browsers get a friendly web landing page
	return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ts git repo — cloud.omarplayz.eu.org</title>
<style>
  :root {
    --bg: #0f172a; --bg2: #1e293b; --border: #334155;
    --text: #f8fafc; --text2: #cbd5e1; --text3: #94a3b8;
    --accent: #818cf8; --accent-hover: #6366f1;
    --mono: #a5f3fc;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; }
  .container { max-width: 700px; margin: 0 auto; padding: 48px 20px; }
  .badge { display: inline-block; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; color: var(--text3); margin-bottom: 20px; }
  h1 { font-size: 42px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; background: linear-gradient(135deg, var(--text), var(--mono)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  p.lead { font-size: 18px; color: var(--text2); margin-bottom: 32px; max-width: 520px; }
  .hint { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px; color: var(--mono); white-space: pre-wrap; }
  .cmd { color: var(--accent); }
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
  const res = await fetch('/api/git/repos');
  if (!res.ok) return;
  const data = await res.json();
  const container = document.getElementById('repos');
  if (!data.repos?.length) {
    container.innerHTML = '<div style="grid-column:1/-1;color:var(--text3)">No public repositories yet.</div>';
    return;
  }
  container.innerHTML = data.repos.map(r => \`
    <div class="repo-card">
      <div class="repo-name">\${r.name}</div>
      <div class="repo-desc">\${r.description || 'No description'}</div>
      <div class="repo-meta">\${r.visibility}</div>
    </div>
  \`).join('');
})();
</script>
</body>
</html>`, {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-cache',
		},
	});
};
