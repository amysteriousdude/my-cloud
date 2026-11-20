import type { PageServerLoad } from './$types'
import { getGitStore } from '$lib/git/telegram'
import { resolveRef, parseCommit, parseTree, parseIdentity } from '$lib/git/objects'
import { fetchCommitGraph, fetchTree, fetchBlob } from '$lib/git/reader'

export const load: PageServerLoad = async ({ params, platform, cookies, url }) => {
	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	const name = params.name.replace(/\.git$/, '')

	let repo: any = null
	let commits: any[] = []
	let branches: any[] = []
	let tags: any[] = []
	let tree: any[] = []
	let readme: string | null = null
	let headSha: string | null = null
	let isOwner = false

	if (store) {
		try {
			repo = await store.getRepo(name)
			if (!repo) {
				return { status: 404, error: 'repository not found' }
			}

			const session = cookies.get('session')
			const ownerId = env.OWNER_ID ?? env.DISCORD_OWNER_ID
			isOwner = ownerId ? await store.requireOwner(ownerId, session ?? null) : false

			if (repo.meta.visibility === 'private' && !isOwner) {
				return { status: 404, error: 'repository not found' }
			}

			headSha = resolveRef(repo.refs, 'HEAD')

			const rawCommits = headSha ? await fetchCommitGraph(store, repo, headSha, 30) : []
			commits = rawCommits.map((c: any) => ({
				...c,
				refs: Object.entries(repo.refs)
					.filter(([k, v]) => v === c.sha && k !== 'HEAD')
					.map(([k]) => k.replace('refs/heads/', '').replace('refs/tags/', 'tag: ')),
			}))

			const allBranches = Object.entries(repo.refs)
				.filter(([k]) => k.startsWith('refs/heads/'))
				.map(([k, v]) => {
					const c = rawCommits.find((x: any) => x.sha === v)
					return {
						name: k.replace('refs/heads/', ''),
						sha: v,
						message: c?.message ?? '',
						author: c?.author ?? '',
						timestamp: c?.timestamp ?? 0,
						isPrivate: repo.privateBranches.includes(k.replace('refs/heads/', '')),
					}
				})
			branches = isOwner ? allBranches : allBranches.filter((b: any) => !b.isPrivate)

			tags = Object.entries(repo.refs)
				.filter(([k]) => k.startsWith('refs/tags/'))
				.map(([k, v]) => ({ name: k.replace('refs/tags/', ''), sha: v }))

			if (headSha && rawCommits[0]) {
				const treeSha = rawCommits[0].tree
				const entries = await fetchTree(store, repo, treeSha)
				if (entries) {
					tree = entries.sort((a: any, b: any) => {
						if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
						return a.name.localeCompare(b.name)
					})
					const readmeEntry = entries.find((e: any) =>
						e.name.toLowerCase() === 'readme.md' || e.name.toLowerCase() === 'readme'
					)
					if (readmeEntry) {
						readme = await fetchBlob(store, repo, readmeEntry.sha)
					}
				}
			}
		} catch {
			return { status: 404, error: 'repository not found' }
		}
	}

	return {
		repo: repo?.meta,
		refs: repo?.refs,
		cloneUrl: `https://cloud.omarplayz.eu.org/git/${name}`,
		commits,
		branches,
		tags,
		tree,
		readme,
		headSha,
		isOwner,
		privateBranches: repo?.privateBranches,
	}
}
