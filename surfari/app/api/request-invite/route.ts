import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createHmac, randomBytes } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ipHits = new Map<string, number[]>();
const HOUR = 60 * 60 * 1000;
const MAX_PER_IP_PER_HOUR = 3;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (arr.length >= MAX_PER_IP_PER_HOUR) { ipHits.set(ip, arr); return false; }
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

function generateCode(secret: string): string {
  const id = randomBytes(4).toString('hex').toUpperCase();
  const sig = createHmac('sha256', secret).update(id).digest('hex').slice(0, 6).toUpperCase();
  return `UBONGO-${id}-${sig}`;
}

const DMG_URL = 'https://github.com/mxsafiri/ubongo.os/releases/latest/download/ubongo_0.6.0_aarch64.dmg';

function plainBody(code: string): string {
  return `Welcome to Ubongo.\n\nYour invite code:\n${code}\n\nDOWNLOAD (macOS Apple Silicon):\n${DMG_URL}\n\nINSTALL:\n1. Open the .dmg and drag ubongo to Applications.\n2. Run in Terminal: xattr -dr com.apple.quarantine /Applications/ubongo.app\n3. Launch ubongo and paste the invite code.\n\nReply with any feedback — I read every message.`;
}

function htmlBody(code: string): string {
  return `<div style="font-family:monospace;background:#050505;color:#e8e8e8;padding:32px;max-width:480px">
<p style="color:#10b981;margin:0 0 24px;font-size:12px;letter-spacing:.1em">UBONGO</p>
<p style="margin:0 0 8px;font-size:13px">Welcome. Your invite code:</p>
<p style="background:#111;border:1px solid #222;padding:16px;font-size:18px;letter-spacing:.15em;color:#10b981;margin:0 0 24px">${code}</p>
<a href="${DMG_URL}" style="display:inline-block;border:1px solid #10b981;color:#10b981;padding:10px 20px;font-size:11px;letter-spacing:.1em;text-decoration:none">DOWNLOAD .DMG</a>
<p style="margin:24px 0 0;font-size:11px;color:#555">Reply to this email with any feedback.</p>
</div>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again in an hour.' }, { status: 429 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const secret = process.env.INVITE_SECRET;
  const fromName = process.env.INVITE_FROM_NAME || 'Ubongo';

  if (!gmailUser || !gmailPass || !secret) {
    return NextResponse.json({ error: 'Server not configured. Reach out to Victor.' }, { status: 500 });
  }

  const code = generateCode(secret);
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass.replace(/\s+/g, '') },
  });

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${gmailUser}>`,
      to: email, replyTo: gmailUser,
      subject: 'Your Ubongo invite code',
      text: plainBody(code), html: htmlBody(code),
    });
  } catch (err) {
    console.error('request-invite: sendMail failed', err);
    return NextResponse.json({ error: 'Could not send email. Try again in a moment.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
