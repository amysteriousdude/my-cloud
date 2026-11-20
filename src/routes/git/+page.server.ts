import type { PageServerLoad } from './$types'
import { getGitStore } from '$lib/git/telegram'

export const load: PageServerLoad = async ({ request, platform, cookies }) => {
	const accept = request.headers.get('accept') ?? ''
	const wantsHtml = accept.includes('text/html')

	const env = platform!.env as Record<string, string | undefined>
	const store = getGitStore(env)
	let repos: any[] = []
	let isOwner = false

	if (store) {
		try {
			const allRepos = await store.listRepos()
			const session = cookies.get('session')
			const ownerId = env.OWNER_ID ?? env.DISCORD_OWNER_ID
			isOwner = ownerId ? await store.requireOwner(ownerId, session ?? null) : false
			repos = isOwner ? allRepos : allRepos.filter(r => r.meta.visibility === 'public')
		} catch { }
	}

	// curl / non-browser clients get the plain-text greeting
	if (!wantsHtml) {
		return {
			plainText: `hello there!
ts is my git repo
go to the web version to see what i have made :3`,
		}
	}

	return { repos, isOwner, configured: !!store }
}
