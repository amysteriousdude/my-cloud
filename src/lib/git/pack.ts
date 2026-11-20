import { sha1 } from './objects.js'

export function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64)
	const out = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
	return out
}

export function bytesToB64(data: Uint8Array): string {
	let bin = ''
	for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]!)
	return btoa(bin)
}

export function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((s, p) => s + p.length, 0)
	const out = new Uint8Array(total)
	let off = 0
	for (const p of parts) { out.set(p, off); off += p.length }
	return out
}

function u32be(n: number): Uint8Array {
	return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}

function u32beVal(d: Uint8Array, o: number): number {
	return ((d[o]! << 24) | (d[o + 1]! << 16) | (d[o + 2]! << 8) | d[o + 3]!) >>> 0
}

type ObjType = 'commit' | 'tree' | 'blob' | 'tag'
const TYPE_NAMES: ObjType[] = ['commit', 'commit', 'tree', 'blob', 'tag', 'commit', 'commit', 'commit']

async function decompress(data: Uint8Array): Promise<Uint8Array> {
	const ds = new DecompressionStream('deflate')
	const w = ds.writable.getWriter()
	const r = ds.readable.getReader()
	w.write(data as unknown as BufferSource); w.close()
	const chunks: Uint8Array[] = []
	while (true) {
		const { done, value } = await r.read()
		if (done) break
		chunks.push(value)
	}
	return concat(chunks)
}

// Extract objects from a pack — used once on push
export async function extractPackObjects(
	pack: Uint8Array
): Promise<Map<string, { type: ObjType; content: Uint8Array }>> {
	const objects = new Map<string, { type: ObjType; content: Uint8Array }>()

	let packStart = 0
	while (packStart + 12 < pack.length) {
		const magic = new TextDecoder().decode(pack.slice(packStart, packStart + 4))
		if (magic !== 'PACK') break

		const numObjects = u32beVal(pack, packStart + 8)
		let pos = packStart + 12

		for (let i = 0; i < numObjects; i++) {
			if (pos >= pack.length) break

			let b = pack[pos++]!
			const typeBits = (b >> 4) & 0x7
			let size = b & 0x0f
			let shift = 4
			while (b & 0x80) {
				b = pack[pos++]!
				size |= (b & 0x7f) << shift
				shift += 7
			}

			const type = TYPE_NAMES[typeBits] ?? 'blob'
			const maxSearch = Math.min(pack.length - pos, size + 512)
			let content: Uint8Array | null = null
			let consumed = 0

			for (let len = 2; len <= maxSearch; len++) {
				try {
					const candidate = await decompress(pack.slice(pos, pos + len))
					if (candidate.length === size) { content = candidate; consumed = len; break }
					if (candidate.length > size) break
				} catch { }
			}

			if (!content) break
			pos += consumed

			const header = new TextEncoder().encode(`${type} ${content.length}\0`)
			const full = concat([header, content])
			const sha = await sha1(full)
			objects.set(sha, { type, content })
		}

		packStart = pos + 20
	}

	return objects
}

// Append two packs — used to combine pushes for git clone
export async function appendPack(existing: Uint8Array, incoming: Uint8Array): Promise<Uint8Array> {
	const magicA = new TextDecoder().decode(existing.slice(0, 4))
	const magicB = new TextDecoder().decode(incoming.slice(0, 4))
	if (magicA !== 'PACK' || magicB !== 'PACK') return incoming

	const countA = u32beVal(existing, 8)
	const countB = u32beVal(incoming, 8)
	const bodyA = existing.slice(12, existing.length - 20)
	const bodyB = incoming.slice(12, incoming.length - 20)

	const header = concat([new TextEncoder().encode('PACK'), u32be(2), u32be(countA + countB)])
	const body = concat([header, bodyA, bodyB])
	const checksum = new Uint8Array(await crypto.subtle.digest('SHA-1', body as unknown as BufferSource))
	return concat([body, checksum])
}

// Empty valid PACK (0 objects)
export function emptyPack(): Uint8Array {
	return new Uint8Array([
		0x50, 0x41, 0x43, 0x4b,
		0x00, 0x00, 0x00, 0x02,
		0x00, 0x00, 0x00, 0x00,
		0x02, 0x9d, 0x08, 0x82, 0x3b, 0xd8, 0xa8, 0xea,
		0xb5, 0x10, 0xad, 0x6a, 0xc7, 0x5c, 0x82, 0x3c,
		0xfd, 0x3e, 0xd3, 0x1e,
	])
}
