import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'
import { createHmac, randomBytes } from 'node:crypto'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ipHits = new Map<string, number[]>()
const HOUR = 60 * 60 * 1000
const MAX_PER_IP_PER_HOUR = 3

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < HOUR)
  if (arr.length >= MAX_PER_IP_PER_HOUR) {
    ipHits.set(ip, arr)
    return false
  }
  arr.push(now)
  ipHits.set(ip, arr)
  return true
}

function generateCode(secret: string): string {
  const id = randomBytes(4).toString('hex').toUpperCase()
  const sig = createHmac('sha256', secret).update(id).digest('hex').slice(0, 6).toUpperCase()
  return `UBONGO-${id}-${sig}`
}

const DMG_URL =
  'https://github.com/mxsafiri/ubongo.os/releases/latest/download/ubongo_0.5.14_aarch64.dmg'

function plainBody(code: string): string {
  return `Welcome to Ubongo.

Your invite code:
${code}

DOWNLOAD (macOS Apple Silicon):
${DMG_URL}

INSTALL:
1. Open the .dmg and drag ubongo to Applications.
2. Run this in Terminal to unlock it (macOS blocks unsigned apps):
   xattr -dr com.apple.quarantine /Applications/ubongo.app
3. Launch ubongo and paste the invite code above.

If still blocked, open System Settings → Privacy & Security
and click "Open Anyway".

Reply to this email with any feedback — I read every message.

— Victor
`
}

function htmlBody(code: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:40px 20px;background:#0a0a0a;color:#e5e5e5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
  <div style="max-width:540px;margin:0 auto;">
    <div style="font-size:22px;letter-spacing:0.08em;margin-bottom:28px;">
      <span style="color:#6ee7b7;">U</span>BONGO
    </div>
    <p style="font-size:14px;line-height:1.65;margin:0 0 16px;">Welcome. Your invite code:</p>
    <div style="background:#111;border:1px solid #2a2a2a;padding:22px;font-size:19px;letter-spacing:0.1em;margin:0 0 28px;text-align:center;color:#6ee7b7;">
      ${code}
    </div>
    <p style="font-size:13px;line-height:1.65;margin:0 0 10px;"><strong style="color:#fafafa;">Download</strong> (macOS Apple Silicon, ~12 MB):<br/>
      <a href="${DMG_URL}" style="color:#6ee7b7;text-decoration:underline;">ubongo_0.5.14_aarch64.dmg</a>
    </p>
    <p style="font-size:13px;line-height:1.65;margin:18px 0 6px;"><strong style="color:#fafafa;">Install:</strong></p>
    <ol style="font-size:13px;line-height:1.8;padding-left:20px;margin:0 0 16px;">
      <li>Open the .dmg, drag ubongo to Applications.</li>
      <li>In Terminal (macOS blocks unsigned apps):<br/>
        <code style="display:inline-block;background:#111;border:1px solid #2a2a2a;padding:4px 10px;margin-top:6px;">xattr -dr com.apple.quarantine /Applications/ubongo.app</code>
      </li>
      <li>Launch ubongo and paste the invite code above.</li>
    </ol>
    <p style="font-size:12px;line-height:1.65;color:#888;margin:0 0 18px;">
      Still blocked? System Settings → Privacy &amp; Security → "Open Anyway".
    </p>
    <p style="font-size:13px;line-height:1.65;margin:0 0 4px;">Reply with any feedback — I read every message.</p>
    <p style="font-size:13px;line-height:1.65;margin:0;">— Victor</p>
  </div>
</body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body ?? {}
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email.' })
  }

  const ip =
    ((req.headers['x-forwarded-for'] as string | undefined) ?? '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in an hour.' })
  }

  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  const secret = process.env.INVITE_SECRET
  const fromName = process.env.INVITE_FROM_NAME || 'Ubongo'

  if (!gmailUser || !gmailPass || !secret) {
    console.error('request-invite: missing env vars', {
      hasUser: !!gmailUser,
      hasPass: !!gmailPass,
      hasSecret: !!secret,
    })
    return res.status(500).json({ error: 'Server not configured. Reach out to Victor.' })
  }

  const code = generateCode(secret)

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass.replace(/\s+/g, '') },
  })

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${gmailUser}>`,
      to: email,
      replyTo: gmailUser,
      subject: 'Your Ubongo invite code',
      text: plainBody(code),
      html: htmlBody(code),
    })
  } catch (err) {
    console.error('request-invite: sendMail failed', err)
    return res.status(502).json({ error: 'Could not send email. Try again in a moment.' })
  }

  return res.status(200).json({ ok: true })
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
