import type { RequestHandler } from './$types'
import { getRecordByApiKey } from '$lib/telegramStorage'
import { decrypt } from '$lib/crypto'
import { getGitStore } from '$lib/git/telegram'
import { normalizeRepoName, parseUploadPackRequest, buildUploadPackResponse } from '$lib/git/protocol'
import { emptyPack } from '$lib/git/pack'

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
	return store.verifyBasicAuth(request.headers.get('authorization'))
}

export const POST: RequestHandler = async ({ params, request, platform, cookies }) => {
	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	if (!store) return new Response('Git server not configured', { status: 503 })

	const repoName = normalizeRepoName(params.name)
	const repo = await store.getRepo(repoName)
	if (!repo) return new Response('Repository not found', { status: 404 })

	if (repo.meta.visibility === 'private') {
		const ok = await isAuthed({ request, store, env, cookies })
		if (!ok) {
			return new Response('Unauthorized', {
				status: 401,
				headers: { 'WWW-Authenticate': 'Basic realm="git"' },
			})
		}
	}

	const bodyBytes = new Uint8Array(await request.arrayBuffer())
	const { wants } = parseUploadPackRequest(bodyBytes)

	if (wants.length === 0) {
		return new Response('0008NAK\n0000', {
			headers: { 'Content-Type': 'application/x-git-upload-pack-result' },
		})
	}

	let packData: Uint8Array
	if (repo.packFileId) {
		try { packData = await store.downloadFile(repo.packFileId) } catch { packData = emptyPack() }
	} else {
		packData = emptyPack()
	}

	return new Response(buildUploadPackResponse(packData) as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'application/x-git-upload-pack-result',
			'Cache-Control': 'no-cache',
		},
	})
}
