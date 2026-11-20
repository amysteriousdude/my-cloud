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
	const apiKey = apiKeyFromEvent({ request, url, cookies })
	if (!apiKey || !(await getRecordByApiKey(apiKey))) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
	}

	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	if (!store) {
		return new Response(JSON.stringify({ error: 'Git server not configured. Set GIT_TELEGRAM_BOT_TOKEN and GIT_TELEGRAM_CHANNEL_ID.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
	}

	try {
		const repos = await store.listRepos()
		return new Response(JSON.stringify({ repos: repos.map(r => r.meta) }), { headers: { 'Content-Type': 'application/json' } })
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? 'failed to list repos' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}
