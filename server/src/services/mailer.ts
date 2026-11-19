import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

/* Two ways to send:
   1. Brevo's HTTP API (BREVO_API_KEY) — works on Render's
      free plan, which blocks SMTP ports 25/465/587.
   2. Plain SMTP (SMTP_*) — fine locally or on paid hosts.
   Brevo is used whenever its key is set. */

type Mail = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

/** "WITH GOD Schools <x@y.com>" → { name, email } */
function parseFrom(raw?: string) {
  const s = (raw || env.SMTP_USER || '').trim();
  const m = /^(.*?)\s*<([^>]+)>$/.exec(s);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2] };
  return { name: 'WITH GOD Schools', email: s };
}

async function sendViaBrevo(mail: Mail) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY!,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(env.MAIL_FROM),
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      attachment: mail.attachments?.map((a) => ({
        name: a.filename,
        content: a.content.toString('base64'),
      })),
    }),
  });
  if (!res.ok) {
    let msg = `Brevo error ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg += `: ${j.message}`;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
}

let transport: Transporter | null = null;

async function sendViaSmtp(mail: Mail) {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    secure: (env.SMTP_PORT ?? 465) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...mail });
}

export async function sendMail(mail: Mail) {
  if (env.BREVO_API_KEY) return sendViaBrevo(mail);
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return sendViaSmtp(mail);
  }
  throw new Error('Email is not configured on the server');
}