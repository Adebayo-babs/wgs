import { Types } from 'mongoose';
import {
  AcademicSession,
  AutomationLog,
  Term,
  TERM_LABEL,
  getSettings,
} from '../models/index.js';
import { publishTerm } from './publish.js';
import { smtpConfigured } from '../config/env.js';
import { closeSession, nextSessionName } from './promotion.js';

/* ══════════════════════════════════════════════════════
   Automatic term and session changes.

   Each term has a start date (set on the Terms page).
   When that date arrives the system:
   1. publishes the term that's ending, if nobody has
      (students see their reports, parents are emailed)
   2. opens the new term
   3. if the new term starts a new session, promotes every
      student first using the suggested choices (top class
      graduates, anyone below "repeat below" repeats) and
      creates the following session, so its dates can be
      set ahead of time.

   Render's free plan sleeps when idle, so this runs when
   the server starts (any visit wakes it) and every hour
   while it's awake.
   ══════════════════════════════════════════════════════ */

const HOUR = 60 * 60 * 1000;
let running = false;

export async function log(action: string, detail = '', ok = true) {
  await AutomationLog.create({ action, detail, ok });
}

type TermRef = { session: unknown; number: number };

async function label(t: TermRef) {
  const s = await AcademicSession.findById(t.session).lean();
  return `${TERM_LABEL[t.number]} Term ${s?.name ?? ''}`.trim();
}

/** The term that follows `t` (next session's 1st term after 3rd). */
export async function nextTermOf(t: TermRef) {
  const sid = new Types.ObjectId(String(t.session));
  if (t.number < 3) {
    return Term.findOne({ session: sid, number: t.number + 1 }).lean();
  }
  const s = await AcademicSession.findById(sid).lean();
  if (!s) return null;
  const next = await AcademicSession.findOne({
    name: nextSessionName(s.name),
  }).lean();
  return next
    ? Term.findOne({ session: next._id, number: 1 }).lean()
    : null;
}

/** Make sure the session after the current one exists, so
    its 1st term start date can be set in advance. */
export async function ensureNextSession() {
  const cur = await AcademicSession.findOne({ isCurrent: true });
  if (!cur) return;
  const name = nextSessionName(cur.name);
  let next = await AcademicSession.findOne({ name });
  if (!next) {
    next = await AcademicSession.create({ name });
    await log('Created next session', `${name} (set its dates any time)`);
  }
  for (const n of [1, 2, 3]) {
    await Term.updateOne(
      { session: next._id, number: n },
      { $setOnInsert: { session: next._id, number: n } },
      { upsert: true },
    );
  }
}

/** One pass: move forward while a next term's date has come. */
export async function autoAdvance(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const settings = await getSettings();
    if (!settings.autoAdvance) return;
    await ensureNextSession();

    // Loop in case several start dates passed while asleep
    for (let i = 0; i < 4; i++) {
      const cur = await Term.findOne({ isCurrent: true }).lean();
      if (!cur) return;
      const next = await nextTermOf(cur);
      if (!next?.startsOn || next.startsOn > now) return;

      const curName = await label(cur);
      const nextName = await label(next);

      if (!cur.publishedAt) {
        await publishTerm(cur._id);
        await log(
          'Published results',
          `${curName} — reports released` +
            (!settings.emailReportsOnPublish
              ? ''
              : smtpConfigured
                ? ' and emailed to parents'
                : " (email isn't set up, so none were sent)"),
        );
      }

      if (cur.number === 3) {
        // New session: promote everyone, then the next
        // session's 1st term becomes current.
        const r = await closeSession(String(cur.session), {});
        await log(
          'Started new session',
          `${r.newSession}: ${r.counts.promote} promoted, ` +
            `${r.counts.repeat} repeating, ${r.counts.graduate} graduated`,
        );
        // closeSession opens 1st term of the session after
        // this one; make sure it's the one that just started.
        await Term.updateMany({}, { isCurrent: false });
        await Term.updateOne({ _id: next._id }, { isCurrent: true });
        await ensureNextSession();
      } else {
        await Term.updateMany({}, { isCurrent: false });
        await Term.updateOne({ _id: next._id }, { isCurrent: true });
      }
      await log('Opened term', `${nextName} started on its start date`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Automation failed:', msg);
    await log('Automatic change failed', msg, false).catch(() => {});
  } finally {
    running = false;
  }
}

export function startAutomation() {
  void autoAdvance();
  setInterval(() => void autoAdvance(), HOUR).unref();
}
