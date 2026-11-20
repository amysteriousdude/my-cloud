import type { RequestHandler } from './$types'
import { getRecordByApiKey } from '$lib/telegramStorage'
import { decrypt } from '$lib/crypto'
import { getGitStore } from '$lib/git/telegram'
import { normalizeRepoName, buildInfoRefs } from '$lib/git/protocol'

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

async function isAuthed({ request, store, env, cookies }: { request: Request; store: ReturnType<typeof getGitStore>; env: Record<string, string | undefined>; cookies: any }): Promise<boolean> {
	const cookieOk = await store.requireOwner(env.OWNER_ID ?? env.DISCORD_OWNER_ID ?? '', cookies.get('session') ?? null)
	if (cookieOk) return true
	// git basic auth: password = api key
	return store.verifyBasicAuth(request.headers.get('authorization'))
}

export const GET: RequestHandler = async ({ params, request, platform, cookies }) => {
	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	if (!store) return new Response('Git server not configured', { status: 503 })

	const repoName = normalizeRepoName(params.name)
	const url = new URL(request.url)
	const service = url.searchParams.get('service')

	if (!service || !['git-upload-pack', 'git-receive-pack'].includes(service)) {
		return new Response('Invalid service', { status: 400 })
	}

	const repo = await store.getRepo(repoName)
	if (!repo) return new Response('Repository not found', { status: 404 })

	// Public repos allow read (upload-pack advertisement). Private repos require auth.
	if (service === 'git-receive-pack' || repo.meta.visibility === 'private') {
		const ok = await isAuthed({ request, store, env, cookies })
		if (!ok) {
			return new Response('Unauthorized', {
				status: 401,
				headers: { 'WWW-Authenticate': 'Basic realm="git"' },
			})
		}
	}

	const isOwner = await store.requireOwner(env.OWNER_ID ?? env.DISCORD_OWNER_ID ?? '', cookies.get('session') ?? null)
	let refs: Record<string, string> = { ...repo.refs }
	if (!isOwner) {
		for (const branch of repo.privateBranches) delete refs[`refs/heads/${branch}`]
	}

	const body = buildInfoRefs(refs, service === 'git-upload-pack' ? 'upload-pack' : 'receive-pack')

	return new Response(body as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': `application/x-${service}-advertisement`,
			'Cache-Control': 'no-cache',
		},
	})
}
