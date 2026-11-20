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

export const POST: RequestHandler = async ({ request, url, cookies, platform }) => {
	const apiKey = apiKeyFromEvent({ request, url, cookies })
	if (!apiKey || !(await getRecordByApiKey(apiKey))) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
	}

	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	if (!store) {
		return new Response(JSON.stringify({ error: 'Git server not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
	}

	let body: { name?: string; description?: string; visibility?: string }
	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	}

	const name = (body.name ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-')
	if (!name || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
		return new Response(JSON.stringify({ error: 'Invalid repo name' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	}

	const visibility = body.visibility === 'private' ? 'private' : 'public'

	const existing = await store.getRepo(name)
	if (existing) {
		return new Response(JSON.stringify({ error: `repo "${name}" already exists` }), { status: 409, headers: { 'Content-Type': 'application/json' } })
	}

	await store.createRepo(name, body.description ?? '', visibility)

	return new Response(JSON.stringify({ ok: true, name, cloneUrl: `https://cloud.omarplayz.eu.org/git/${name}` }), {
		status: 201,
		headers: { 'Content-Type': 'application/json' },
	})
}
