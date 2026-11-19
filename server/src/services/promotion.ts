import {
  AcademicSession,
  SchoolClass,
  Student,
  Term,
  getSettings,
} from '../models/index.js';
import { computeClass } from './results.js';
import { bad, notFound } from '../middleware/http.js';
import { round1 } from '../lib/grading.js';

export type Decision = 'promote' | 'repeat' | 'graduate' | 'withdraw';

const S = (v: unknown) => String(v);

export function nextSessionName(name: string) {
  const m = name.match(/(\d{4})\D+(\d{4})/);
  if (!m) return `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  return `${+m[1] + 1}/${+m[2] + 1}`;
}

/* Suggest what happens to each active student at the end
   of a session. Default is promote; the top class
   graduates; if "repeat below" is set in Settings, anyone
   under that cumulative average is suggested to repeat.
   The admin reviews and can change any row. */
export async function promotionPreview(sessionId: string) {
  const session = await AcademicSession.findById(sessionId);
  if (!session) throw notFound('Session');
  const third = await Term.findOne({ session: session._id, number: 3 });
  const settings = await getSettings();
  const classes = await SchoolClass.find({ active: true })
    .sort({ order: 1 })
    .lean();
  const students = await Student.find({ status: 'active' })
    .select('studentId name class')
    .lean();

  const cumByStudent = new Map<string, number | undefined>();
  if (third) {
    for (const c of classes) {
      const cr = await computeClass(third._id, c._id);
      for (const st of cr.standings.values()) {
        cumByStudent.set(st.studentId, st.cumulativeAverage ?? st.average);
      }
    }
  }

  return classes.map((c, i) => {
    const next = classes[i + 1] ?? null;
    const rows = students
      .filter((s) => S(s.class) === S(c._id))
      .map((s) => {
        const cum = cumByStudent.get(S(s._id));
        let suggested: Decision = next ? 'promote' : 'graduate';
        if (
          next &&
          settings.repeatBelow > 0 &&
          cum != null &&
          cum < settings.repeatBelow
        ) {
          suggested = 'repeat';
        }
        return {
          id: S(s._id),
          studentId: s.studentId,
          name: s.name,
          cumulativeAverage: cum != null ? round1(cum) : null,
          suggested,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      classId: S(c._id),
      className: c.name,
      nextClass: next?.name ?? null,
      students: rows,
    };
  });
}

/* Close the session: move students, then open the next
   session with its first term as the current term. */
export async function closeSession(
  sessionId: string,
  decisions: Record<string, Decision>,
) {
  const session = await AcademicSession.findById(sessionId);
  if (!session) throw notFound('Session');
  if (session.closedAt) throw bad('This session is already closed');
  const third = await Term.findOne({ session: session._id, number: 3 });
  if (!third?.publishedAt) {
    throw bad('Publish third-term results before closing the session');
  }

  const preview = await promotionPreview(sessionId);
  const counts = { promote: 0, repeat: 0, graduate: 0, withdraw: 0 };

  for (const group of preview) {
    const nextCls = group.nextClass
      ? await SchoolClass.findOne({ name: group.nextClass }).lean()
      : null;
    for (const st of group.students) {
      let d: Decision = decisions[st.id] ?? st.suggested;
      if (d === 'promote' && !nextCls) d = 'graduate';
      counts[d]++;
      if (d === 'promote') {
        await Student.updateOne({ _id: st.id }, { class: nextCls!._id });
      } else if (d === 'graduate') {
        await Student.updateOne({ _id: st.id }, { status: 'graduated' });
      } else if (d === 'withdraw') {
        await Student.updateOne({ _id: st.id }, { status: 'withdrawn' });
      }
    }
  }

  session.closedAt = new Date();
  session.isCurrent = false;
  await session.save();

  const name = nextSessionName(session.name);
  const next =
    (await AcademicSession.findOne({ name })) ??
    (await AcademicSession.create({ name }));
  await AcademicSession.updateMany({}, { isCurrent: false });
  next.isCurrent = true;
  await next.save();
  for (const n of [1, 2, 3]) {
    await Term.updateOne(
      { session: next._id, number: n },
      { $setOnInsert: { session: next._id, number: n } },
      { upsert: true },
    );
  }
  await Term.updateMany({}, { isCurrent: false });
  await Term.updateOne({ session: next._id, number: 1 }, { isCurrent: true });

  return { counts, newSession: name };
}
