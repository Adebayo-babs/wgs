import { Types } from 'mongoose';
import {
  Subject,
  SchoolClass,
  Student,
  Term,
  TermResult,
  TERM_LABEL,
  getSettings,
} from '../models/index.js';
import {
  avg,
  gradeOf,
  GRADE_REMARK,
  median,
  num,
  rankOf,
  round1,
  type Grade,
} from '../lib/grading.js';
import { notFound } from '../middleware/http.js';

type Oid = Types.ObjectId | string;
const S = (v: unknown) => String(v);

export interface SubjectLine {
  subjectId: string;
  subject: string;
  test1: number | null;
  test2: number | null;
  exam: number | null;
  examSource: 'cbt' | 'manual' | null;
  total: number;
  grade: Grade;
  remark: string;
  position: number;
  classAvg: number;
  weighted: number;
  highest: number;
  lowest: number;
  cumulative?: {
    first: number | null;
    second: number | null;
    third: number | null;
    average: number;
    grade: Grade;
  };
}

export interface StudentStanding {
  studentId: string;
  lines: SubjectLine[];
  overallTotal: number;
  average: number;
  position: number;
  cumulativeAverage?: number;
  cumulativePosition?: number;
}

export interface ClassResults {
  classCount: number;
  classAvg: number;
  highestAvg: number;
  lowestAvg: number;
  isThirdTerm: boolean;
  standings: Map<string, StudentStanding>;
}

const hasScore = (s: {
  test1?: number | null;
  test2?: number | null;
  exam?: number | null;
}) => s.test1 != null || s.test2 != null || s.exam != null;

const lineTotal = (s: {
  test1?: number | null;
  test2?: number | null;
  exam?: number | null;
}) => num(s.test1) + num(s.test2) + num(s.exam);

/* ══════════════════════════════════════════════════════
   Compute every number on every report card for one class
   in one term: per-subject positions and class stats,
   overall average and position, and (in third term) the
   cumulative average across the session's three terms.
   ══════════════════════════════════════════════════════ */
export async function computeClass(
  termId: Oid,
  classId: Oid | null,
): Promise<ClassResults> {
  const term = await Term.findById(termId).lean();
  if (!term) throw notFound('Term');

  const results = await TermResult.find({
    term: termId,
    class: classId,
  }).lean();
  const subjects = await Subject.find().lean();
  const subjName = new Map(subjects.map((s) => [S(s._id), s.name]));

  // Per-subject totals across the class
  const peers = new Map<string, number[]>();
  for (const r of results) {
    for (const sc of r.scores.filter(hasScore)) {
      const k = S(sc.subject);
      if (!peers.has(k)) peers.set(k, []);
      peers.get(k)!.push(lineTotal(sc));
    }
  }

  const standings = new Map<string, StudentStanding>();
  for (const r of results) {
    const lines: SubjectLine[] = r.scores.filter(hasScore).map((sc) => {
      const total = lineTotal(sc);
      const p = peers.get(S(sc.subject)) || [total];
      const grade = gradeOf(total);
      return {
        subjectId: S(sc.subject),
        subject: subjName.get(S(sc.subject)) || 'Unknown subject',
        test1: sc.test1 ?? null,
        test2: sc.test2 ?? null,
        exam: sc.exam ?? null,
        examSource: (sc.examSource as SubjectLine['examSource']) ?? null,
        total,
        grade,
        remark: GRADE_REMARK[grade],
        position: rankOf(total, p),
        classAvg: round1(avg(p)),
        weighted: round1(median(p)),
        highest: Math.max(...p),
        lowest: Math.min(...p),
      };
    });
    lines.sort((a, b) => a.subject.localeCompare(b.subject));
    const overallTotal = lines.reduce((x, l) => x + l.total, 0);
    standings.set(S(r.student), {
      studentId: S(r.student),
      lines,
      overallTotal,
      average: lines.length ? overallTotal / lines.length : 0,
      position: 0,
    });
  }

  // Only students with at least one score take a position
  const ranked = [...standings.values()].filter((s) => s.lines.length);
  const avgs = ranked.map((s) => s.average);
  for (const s of ranked) s.position = rankOf(s.average, avgs);

  const isThirdTerm = term.number === 3;
  if (isThirdTerm) await addCumulative(term, standings);

  return {
    classCount: results.length,
    classAvg: round1(avg(avgs)),
    highestAvg: avgs.length ? round1(Math.max(...avgs)) : 0,
    lowestAvg: avgs.length ? round1(Math.min(...avgs)) : 0,
    isThirdTerm,
    standings,
  };
}

/* Third term: pull the same session's 1st and 2nd term
   totals per subject and average whatever terms exist. */
async function addCumulative(
  term: { session: Oid },
  standings: Map<string, StudentStanding>,
) {
  const earlier = await Term.find({
    session: term.session,
    number: { $in: [1, 2] },
  }).lean();
  const termNo = new Map(earlier.map((t) => [S(t._id), t.number]));
  const ids = [...standings.keys()].map((id) => new Types.ObjectId(id));
  const past = await TermResult.find({
    term: { $in: earlier.map((t) => t._id) },
    student: { $in: ids },
  }).lean();

  // student -> subject -> { 1: total, 2: total }
  const hist = new Map<string, Map<string, Record<number, number>>>();
  for (const r of past) {
    const n = termNo.get(S(r.term))!;
    const bySub = hist.get(S(r.student)) ?? new Map();
    hist.set(S(r.student), bySub);
    for (const sc of r.scores.filter(hasScore)) {
      const rec = bySub.get(S(sc.subject)) ?? {};
      rec[n] = lineTotal(sc);
      bySub.set(S(sc.subject), rec);
    }
  }

  for (const st of standings.values()) {
    const bySub = hist.get(st.studentId) ?? new Map();
    const cumAvgs: number[] = [];
    for (const l of st.lines) {
      const rec = bySub.get(l.subjectId) ?? {};
      const vals = [rec[1], rec[2], l.total].filter(
        (v): v is number => v != null,
      );
      const a = round1(avg(vals));
      cumAvgs.push(a);
      l.cumulative = {
        first: rec[1] ?? null,
        second: rec[2] ?? null,
        third: l.total,
        average: a,
        grade: gradeOf(a),
      };
    }
    st.cumulativeAverage = cumAvgs.length ? avg(cumAvgs) : undefined;
  }

  const withCum = [...standings.values()].filter(
    (s) => s.cumulativeAverage != null,
  );
  const all = withCum.map((s) => s.cumulativeAverage!);
  for (const s of withCum) {
    s.cumulativePosition = rankOf(s.cumulativeAverage!, all);
  }
}

/* ── Auto remarks ── stable per student: the same student
   always gets the same variant, but classmates differ. */
function pickRemark(
  bank: Record<string, string[]> | undefined,
  grade: Grade,
  seed: string,
) {
  const list = bank?.[grade];
  if (!list?.length) return '';
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export interface ReportData {
  school: Record<string, string>;
  published: boolean;
  student: {
    id: string;
    studentId: string;
    regNo: string;
    name: string;
    gender: string;
    age: number | null;
    className: string;
    hasPassport: boolean;
  };
  term: {
    id: string;
    session: string;
    number: number;
    label: string;
    termEnded: string;
    nextTermBegins: string;
  };
  attendance: {
    opened: number | null;
    present: number | null;
    absent: number | null;
  };
  subjects: SubjectLine[];
  traits: {
    affective: { trait: string; rating: number | null }[];
    psychomotor: { trait: string; rating: number | null }[];
  };
  summary: {
    overallTotal: number;
    average: number;
    position: number;
    classCount: number;
    classAvg: number;
    highestAvg: number;
    lowestAvg: number;
    grade: Grade;
    performance: string;
  };
  cumulative: null | {
    average: number;
    position: number;
    grade: Grade;
    performance: string;
  };
  remarks: {
    adviser: string;
    formMaster: string;
    principal: string;
    generated: { adviser: boolean; formMaster: boolean; principal: boolean };
  };
}

/** Everything needed to draw one report card. */
export async function buildReport(
  studentOid: Oid,
  termId: Oid,
  cache?: Map<string, ClassResults>,
): Promise<ReportData> {
  const student = await Student.findById(studentOid).lean();
  if (!student) throw notFound('Student');
  const term = await Term.findById(termId).populate('session').lean();
  if (!term) throw notFound('Term');

  const result = await TermResult.findOne({
    student: student._id,
    term: term._id,
  }).lean();
  const classId = result ? result.class : student.class;
  const cls = classId ? await SchoolClass.findById(classId).lean() : null;

  const key = `${S(term._id)}:${S(classId)}`;
  let cr = cache?.get(key);
  if (!cr) {
    cr = await computeClass(term._id, classId ?? null);
    cache?.set(key, cr);
  }
  const st = cr.standings.get(S(student._id));
  const settings = await getSettings();
  const average = st?.average ?? 0;
  const grade = gradeOf(average);

  const ratings = new Map(
    (result?.traits || []).map((t) => [`${t.category}|${t.trait}`, t.rating]),
  );
  const traitList = (cat: string, names: string[]) =>
    names.map((trait) => ({
      trait,
      rating: ratings.get(`${cat}|${trait}`) ?? null,
    }));

  const cumAvg = st?.cumulativeAverage;
  const remarkGrade =
    cr.isThirdTerm && cumAvg != null ? gradeOf(cumAvg) : grade;
  const bank = settings.remarks as Record<
    string,
    Record<string, string[]>
  >;
  const seed = student.studentId;
  const typed = result?.remarks ?? {
    adviser: '',
    formMaster: '',
    principal: '',
  };
  const auto = (k: 'adviser' | 'formMaster' | 'principal') => {
    const own = typed[k]?.trim();
    if (own) return own;
    if (!st?.lines.length) return '';
    return pickRemark(bank[k], remarkGrade, seed + k);
  };

  const sess = term.session as unknown as { name: string };
  const daysOpened = term.daysOpened ?? null;

  return {
    school: { ...(settings.school as unknown as Record<string, string>) },
    published: !!term.publishedAt,
    student: {
      id: S(student._id),
      studentId: student.studentId,
      regNo: student.regNo || '',
      name: student.name,
      gender: student.gender || '',
      age: student.age ?? null,
      className: cls?.name ?? '',
      hasPassport: !!student.hasPassport,
    },
    term: {
      id: S(term._id),
      session: sess?.name ?? '',
      number: term.number,
      label: TERM_LABEL[term.number],
      termEnded: term.termEnded || '',
      nextTermBegins: term.nextTermBegins || '',
    },
    attendance: {
      opened: daysOpened,
      present: result?.daysPresent ?? null,
      absent:
        result?.daysAbsent ??
        (daysOpened != null && result?.daysPresent != null
          ? daysOpened - result.daysPresent
          : null),
    },
    subjects: st?.lines ?? [],
    traits: {
      affective: traitList('Affective', settings.affectiveTraits),
      psychomotor: traitList('Psychomotor', settings.psychomotorTraits),
    },
    summary: {
      overallTotal: st?.overallTotal ?? 0,
      average: round1(average),
      position: st?.position ?? 0,
      classCount: cr.classCount,
      classAvg: cr.classAvg,
      highestAvg: cr.highestAvg,
      lowestAvg: cr.lowestAvg,
      grade,
      performance: GRADE_REMARK[grade],
    },
    cumulative:
      cr.isThirdTerm && cumAvg != null
        ? {
            average: round1(cumAvg),
            position: st?.cumulativePosition ?? 0,
            grade: gradeOf(cumAvg),
            performance: GRADE_REMARK[gradeOf(cumAvg)],
          }
        : null,
    remarks: {
      adviser: auto('adviser'),
      formMaster: auto('formMaster'),
      principal: auto('principal'),
      generated: {
        adviser: !typed.adviser?.trim(),
        formMaster: !typed.formMaster?.trim(),
        principal: !typed.principal?.trim(),
      },
    },
  };
}

/** Class broadsheet: one row per student, ranked. */
export async function classBroadsheet(termId: Oid, classId: Oid) {
  const cr = await computeClass(termId, classId);
  const ids = [...cr.standings.keys()];
  const students = await Student.find({ _id: { $in: ids } })
    .select('studentId name')
    .lean();
  const byId = new Map(students.map((s) => [S(s._id), s]));
  const rows = [...cr.standings.values()].map((s) => ({
    id: s.studentId,
    studentId: byId.get(s.studentId)?.studentId ?? '',
    name: byId.get(s.studentId)?.name ?? '',
    subjects: s.lines.length,
    total: s.overallTotal,
    average: round1(s.average),
    position: s.position,
    cumulativeAverage:
      s.cumulativeAverage != null ? round1(s.cumulativeAverage) : null,
    cumulativePosition: s.cumulativePosition ?? null,
    grade: gradeOf(s.average),
  }));
  rows.sort((a, b) => (a.position || 999) - (b.position || 999));
  return {
    classCount: cr.classCount,
    classAvg: cr.classAvg,
    highestAvg: cr.highestAvg,
    lowestAvg: cr.lowestAvg,
    isThirdTerm: cr.isThirdTerm,
    rows,
  };
}
