import type { VercelRequest, VercelResponse } from '@vercel/node'

// GET /api/download → the newest macOS DMG on GitHub Releases.
//
// Release assets are named by version (ubongo_0.6.1_aarch64.dmg), so a
// hard-coded link breaks on every release. This looks the file up instead
// and falls back to the releases page if GitHub can't be reached.

const REPO = 'mxsafiri/ubongo.os'
const FALLBACK = `https://github.com/${REPO}/releases/latest`
const TTL_MS = 5 * 60 * 1000

let cached: { url: string; at: number } | null = null

async function latestDmg(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.url
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!r.ok) return cached?.url ?? FALLBACK
    const release = (await r.json()) as { assets?: { name: string; browser_download_url: string }[] }
    const dmg = release.assets?.find((a) => /aarch64\.dmg$/i.test(a.name))
    if (!dmg) return FALLBACK
    cached = { url: dmg.browser_download_url, at: Date.now() }
    return cached.url
  } catch {
    return cached?.url ?? FALLBACK
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.redirect(302, await latestDmg())
}
