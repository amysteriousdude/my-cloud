import type { RequestHandler } from './$types'
import { getRecordByApiKey } from '$lib/telegramStorage'
import { decrypt } from '$lib/crypto'
import { getGitStore } from '$lib/git/telegram'
import { normalizeRepoName, parseReceivePackRequest, buildReceivePackResult } from '$lib/git/protocol'
import { extractPackObjects, appendPack } from '$lib/git/pack'

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
	const cookieOk = await store.requireOwner(env.OWNER_ID ?? env.DISCORD_OWNER_ID ?? '', cookies.get('session') ?? null)
	const ok = cookieOk || await store.verifyBasicAuth(request.headers.get('authorization'))
	if (!ok) {
		return new Response('Unauthorized', {
			status: 401,
			headers: { 'WWW-Authenticate': 'Basic realm="git"' },
		})
	}

	const repo = await store.getRepo(repoName)
	if (!repo) return new Response('Repository not found', { status: 404 })

	const bodyBytes = new Uint8Array(await request.arrayBuffer())
	const { commands, packData } = parseReceivePackRequest(bodyBytes)

	if (packData.length > 4) {
		const magic = new TextDecoder().decode(packData.slice(0, 4))
		if (magic === 'PACK') {
			let newPack = packData
			if (repo.packFileId) {
				try {
					const existing = await store.downloadFile(repo.packFileId)
					newPack = await appendPack(existing, packData)
				} catch { }
			}
			repo.packFileId = await store.uploadPack(newPack, repoName)

			try {
				const extracted = await extractPackObjects(packData)
				for (const [sha, { type, content }] of extracted) {
					if (!repo.objects[sha]) {
						repo.objects[sha] = await store.uploadObject(sha, content, repoName)
					}
				}
			} catch { }
		}
	}

	const zeroSha = '0000000000000000000000000000000000000000'
	for (const cmd of commands) {
		if (cmd.newSha === zeroSha) {
			delete repo.refs[cmd.refname]
		} else {
			repo.refs[cmd.refname] = cmd.newSha
		}
	}

	const headVal = repo.refs['HEAD']
	if (headVal?.startsWith('ref: ')) {
		const target = headVal.slice(5)
		if (!repo.refs[target]) {
			const first = Object.keys(repo.refs).find(k => k.startsWith('refs/heads/'))
			if (first) repo.refs['HEAD'] = `ref: ${first}`
		}
	} else if (!headVal) {
		const first = Object.keys(repo.refs).find(k => k.startsWith('refs/heads/'))
		if (first) repo.refs['HEAD'] = `ref: ${first}`
	}

	await store.saveRepo(repoName, repo)

	const results: Uint8Array[] = []
	for (const cmd of commands) results.push(buildReceivePackResult(true, cmd.refname))
	const total = results.reduce((s, r) => s + r.length, 0)
	const out = new Uint8Array(total)
	let off = 0
	for (const r of results) { out.set(r, off); off += r.length }

	return new Response(out as unknown as BodyInit, {
		status: 200,
		headers: { 'Content-Type': 'application/x-git-receive-pack-result', 'Cache-Control': 'no-cache' },
	})
}
