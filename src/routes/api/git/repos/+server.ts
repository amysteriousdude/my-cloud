import type { RequestHandler } from './$types'
import { getRecordByApiKey } from '$lib/telegramStorage'
import { decrypt } from '$lib/crypto'
import { getGitStore } from '$lib/git/telegram'

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
	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	if (!store) {
		return new Response(JSON.stringify({ error: 'Git server not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
	}

	let isOwner = false
	try {
		const apiKey = apiKeyFromEvent({ request, url, cookies })
		if (apiKey && (await getRecordByApiKey(apiKey))) {
			isOwner = true
		}
	} catch { }

	try {
		const repos = await store.listRepos()
		const filtered = isOwner
			? repos.map(r => r.meta)
			: repos.filter(r => r.meta.visibility === 'public').map(r => r.meta)
		return new Response(JSON.stringify({ repos: filtered }), { headers: { 'Content-Type': 'application/json' } })
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? 'failed to list repos' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}
