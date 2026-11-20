import { resolveRef } from './objects.js'
import { concat } from './pack.js'

export function pktLine(line: string): Uint8Array {
	const data = new TextEncoder().encode(line)
	const len = data.length + 4
	const prefix = new TextEncoder().encode(len.toString(16).padStart(4, '0'))
	const out = new Uint8Array(4 + data.length)
	out.set(prefix)
	out.set(data, 4)
	return out
}

function pktLineRaw(data: Uint8Array): Uint8Array {
	const len = data.length + 4
	const prefix = new TextEncoder().encode(len.toString(16).padStart(4, '0'))
	const out = new Uint8Array(4 + data.length)
	out.set(prefix)
	out.set(data, 4)
	return out
}

export const PKT_FLUSH = new TextEncoder().encode('0000')

function getDefaultBranch(refs: Record<string, string>): string {
	const head = refs['HEAD']
	if (head?.startsWith('ref: refs/heads/')) return head.slice('ref: refs/heads/'.length)
	return 'main'
}

export function buildInfoRefs(refs: Record<string, string>, service: 'upload-pack' | 'receive-pack'): Uint8Array {
	const parts: Uint8Array[] = []
	parts.push(pktLine(`# service=git-${service}\n`))
	parts.push(PKT_FLUSH)

	const defaultBranch = getDefaultBranch(refs)
	const headSha = resolveRef(refs, 'HEAD')

	const refEntries = Object.entries(refs).filter(([, v]) => !v.startsWith('ref: '))

	const uploadCaps = `symref=HEAD:refs/heads/${defaultBranch} side-band-64k no-done`
	const receiveCaps = `symref=HEAD:refs/heads/${defaultBranch} delete-refs report-status`
	const caps = service === 'upload-pack' ? uploadCaps : receiveCaps
	const zero = '0000000000000000000000000000000000000000'

	if (refEntries.length === 0) {
		parts.push(pktLine(`${zero} capabilities^{}\0 ${caps}\n`))
	} else {
		const firstSha = headSha ?? refEntries[0]![1]
		parts.push(pktLine(`${firstSha} HEAD\0 ${caps}\n`))
		for (const [ref, sha] of refEntries) {
			parts.push(pktLine(`${sha} ${ref}\n`))
		}
	}

	parts.push(PKT_FLUSH)
	return concat(parts)
}

export function parseUploadPackRequest(body: Uint8Array): { wants: string[]; haves: string[]; done: boolean } {
	const text = new TextDecoder().decode(body)
	const wants: string[] = []
	const haves: string[] = []
	let done = false
	let pos = 0

	while (pos < text.length) {
		const lenHex = text.slice(pos, pos + 4)
		if (lenHex === '0000') { pos += 4; continue }
		const len = parseInt(lenHex, 16)
		if (isNaN(len) || len < 4) { pos += 4; continue }
		const line = text.slice(pos + 4, pos + len).trim()
		pos += len
		if (line.startsWith('want ')) wants.push(line.split(' ')[1]!.slice(0, 40))
		else if (line.startsWith('have ')) haves.push(line.split(' ')[1]!.slice(0, 40))
		else if (line === 'done') done = true
	}

	return { wants, haves, done }
}

export function parseReceivePackRequest(body: Uint8Array): {
	commands: Array<{ refname: string; oldSha: string; newSha: string }>
	packData: Uint8Array
} {
	const commands: Array<{ refname: string; oldSha: string; newSha: string }> = []
	let pos = 0

	while (pos < body.length) {
		const lenHex = new TextDecoder().decode(body.slice(pos, pos + 4))
		if (lenHex === '0000') { pos += 4; break }
		const len = parseInt(lenHex, 16)
		if (isNaN(len) || len < 4) break
		const line = new TextDecoder().decode(body.slice(pos + 4, pos + len)).trim()
		const nullIdx = line.indexOf('\0')
		const cmd = nullIdx !== -1 ? line.slice(0, nullIdx) : line
		const parts = cmd.split(' ')
		if (parts.length === 3) {
			commands.push({ oldSha: parts[0]!, newSha: parts[1]!, refname: parts[2]! })
		}
		pos += len
	}

	return { commands, packData: body.slice(pos) }
}

export function buildUploadPackResponse(packData: Uint8Array): Uint8Array {
	const parts: Uint8Array[] = []
	parts.push(pktLine('NAK\n'))

	const chunkSize = 65515
	let offset = 0
	while (offset < packData.length) {
		const chunk = packData.slice(offset, offset + chunkSize)
		const sideband = new Uint8Array(chunk.length + 1)
		sideband[0] = 1
		sideband.set(chunk, 1)
		parts.push(pktLineRaw(sideband))
		offset += chunkSize
	}

	parts.push(PKT_FLUSH)
	return concat(parts)
}

export function buildReceivePackAdvertisement(refs: Record<string, string>): Uint8Array {
	return buildInfoRefs(refs, 'receive-pack')
}

export function buildReceivePackResult(ok: boolean, refname: string, error?: string): Uint8Array {
	const parts: Uint8Array[] = []
	parts.push(pktLine('unpack ok\n'))
	parts.push(ok ? pktLine(`ok ${refname}\n`) : pktLine(`ng ${refname} ${error ?? 'failed'}\n`))
	parts.push(PKT_FLUSH)
	return concat(parts)
}

export function normalizeRepoName(name: string): string {
	return name.endsWith('.git') ? name.slice(0, -4) : name
}
