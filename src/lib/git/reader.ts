import type { GitStore, RepoIndex } from './telegram.js'
import { parseCommit, parseTree, resolveRef, parseIdentity } from './objects.js'

// Wraps TG object fetching with a local cache so we don't re-fetch within one request
export class ObjectReader {
	private cache = new Map<string, Uint8Array>()

	constructor(private store: GitStore, private repo: RepoIndex) {}

	async get(sha: string): Promise<{ type: string; content: Uint8Array } | null> {
		const fileId = this.repo.objects[sha]
		if (!fileId) return null

		if (this.cache.has(sha)) {
			return { type: 'unknown', content: this.cache.get(sha)! }
		}

		try {
			const content = await this.store.downloadObject(fileId)
			this.cache.set(sha, content)
			return { type: 'unknown', content }
		} catch {
			return null
		}
	}
}

// Build object map from repo for page servers
// Downloads all objects referenced from HEAD up to a limit
export async function buildObjectMap(
	store: GitStore,
	repo: RepoIndex,
	limit = 50
): Promise<Map<string, { type: 'commit' | 'tree' | 'blob' | 'tag'; content: Uint8Array }>> {
	const objects = new Map<string, { type: 'commit' | 'tree' | 'blob' | 'tag'; content: Uint8Array }>()

	const headSha = resolveRef(repo.refs, 'HEAD')
	if (!headSha) return objects

	// BFS from HEAD, download objects as we go
	const queue = [headSha]
	const seen = new Set<string>()
	let count = 0

	while (queue.length > 0 && count < limit) {
		const sha = queue.shift()!
		if (seen.has(sha) || !repo.objects[sha]) continue
		seen.add(sha)

		try {
			const content = await store.downloadObject(repo.objects[sha]!)
			count++

			// determine type by trying to parse
			const text = new TextDecoder('utf-8', { fatal: false }).decode(content.slice(0, 7))
			let type: 'commit' | 'tree' | 'blob' | 'tag' = 'blob'
			if (text.startsWith('tree ') || text.startsWith('parent') || text.startsWith('author')) {
				type = 'commit'
				try {
					const parsed = parseCommit(content)
					queue.push(parsed.tree)
					for (const p of parsed.parents) queue.push(p)
				} catch { }
			} else if (repo.objects[sha] && isBinaryTreeData(content)) {
				type = 'tree'
				try {
					const entries = parseTree(content)
					for (const e of entries) queue.push(e.sha)
				} catch { }
			}

			objects.set(sha, { type, content })
		} catch { }
	}

	return objects
}

function isBinaryTreeData(data: Uint8Array): boolean {
	if (data.length < 6) return false
	const first = data[0]!
	return first >= 48 && first <= 57 // starts with digit
}

// Faster alternative: use stored object type hints
export async function fetchCommitGraph(
	store: GitStore,
	repo: RepoIndex,
	startSha: string,
	limit = 20
): Promise<Array<{ sha: string; message: string; author: string; email: string; timestamp: number; parents: string[]; tree: string }>> {
	const commits = []
	const queue = [startSha]
	const seen = new Set<string>()

	while (queue.length > 0 && commits.length < limit) {
		const sha = queue.shift()!
		if (seen.has(sha)) continue
		seen.add(sha)

		const fileId = repo.objects[sha]
		if (!fileId) continue

		try {
			const content = await store.downloadObject(fileId)
			const parsed = parseCommit(content)
			const identity = parseIdentity(parsed.author)

			commits.push({
				sha,
				message: parsed.message.split('\n')[0] ?? '',
				author: identity.name,
				email: identity.email,
				timestamp: identity.timestamp * 1000,
				parents: parsed.parents,
				tree: parsed.tree,
			})

			for (const p of parsed.parents) queue.push(p)
		} catch { }
	}

	return commits
}

export async function fetchTree(
	store: GitStore,
	repo: RepoIndex,
	treeSha: string
): Promise<Array<{ mode: string; name: string; sha: string; type: 'blob' | 'tree' }> | null> {
	const fileId = repo.objects[treeSha]
	if (!fileId) return null
	try {
		const content = await store.downloadObject(fileId)
		return parseTree(content).map(e => ({
			...e,
			type: e.mode === '040000' ? 'tree' : 'blob' as 'blob' | 'tree'
		}))
	} catch {
		return null
	}
}

export async function fetchBlob(
	store: GitStore,
	repo: RepoIndex,
	blobSha: string
): Promise<string | null> {
	const fileId = repo.objects[blobSha]
	if (!fileId) return null
	try {
		const content = await store.downloadObject(fileId)
		return new TextDecoder().decode(content)
	} catch {
		return null
	}
}
