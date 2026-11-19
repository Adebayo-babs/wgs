import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadFile, staffApi } from '../../api/client';
import type { ExamReview, Report } from '../../lib/types';
import { GRADE_COLOR, gradeOf, ordinal, relTime } from '../../lib/util';
import { Empty, Field, Modal, PageHead, Spinner, toast } from '../../components/ui';
import ReportCard from '../../components/ReportCard';
import { ReviewView } from '../student/Student';
import { TermSelect, useM, useScope } from './shell';

/* ══════════════ CBT results ══════════════ */
type Attempt = {
  _id: string;
  student: { _id: string; studentId: string; name: string };
  subject: { _id: string; name: string };
  class: { name: string } | null;
  status: string;
  score: number;
  total: number;
  percent: number;
  examScore: number;
  submittedAt: string | null;
};

export function CbtResults() {
  const sc = useScope();
  const m = useM();
  const qc = useQueryClient();
  const [cls, setCls] = useState('');
  const [subject, setSubject] = useState('');
  const [view, setView] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (cls) params.set('class', cls);
  if (subject) params.set('subject', subject);
  const list = useQuery({
    queryKey: ['attempts', cls, subject],
    queryFn: () => staffApi<Attempt[]>(`/attempts?${params}`),
  });
  const reset = useMutation({
    mutationFn: (id: string) => staffApi(`/attempts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.ok('Attempt reset. The student can retake it.');
      qc.invalidateQueries({ queryKey: ['attempts'] });
    },
    onError: toast.err,
  });
  const review = useQuery({
    queryKey: ['attempt', view],
    queryFn: () => staffApi<ExamReview>(`/attempts/${view}`),
    enabled: !!view,
  });
  const subjects = cls ? sc.subjectsFor(cls) : m.subjects;

  return (
    <>
      <PageHead
        title="CBT results"
        sub="Scores are scaled to the 60-mark exam column and go straight onto the report card, unless a teacher has typed an exam score by hand."
      />
      <div className="card mb-5 flex flex-wrap gap-3">
        <Field label="Class">
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">All my classes</option>
            {sc.subjectClasses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      {list.isLoading && <Spinner />}
      {list.data && !list.data.length && <Empty>No exam submissions yet.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Score</th>
                <th>Exam (60)</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a._id}>
                  <td>
                    <div className="font-medium">{a.student?.name}</div>
                    <div className="text-xs text-slate-400">{a.student?.studentId}</div>
                  </td>
                  <td>{a.class?.name ?? '-'}</td>
                  <td>{a.subject?.name}</td>
                  <td>
                    {a.status === 'submitted' ? (
                      <span className={`badge ${GRADE_COLOR[gradeOf(a.percent)]}`}>
                        {a.score}/{a.total} · {a.percent}%
                      </span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-800">In progress</span>
                    )}
                  </td>
                  <td className="font-semibold">{a.status === 'submitted' ? a.examScore : '-'}</td>
                  <td className="text-xs text-slate-500">{relTime(a.submittedAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    {a.status === 'submitted' && (
                      <button className="btn-sm btn-ghost mr-1" onClick={() => setView(a._id)}>Answers</button>
                    )}
                    <button
                      className="btn-sm btn text-red-600 hover:bg-red-50"
                      onClick={() =>
                        confirm(`Reset ${a.student?.name}'s ${a.subject?.name} exam? They will be able to retake it.`) &&
                        reset.mutate(a._id)
                      }
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && (
        <Modal title="Answer breakdown" onClose={() => setView(null)} wide>
          {review.data ? <ReviewView r={review.data} /> : <Spinner />}
        </Modal>
      )}
    </>
  );
}

/* ══════════════ Score entry (subject teacher) ══════════════ */
type ScoreRow = {
  student: string;
  studentId: string;
  name: string;
  test1: number | null;
  test2: number | null;
  exam: number | null;
  examSource: 'cbt' | 'manual' | null;
  cbt: { score: number; total: number; exam: number } | null;
};
type EditRow = ScoreRow & { useCbt: boolean; dirty?: boolean };

const toNum = (v: string) => (v.trim() === '' ? null : Number(v));

export function ScoreEntry() {
  const sc = useScope();
  const m = useM();
  const qc = useQueryClient();
  const [term, setTerm] = useState(m.currentTerm?.id ?? '');
  const [cls, setCls] = useState(sc.subjectClasses[0]?._id ?? '');
  const subjects = sc.subjectsFor(cls);
  const [subject, setSubject] = useState('');
  const subj = subjects.some((s) => s._id === subject) ? subject : subjects[0]?._id ?? '';
  const key = ['scores', term, cls, subj];
  const q = useQuery({
    queryKey: key,
    queryFn: () => staffApi<{ locked: boolean; rows: ScoreRow[] }>(`/results/scores?term=${term}&class=${cls}&subject=${subj}`),
    enabled: !!cls && !!subj,
  });
  const [rows, setRows] = useState<EditRow[]>([]);
  useEffect(() => {
    setRows((q.data?.rows ?? []).map((r) => ({ ...r, useCbt: r.examSource === 'cbt' || (r.exam == null && !!r.cbt) })));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      staffApi('/results/scores', {
        method: 'PUT',
        body: {
          term,
          class: cls,
          subject: subj,
          rows: rows.filter((r) => r.dirty).map((r) => ({
            student: r.student,
            test1: r.test1,
            test2: r.test2,
            exam: r.useCbt ? null : r.exam,
            useCbt: r.useCbt,
          })),
        },
      }),
    onSuccess: () => {
      toast.ok('Scores saved');
      qc.invalidateQueries({ queryKey: ['scores'] });
    },
    onError: toast.err,
  });
  const set = (i: number, patch: Partial<EditRow>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch, dirty: true } : r)));
  const dirty = rows.filter((r) => r.dirty).length;
  const locked = q.data?.locked && !sc.me.isAdmin;

  if (!sc.subjectClasses.length) return <Empty>You have no subject assignments yet.</Empty>;
  return (
    <>
      <PageHead
        title="Score entry"
        sub="Enter Test 1 and Test 2 (20 marks each). The exam score (60) comes from the CBT automatically; untick CBT to type it yourself."
      />
      <div className="card mb-5 flex flex-wrap items-end gap-3">
        <Field label="Term"><TermSelect value={term} onChange={setTerm} /></Field>
        <Field label="Class">
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            {sc.subjectClasses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <select className="input" value={subj} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
        <button className="btn-primary ml-auto" disabled={!dirty || save.isPending || locked} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : `Save${dirty ? ` (${dirty})` : ''}`}
        </button>
      </div>
      {locked && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          This term's results are published, so scores are locked. Ask the admin if something needs fixing.
        </div>
      )}
      {q.isLoading && <Spinner />}
      {q.data && !rows.length && <Empty>No students in this class.</Empty>}
      {rows.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Student</th>
                <th className="text-center">Test 1</th>
                <th className="text-center">Test 2</th>
                <th className="text-center">Exam</th>
                <th className="text-center">CBT</th>
                <th className="text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const exam = r.useCbt ? r.cbt?.exam ?? null : r.exam;
                const total = (r.test1 ?? 0) + (r.test2 ?? 0) + (exam ?? 0);
                const any = r.test1 != null || r.test2 != null || exam != null;
                return (
                  <tr key={r.student} className={r.dirty ? 'bg-gold-pale/40' : ''}>
                    <td>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.studentId}</div>
                    </td>
                    {(['test1', 'test2'] as const).map((k) => (
                      <td key={k} className="text-center">
                        <input
                          className="cell-input"
                          type="number"
                          min={0}
                          max={20}
                          disabled={locked}
                          value={r[k] ?? ''}
                          onChange={(e) => set(i, { [k]: toNum(e.target.value) })}
                        />
                      </td>
                    ))}
                    <td className="text-center">
                      {r.useCbt ? (
                        <span className="font-semibold">{r.cbt ? r.cbt.exam : '—'}</span>
                      ) : (
                        <input
                          className="cell-input"
                          type="number"
                          min={0}
                          max={60}
                          disabled={locked}
                          value={r.exam ?? ''}
                          onChange={(e) => set(i, { exam: toNum(e.target.value) })}
                        />
                      )}
                    </td>
                    <td className="text-center text-xs">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={r.useCbt}
                          onChange={(e) => set(i, { useCbt: e.target.checked })}
                        />
                        {r.cbt ? `${r.cbt.score}/${r.cbt.total}` : 'not taken'}
                      </label>
                    </td>
                    <td className="text-center">
                      {any ? <span className={`badge ${GRADE_COLOR[gradeOf(total)]}`}>{total}</span> : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ══════════════ Class sheet (form teacher) ══════════════ */
type ClassRow = {
  student: string;
  studentId: string;
  name: string;
  daysPresent: number | null;
  daysAbsent: number | null;
  traits: { category: 'Affective' | 'Psychomotor'; trait: string; rating: number | null }[];
  remarks: { adviser: string; formMaster: string; principal: string };
  subjects: number;
  dirty?: boolean;
};
type ClassSheetData = {
  locked: boolean;
  daysOpened: number | null;
  affectiveTraits: string[];
  psychomotorTraits: string[];
  rows: ClassRow[];
};

export function ClassSheet() {
  const sc = useScope();
  const m = useM();
  const qc = useQueryClient();
  const [term, setTerm] = useState(m.currentTerm?.id ?? '');
  const [cls, setCls] = useState(sc.formClasses[0]?._id ?? '');
  const [tab, setTab] = useState<'attendance' | 'traits' | 'remarks'>('attendance');
  const q = useQuery({
    queryKey: ['class-sheet', term, cls],
    queryFn: () => staffApi<ClassSheetData>(`/results/class?term=${term}&class=${cls}`),
    enabled: !!cls,
  });
  const [rows, setRows] = useState<ClassRow[]>([]);
  useEffect(() => setRows(q.data?.rows ?? []), [q.data]);
  const set = (i: number, patch: Partial<ClassRow>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch, dirty: true } : r)));
  const rate = (i: number, category: 'Affective' | 'Psychomotor', trait: string, rating: number | null) => {
    const t = rows[i].traits.filter((x) => !(x.category === category && x.trait === trait));
    set(i, { traits: [...t, { category, trait, rating }] });
  };
  const save = useMutation({
    mutationFn: () =>
      staffApi('/results/class', {
        method: 'PUT',
        body: {
          term,
          class: cls,
          rows: rows.filter((r) => r.dirty).map((r) => ({
            student: r.student,
            daysPresent: r.daysPresent,
            daysAbsent: r.daysAbsent,
            traits: r.traits,
            remarks: r.remarks,
          })),
        },
      }),
    onSuccess: () => {
      toast.ok('Class sheet saved');
      qc.invalidateQueries({ queryKey: ['class-sheet'] });
    },
    onError: toast.err,
  });
  const dirty = rows.filter((r) => r.dirty).length;
  const d = q.data;
  const locked = d?.locked && !sc.me.isAdmin;
  if (!sc.formClasses.length) return <Empty>You are not a form teacher of any class.</Empty>;

  return (
    <>
      <PageHead
        title="Class sheet"
        sub="Attendance, traits and remarks for your class. Leave a remark blank and the report card writes one from the student's results."
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <Field label="Term"><TermSelect value={term} onChange={setTerm} /></Field>
        <Field label="Class">
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            {sc.formClasses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['attendance', 'traits', 'remarks'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === t ? 'bg-white font-semibold shadow' : ''}`}>
              {t}
            </button>
          ))}
        </div>
        <button className="btn-primary ml-auto" disabled={!dirty || save.isPending || locked} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : `Save${dirty ? ` (${dirty})` : ''}`}
        </button>
      </div>
      {q.isLoading && <Spinner />}
      {d && !rows.length && <Empty>No students in this class.</Empty>}

      {d && rows.length > 0 && tab === 'attendance' && (
        <div className="card overflow-x-auto p-0">
          <p className="px-4 pt-3 text-xs text-slate-500">
            School opened {d.daysOpened ?? '—'} days this term (set by the admin). Days absent is worked out if left blank.
          </p>
          <table className="tbl">
            <thead><tr><th>Student</th><th>Days present</th><th>Days absent</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.student}>
                  <td className="font-medium">{r.name}</td>
                  <td><input className="cell-input" type="number" min={0} disabled={locked} value={r.daysPresent ?? ''} onChange={(e) => set(i, { daysPresent: toNum(e.target.value) })} /></td>
                  <td><input className="cell-input" type="number" min={0} disabled={locked} value={r.daysAbsent ?? ''} onChange={(e) => set(i, { daysAbsent: toNum(e.target.value) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d && rows.length > 0 && tab === 'traits' && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50">Student</th>
                {d.affectiveTraits.map((t) => <th key={t} className="min-w-20 text-center normal-case">{t}</th>)}
                {d.psychomotorTraits.map((t) => <th key={t} className="min-w-20 bg-gold-pale text-center normal-case">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.student}>
                  <td className="sticky left-0 bg-white font-medium whitespace-nowrap">{r.name}</td>
                  {([
                    ...d.affectiveTraits.map((t) => ['Affective', t] as const),
                    ...d.psychomotorTraits.map((t) => ['Psychomotor', t] as const),
                  ]).map(([cat, t]) => {
                    const v = r.traits.find((x) => x.category === cat && x.trait === t)?.rating ?? '';
                    return (
                      <td key={cat + t} className="text-center">
                        <select
                          className="rounded border border-slate-300 px-1 py-0.5"
                          disabled={locked}
                          value={v}
                          onChange={(e) => rate(i, cat, t, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">-</option>
                          {[5, 4, 3, 2, 1].map((n) => <option key={n}>{n}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d && rows.length > 0 && tab === 'remarks' && (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.student} className="card p-4">
              <div className="mb-2 font-semibold">{r.name} <span className="text-xs font-normal text-slate-400">{r.subjects} subjects</span></div>
              <div className="grid gap-2 md:grid-cols-3">
                {([
                  ['formMaster', "Form master's remark"],
                  ['adviser', 'Academic adviser'],
                  ['principal', "Principal's remark"],
                ] as const).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <textarea
                      className="input min-h-16 text-xs"
                      placeholder="Auto-generated if left blank"
                      disabled={locked || (k === 'principal' && !sc.me.isAdmin)}
                      value={r.remarks[k] ?? ''}
                      onChange={(e) => set(i, { remarks: { ...r.remarks, [k]: e.target.value } })}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ══════════════ Report cards ══════════════ */
type Broadsheet = {
  classCount: number;
  classAvg: number;
  highestAvg: number;
  lowestAvg: number;
  isThirdTerm: boolean;
  rows: {
    id: string;
    studentId: string;
    name: string;
    subjects: number;
    total: number;
    average: number;
    position: number;
    cumulativeAverage: number | null;
    cumulativePosition: number | null;
  }[];
};

export function Reports() {
  const sc = useScope();
  const m = useM();
  const [sp, setSp] = useSearchParams();
  const term = sp.get('term') || m.currentTerm?.id || '';
  const cls = sp.get('class') || sc.anyClasses[0]?._id || '';
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    n.set(k, v);
    setSp(n, { replace: true });
  };
  const q = useQuery({
    queryKey: ['broadsheet', term, cls],
    queryFn: () => staffApi<Broadsheet>(`/results/broadsheet?term=${term}&class=${cls}`),
    enabled: !!cls,
  });
  if (!sc.anyClasses.length) return <Empty>You are not linked to any class yet.</Empty>;
  const d = q.data;
  return (
    <>
      <PageHead title="Report cards" sub="Positions, averages and remarks are worked out automatically from the scores entered." />
      <div className="card mb-5 flex flex-wrap items-end gap-3">
        <Field label="Term"><TermSelect value={term} onChange={(v) => set('term', v)} /></Field>
        <Field label="Class">
          <select className="input" value={cls} onChange={(e) => set('class', e.target.value)}>
            {sc.anyClasses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      {q.isLoading && <Spinner />}
      {d && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Students', d.classCount],
              ['Class average', d.classAvg],
              ['Highest average', d.highestAvg],
              ['Lowest average', d.lowestAvg],
            ].map(([k, v]) => (
              <div key={k} className="card p-4">
                <div className="text-xs text-slate-500 uppercase">{k}</div>
                <div className="font-serif text-2xl font-bold text-navy">{v}</div>
              </div>
            ))}
          </div>
          {!d.rows.length ? (
            <Empty>No results recorded for this class and term yet.</Empty>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pos.</th>
                    <th>Student</th>
                    <th>Subjects</th>
                    <th>Total</th>
                    <th>Average</th>
                    {d.isThirdTerm && <th>Cum. avg</th>}
                    {d.isThirdTerm && <th>Cum. pos.</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-bold">{ordinal(r.position)}</td>
                      <td>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-slate-400">{r.studentId}</div>
                      </td>
                      <td>{r.subjects}</td>
                      <td>{r.total}</td>
                      <td><span className={`badge ${GRADE_COLOR[gradeOf(r.average)]}`}>{r.average}</span></td>
                      {d.isThirdTerm && <td>{r.cumulativeAverage ?? '-'}</td>}
                      {d.isThirdTerm && <td>{ordinal(r.cumulativePosition ?? 0)}</td>}
                      <td className="text-right">
                        <Link to={`/staff/reports/${r.id}?term=${term}`} className="btn-sm btn-ghost">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function ReportView() {
  const { studentId } = useParams();
  const [sp] = useSearchParams();
  const m = useM();
  const term = sp.get('term') || m.currentTerm?.id || '';
  const q = useQuery({
    queryKey: ['report', studentId, term],
    queryFn: () => staffApi<Report>(`/results/report/${studentId}?term=${term}`),
  });
  const share = useMutation({
    mutationFn: () =>
      staffApi<{ url: string; phone: string; name: string; term: string }>(`/results/report/${studentId}/share?term=${term}`),
    onSuccess: (s) => {
      const text = `Dear Parent, here is ${s.name}'s ${s.term} report card from WITH GOD Schools:\n${s.url}`;
      const phone = s.phone.replace(/\D/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    },
    onError: toast.err,
  });
  const r = q.data;
  const pdfName = r ? `${r.student.name} - ${r.term.label} Term ${r.term.session.replace('/', '-')}.pdf` : '';
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/staff/reports?term=${term}`} className="btn-ghost btn-sm">← Back to class</Link>
        {r && (
          <div className="flex flex-wrap gap-2">
            {!r.published && <span className="badge self-center bg-amber-100 text-amber-800">Draft — not yet published</span>}
            <button className="btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => downloadFile(`/results/report/${studentId}/pdf?term=${term}`, pdfName, 'staff').catch(toast.err)}
            >
              Download PDF
            </button>
            <button
              className="btn-sm btn bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!r.published || share.isPending}
              title={r.published ? '' : 'Publish the term first'}
              onClick={() => share.mutate()}
            >
              Send on WhatsApp
            </button>
          </div>
        )}
      </div>
      {q.isLoading && <Spinner />}
      {q.error && <Empty>{(q.error as Error).message}</Empty>}
      {r && <ReportCard r={r} passportPath={`/students/${r.student.id}/passport`} as="staff" />}
    </>
  );
}

/* ══════════════ Dashboard ══════════════ */
export function Dashboard() {
  const m = useM();
  const sc = useScope();
  const students = useQuery({ queryKey: ['students', '', 'active', ''], queryFn: () => staffApi<unknown[]>('/students') });
  const questions = useQuery({ queryKey: ['q-count'], queryFn: () => staffApi<unknown[]>('/questions'), enabled: sc.subjectClasses.length > 0 });
  const attempts = useQuery({ queryKey: ['attempts', '', ''], queryFn: () => staffApi<{ status: string }[]>('/attempts') });
  const submitted = useMemo(() => attempts.data?.filter((a) => a.status === 'submitted').length, [attempts.data]);
  const tiles: [string, unknown, string][] = [
    ['Students', students.data?.length, '/staff/students'],
    ['Questions this term', questions.data?.length ?? 0, '/staff/questions'],
    ['Exams submitted', submitted, '/staff/cbt'],
  ];
  return (
    <>
      <PageHead title={`Welcome, ${m.me.name}`} sub={m.currentTerm ? `${m.currentTerm.label}, ${m.currentTerm.session} session` : ''} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {tiles.map(([k, v, to]) => (
          <Link key={k} to={to} className="card transition hover:shadow-md">
            <div className="text-xs font-semibold text-slate-500 uppercase">{k}</div>
            <div className="mt-1 font-serif text-4xl font-bold text-navy">{v == null ? '…' : String(v)}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-bold">Your classes</h3>
          {!sc.anyClasses.length && <p className="text-sm text-slate-500">No classes assigned yet. Ask the admin.</p>}
          <div className="flex flex-wrap gap-2">
            {sc.anyClasses.map((c) => (
              <Link key={c._id} to={`/staff/reports?class=${c._id}`} className="badge bg-navy/5 px-3 py-1 text-navy">
                {c.name}
                {sc.me.formClasses.includes(c._id) && ' · form'}
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="mb-3 font-bold">How results flow</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Students sit CBT exams; scores fill the Exam column.</li>
            <li>Subject teachers enter Test 1 and Test 2.</li>
            <li>Form teachers add attendance and traits.</li>
            <li>Positions, averages and remarks are calculated.</li>
            <li>Admin publishes. Parents get the report by email.</li>
          </ol>
        </div>
      </div>
    </>
  );
}
