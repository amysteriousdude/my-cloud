import type { RequestHandler } from './$types'
import { getRecordByApiKey } from '$lib/telegramStorage'
import { decrypt } from '$lib/crypto'
import { getGitStore } from '$lib/git/telegram'
import { resolveRef } from '$lib/git/objects'
import { fetchCommitGraph } from '$lib/git/reader'

function apiKeyFromEvent({ request, url, cookies }: { request: Request; url: URL; cookies: any }): string | null {
	const headerKey = (request.headers.get('x-api-key') ?? '').trim()
	if (headerKey) return headerKey
	const queryKey = url.searchParams.get('api_key') ?? ''
	if (queryKey) return queryKey
	try {
		const session = cookies.get('session')
		if (session) {
			const key = decrypt(session)
			if (key) return key
		}
	} catch { }
	return null
}

export const GET: RequestHandler = async ({ request, url, cookies, platform }) => {
	const apiKey = apiKeyFromEvent({ request, url, cookies })
	if (!apiKey || !(await getRecordByApiKey(apiKey))) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
	}

	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	if (!store) {
		return new Response(JSON.stringify({
			repos: 0,
			commits: 0,
			branches: 0,
			recentActivity: [],
		}), { headers: { 'Content-Type': 'application/json' } })
	}

	try {
		const repos = await store.listRepos()
		let totalCommits = 0
		let totalBranches = 0
		const recentActivity: Array<{ repo: string; message: string; author: string; timestamp: number }> = []

		for (const repo of repos) {
			totalBranches += Object.keys(repo.refs).filter(k => k.startsWith('refs/heads/')).length
			const headSha = resolveRef(repo.refs, 'HEAD')
			if (headSha) {
				try {
					const commits = await fetchCommitGraph(store, repo, headSha, 10)
					totalCommits += commits.length
					for (const c of commits.slice(0, 3)) {
						recentActivity.push({ repo: repo.meta.name, message: c.message, author: c.author, timestamp: c.timestamp })
					}
				} catch { }
			}
		}

		recentActivity.sort((a, b) => b.timestamp - a.timestamp)

		return new Response(JSON.stringify({
			repos: repos.length,
			commits: totalCommits,
			branches: totalBranches,
			recentActivity: recentActivity.slice(0, 10),
		}), { headers: { 'Content-Type': 'application/json' } })
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? 'failed to compute git stats' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}
