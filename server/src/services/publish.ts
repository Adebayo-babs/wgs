import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env, smtpConfigured } from '../config/env.js';
import {
  Student,
  Term,
  TermResult,
  getSettings,
} from '../models/index.js';
import { buildReport, type ClassResults } from './results.js';
import { reportPdf, pdfName } from './reportPdf.js';
import { sendMail } from './mailer.js';
import { bad, notFound } from '../middleware/http.js';

type Oid = Types.ObjectId | string;

/* ── Shareable report links ──
   A signed link that opens one student's report PDF
   without a login. Sent to parents by email and used by
   the "share on WhatsApp" button. Valid for 120 days. */
export function reportLinkToken(student: Oid, term: Oid) {
  return jwt.sign(
    { kind: 'report', s: String(student), t: String(term) },
    env.JWT_SECRET,
    { expiresIn: '120d' },
  );
}

export function readReportToken(token: string) {
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as {
      kind?: string;
      s: string;
      t: string;
    };
    if (p.kind !== 'report') throw new Error();
    return p;
  } catch {
    throw notFound('Report link');
  }
}

export const reportLink = (student: Oid, term: Oid) =>
  `${env.API_URL.replace(/\/$/, '')}/api/public/report/` +
  reportLinkToken(student, term);

/** Release a term's results to students and parents. */
export async function publishTerm(termId: Oid) {
  const term = await Term.findById(termId);
  if (!term) throw notFound('Term');
  term.publishedAt = term.publishedAt ?? new Date();
  await term.save();
  const settings = await getSettings();
  if (settings.emailReportsOnPublish) {
    void deliverReports(termId).catch((e) =>
      console.error('Report delivery failed', e),
    );
  }
  return term;
}

/* Email every parent their child's report card PDF.
   Runs in the background; progress is saved on the term
   and on each student's term result. */
export async function deliverReports(termId: Oid, onlyFailed = false) {
  const term = await Term.findById(termId).populate('session');
  if (!term) throw notFound('Term');
  if (!term.publishedAt) throw bad('Publish the term first');
  if (term.delivery?.running) throw bad('Delivery is already running');

  term.set('delivery', {
    running: true,
    startedAt: new Date(),
    sent: 0,
    failed: 0,
    skipped: 0,
  });
  await term.save();

  const filter: Record<string, unknown> = {
    term: term._id,
    'scores.0': { $exists: true },
  };
  if (onlyFailed) {
    filter['delivery.status'] = { $in: ['failed', 'pending', null] };
  }
  const results = await TermResult.find(filter).select('_id student');
  const settings = await getSettings();
  const school = settings.school?.shortName || 'School';
  const cache = new Map<string, ClassResults>();
  const counts = { sent: 0, failed: 0, skipped: 0 };

  for (const res of results) {
    const st = await Student.findById(res.student).lean();
    const email = st?.parent?.email?.trim();
    let status: 'sent' | 'failed' | 'skipped' = 'skipped';
    let error = '';

    if (!smtpConfigured) {
      error = 'Email not configured on the server';
    } else if (!st || !email) {
      error = 'No parent email on file';
    } else {
      try {
        const r = await buildReport(st._id, term._id, cache);
        const pdf = await reportPdf(r);
        const link = reportLink(st._id, term._id);
        await sendMail({
          to: email,
          subject:
            `${st.name} — ${r.term.label} Term Report ` +
            `(${r.term.session})`,
          html: emailHtml(st.name, r.term.label, r.term.session, school, link),
          attachments: [{ filename: pdfName(r), content: pdf }],
        });
        status = 'sent';
        // Stay well under free SMTP rate limits
        await new Promise((ok) => setTimeout(ok, 1200));
      } catch (e) {
        status = 'failed';
        error = e instanceof Error ? e.message : String(e);
      }
    }
    counts[status]++;
    await TermResult.updateOne(
      { _id: res._id },
      { delivery: { status, at: new Date(), error } },
    );
  }

  await Term.updateOne(
    { _id: term._id },
    {
      delivery: {
        running: false,
        startedAt: term.delivery?.startedAt,
        finishedAt: new Date(),
        ...counts,
      },
    },
  );
  return counts;
}

function emailHtml(
  name: string,
  termLabel: string,
  session: string,
  school: string,
  link: string,
) {
  return `
  <div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
    <p>Dear Parent/Guardian,</p>
    <p>Please find attached the <b>${termLabel} Term</b> report card
    of <b>${name}</b> for the ${session} session.</p>
    <p>You can also open it online here:<br/>
    <a href="${link}">${link}</a></p>
    <p>Thank you.<br/>${school}</p>
  </div>`;
}

/** Clear stuck "running" flags after a server restart. */
export async function resetStuckDeliveries() {
  await Term.updateMany(
    { 'delivery.running': true },
    { $set: { 'delivery.running': false } },
  );
}
