import { getSessionToken } from '$lib/crypto.js'
import { getRecordByApiKey, readGitRegistry, writeGitRegistry } from '$lib/telegramStorage.js'

export interface RepoMeta {
	name: string
	description: string
	visibility: 'public' | 'private'
	createdAt: number
	updatedAt: number
}

export interface RepoIndex {
	meta: RepoMeta
	refs: Record<string, string>         // "HEAD" | "refs/heads/main" -> sha or symref
	packFileId: string                   // TG file_id of raw pack (for git clone)
	objects: Record<string, string>      // sha -> TG file_id of raw object content
	privateBranches: string[]            // branch names hidden from public on public repos
}

interface Registry {
	repos: Record<string, string>        // repo name -> TG file_id of RepoIndex
	sessions?: Record<string, { userId: string; expiresAt: number }>
	tokens?: Record<string, { name: string; createdAt: number; lastUsed: number | null }>
}

export class GitStore {
	private token: string
	private channelId: string
	private base: string

	constructor(token: string, channelId: string) {
		this.token = token
		this.channelId = channelId
		this.base = `https://api.telegram.org/bot${token}`
	}

	private async api(method: string, body?: unknown): Promise<any> {
		const res = await fetch(`${this.base}/${method}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		})
		const json = await res.json() as { ok: boolean; result: any; description?: string }
		if (!json.ok) throw new Error(`TG ${method}: ${json.description}`)
		return json.result
	}

	private async uploadFile(
		data: Uint8Array | string,
		filename: string,
		caption?: string
	): Promise<{ fileId: string; messageId: number }> {
		const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
		const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' })
		const fd = new FormData()
		fd.append('chat_id', this.channelId)
		fd.append('document', blob, filename)
		if (caption) fd.append('caption', caption)

		const res = await fetch(`${this.base}/sendDocument`, { method: 'POST', body: fd })
		const json = await res.json() as { ok: boolean; result: any }
		if (!json.ok) throw new Error(`TG upload failed: ${JSON.stringify(json)}`)
		return { fileId: json.result.document.file_id, messageId: json.result.message_id }
	}

	async downloadFile(fileId: string): Promise<Uint8Array> {
		const info = await this.api('getFile', { file_id: fileId })
		const url = `https://api.telegram.org/file/bot${this.token}/${info.file_path}`
		const res = await fetch(url)
		const buf = await res.arrayBuffer()
		return new Uint8Array(buf)
	}

	async downloadText(fileId: string): Promise<string> {
		const bytes = await this.downloadFile(fileId)
		return new TextDecoder().decode(bytes)
	}

	private async deleteMessage(messageId: number): Promise<void> {
		await this.api('deleteMessage', { chat_id: this.channelId, message_id: messageId }).catch(() => {})
	}

	// --- Registry (stored in the my-cloud API-key index; the chat has exactly
	// one pin and it belongs to the index, so git never pins anything) ---

	private async getRegistry(): Promise<{ data: Registry; msgId: null }> {
		return { data: await readGitRegistry(), msgId: null }
	}

	private async saveRegistry(reg: Registry, _msgId: number | null): Promise<void> {
		await writeGitRegistry(reg)
	}

	// --- Repo Index ---

	private async uploadRepoIndex(index: RepoIndex): Promise<{ fileId: string; messageId: number }> {
		return this.uploadFile(
			JSON.stringify(index),
			`${index.meta.name}.json`,
			`::repo::${index.meta.name}`
		)
	}

	private async loadRepoIndex(fileId: string): Promise<RepoIndex> {
		const text = await this.downloadText(fileId)
		const index = JSON.parse(text) as RepoIndex
		if (!index.objects) index.objects = {}
		if (!index.privateBranches) index.privateBranches = []
		return index
	}

	async listRepos(): Promise<RepoIndex[]> {
		const { data: reg } = await this.getRegistry()
		const results: RepoIndex[] = []
		for (const fileId of Object.values(reg.repos)) {
			try {
				results.push(await this.loadRepoIndex(fileId))
			} catch { }
		}
		return results
	}

	async getRepo(name: string): Promise<RepoIndex | null> {
		const { data: reg } = await this.getRegistry()
		const fileId = reg.repos[name]
		if (!fileId) return null
		try {
			return await this.loadRepoIndex(fileId)
		} catch {
			return null
		}
	}

	async saveRepo(name: string, index: RepoIndex): Promise<void> {
		const { data: reg, msgId } = await this.getRegistry()
		index.meta.updatedAt = Date.now()
		const { fileId } = await this.uploadRepoIndex(index)
		reg.repos[name] = fileId
		await this.saveRegistry(reg, msgId)
	}

	async createRepo(name: string, description: string, visibility: 'public' | 'private'): Promise<RepoIndex> {
		const index: RepoIndex = {
			meta: { name, description, visibility, createdAt: Date.now(), updatedAt: Date.now() },
			refs: { HEAD: 'ref: refs/heads/main' },
			packFileId: '',
			objects: {},
			privateBranches: [],
		}
		await this.saveRepo(name, index)
		return index
	}

	async deleteRepo(name: string): Promise<void> {
		const { data: reg, msgId } = await this.getRegistry()
		delete reg.repos[name]
		await this.saveRegistry(reg, msgId)
	}

	async uploadPack(packData: Uint8Array, repoName: string): Promise<string> {
		const { fileId } = await this.uploadFile(packData, `${repoName}.pack`, `::pack::${repoName}`)
		return fileId
	}

	async uploadObject(sha: string, content: Uint8Array, repoName: string): Promise<string> {
		const { fileId } = await this.uploadFile(content, `${sha}`, `::obj::${repoName}::${sha}`)
		return fileId
	}

	async downloadObject(fileId: string): Promise<Uint8Array> {
		return this.downloadFile(fileId)
	}

	// --- Sessions ---

	async createSession(userId: string): Promise<string> {
		const token = crypto.randomUUID()
		const { data: reg, msgId } = await this.getRegistry()
		if (!reg.sessions) reg.sessions = {}
		const now = Date.now()
		for (const [t, s] of Object.entries(reg.sessions)) {
			if (s.expiresAt < now) delete reg.sessions[t]
		}
		reg.sessions[token] = { userId, expiresAt: now + 1000 * 60 * 60 * 24 * 7 }
		await this.saveRegistry(reg, msgId)
		return token
	}

	async getSession(token: string): Promise<string | null> {
		const { data: reg } = await this.getRegistry()
		const s = reg.sessions?.[token]
		if (!s || s.expiresAt < Date.now()) return null
		return s.userId
	}

	// --- Tokens (API token login for git) ---

	async createToken(label: string): Promise<string> {
		const bytes = new Uint8Array(16)
		crypto.getRandomValues(bytes)
		const token = `git_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
		const { data: reg, msgId } = await this.getRegistry()
		if (!reg.tokens) reg.tokens = {}
		reg.tokens[token] = { name: label, createdAt: Date.now(), lastUsed: null }
		await this.saveRegistry(reg, msgId)
		return token
	}

	async listTokens(): Promise<Array<{ token: string; name: string; createdAt: number; lastUsed: number | null }>> {
		const { data: reg } = await this.getRegistry()
		return Object.entries(reg.tokens ?? {}).map(([token, meta]) => ({ token, ...meta }))
	}

	async verifyToken(token: string): Promise<boolean> {
		const { data: reg, msgId } = await this.getRegistry()
		if (!reg.tokens?.[token]) return false
		reg.tokens[token]!.lastUsed = Date.now()
		await this.saveRegistry(reg, msgId)
		return true
	}

	async revokeToken(token: string): Promise<void> {
		const { data: reg, msgId } = await this.getRegistry()
		if (!reg.tokens?.[token]) return
		delete reg.tokens[token]
		await this.saveRegistry(reg, msgId)
	}

	async verifyBasicAuth(authHeader: string | null): Promise<boolean> {
		if (!authHeader?.startsWith('Basic ')) return false
		const decoded = atob(authHeader.slice(6))
		const token = decoded.includes(':') ? decoded.split(':')[1]! : decoded
		return this.verifyToken(token)
	}

	// --- my-cloud API key bridge ---
	// Accept a my-cloud API key (or session cookie) as git credentials
	async verifyApiKey(apiKey: string): Promise<boolean> {
		try {
			const rec = await getRecordByApiKey(apiKey)
			return !!rec
		} catch {
			return false
		}
	}
}

export function getGitStore(env: Record<string, string | undefined>): GitStore | null {
	const token = env.GIT_TELEGRAM_BOT_TOKEN ?? env.TELEGRAM_BOT_TOKEN
	const channelId = env.GIT_TELEGRAM_CHANNEL_ID ?? env.TELEGRAM_BACKUP_CHAT_ID
	if (!token || !channelId) return null
	return new GitStore(token, channelId)
}
