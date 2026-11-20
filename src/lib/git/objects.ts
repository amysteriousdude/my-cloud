export type ObjectType = 'commit' | 'tree' | 'blob' | 'tag'

export interface CommitData {
	tree: string
	parents: string[]
	author: string
	committer: string
	message: string
}

export interface TreeEntry {
	mode: string
	name: string
	sha: string
}

export function encodeObject(data: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!)
	return btoa(binary)
}

export function decodeObject(b64: string): Uint8Array {
	const binary = atob(b64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}

export async function sha1(data: Uint8Array): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-1', data as unknown as BufferSource)
	return Array.from(new Uint8Array(hash))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
}

export function buildObjectBytes(type: ObjectType, content: Uint8Array): Uint8Array {
	const header = new TextEncoder().encode(`${type} ${content.length}\0`)
	const full = new Uint8Array(header.length + content.length)
	full.set(header)
	full.set(content, header.length)
	return full
}

export async function objectSha(type: ObjectType, content: Uint8Array): Promise<string> {
	return sha1(buildObjectBytes(type, content))
}

export function parseCommit(content: Uint8Array): CommitData {
	const text = new TextDecoder().decode(content)
	const lines = text.split('\n')
	const data: CommitData = { tree: '', parents: [], author: '', committer: '', message: '' }
	let i = 0
	for (; i < lines.length; i++) {
		const line = lines[i]!
		if (line === '') { i++; break }
		if (line.startsWith('tree ')) data.tree = line.slice(5)
		else if (line.startsWith('parent ')) data.parents.push(line.slice(7))
		else if (line.startsWith('author ')) data.author = line.slice(7)
		else if (line.startsWith('committer ')) data.committer = line.slice(10)
	}
	data.message = lines.slice(i).join('\n')
	return data
}

export function parseTree(content: Uint8Array): TreeEntry[] {
	const entries: TreeEntry[] = []
	let i = 0
	while (i < content.length) {
		const spaceIdx = content.indexOf(0x20, i)
		const mode = new TextDecoder().decode(content.slice(i, spaceIdx))
		i = spaceIdx + 1
		const nullIdx = content.indexOf(0x00, i)
		const name = new TextDecoder().decode(content.slice(i, nullIdx))
		i = nullIdx + 1
		const shaBytes = content.slice(i, i + 20)
		const sha = Array.from(shaBytes).map(b => b.toString(16).padStart(2, '0')).join('')
		i += 20
		entries.push({ mode, name, sha })
	}
	return entries
}

export function resolveRef(refs: Record<string, string>, refName: string): string | null {
	const val = refs[refName]
	if (!val) return null
	if (val.startsWith('ref: ')) return resolveRef(refs, val.slice(5))
	return val
}

export function parseIdentity(identity: string): { name: string; email: string; timestamp: number } {
	const match = identity.match(/^(.+?) <(.+?)> (\d+) [+-]\d+$/)
	if (!match) return { name: identity, email: '', timestamp: 0 }
	return { name: match[1]!, email: match[2]!, timestamp: parseInt(match[3]!) }
}
