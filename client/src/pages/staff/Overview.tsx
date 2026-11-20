import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { staffApi } from '../../api/client';
import { Empty, PageHead, Spinner } from '../../components/ui';

type SubjectRow = {
  subjectId: string;
  subject: string;
  classId: string | null;
  className: string;
  assigned: boolean;
  students: number | null;
  questions: number;
  generalQuestions: number;
  questionsByThem: number;
  examsTaken: number;
  averagePercent: number | null;
  testScoresEntered: number | null;
};

type FormRow = {
  classId: string;
  className: string;
  students: number;
  attendanceDone: number;
  traitsDone: number;
  remarksTyped: number;
};

export type Overview = {
  term: string;
  staff: {
    id: string;
    name: string;
    username: string;
    role: string;
    active: boolean;
  };
  totals: {
    students: number;
    classes: number;
    subjects: number;
    questions: number;
    questionsByThem: number;
    examsTaken: number;
    subjectsWithoutQuestions: number;
  };
  subjects: SubjectRow[];
  formClasses: FormRow[];
};

function Status({ r }: { r: SubjectRow }) {
  if (!r.assigned) {
    return <span className="badge whitespace-nowrap bg-amber-100 text-amber-800">Not assigned</span>;
  }
  if (r.questions + r.generalQuestions === 0) {
    return <span className="badge whitespace-nowrap bg-red-100 text-red-700">No questions yet</span>;
  }
  return <span className="badge whitespace-nowrap bg-emerald-100 text-emerald-800">Questions set</span>;
}

/** Progress cell like "12 / 18", greyed when nothing done. */
function Of({ n, of }: { n: number | null; of: number | null }) {
  if (n == null || of == null) return <span className="text-slate-400">—</span>;
  const done = of > 0 && n >= of;
  return (
    <span className={n === 0 ? 'text-slate-400' : done ? 'font-semibold text-emerald-700' : ''}>
      {n} / {of}
    </span>
  );
}

/* The overview itself: used on the admin's staff page and
   on a teacher's own dashboard ("me"). */
export function TeacherOverview({ id, self }: { id: string; self?: boolean }) {
  const q = useQuery({
    queryKey: ['overview', id],
    queryFn: () => staffApi<Overview>(`/overview/${id}`),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Empty>{(q.error as Error).message}</Empty>;
  const d = q.data!;
  const t = d.totals;
  const qs = (r: SubjectRow) =>
    `class=${r.classId ?? 'general'}&subject=${r.subjectId}`;

  const tiles: [string, number, string?][] = [
    ['Students', t.students, `across ${t.classes} class(es)`],
    ['Subjects', t.subjects],
    [
      'Questions',
      t.questions,
      `${t.questionsByThem} typed in by ${self ? 'you' : 'them'}`,
    ],
    ['Exams taken', t.examsTaken, d.term],
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([k, v, sub]) => (
          <div key={k} className="card p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase">{k}</div>
            <div className="font-serif text-3xl font-bold text-navy">{v}</div>
            {sub && <div className="text-xs text-slate-400">{sub}</div>}
          </div>
        ))}
      </div>

      {t.subjectsWithoutQuestions > 0 && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {t.subjectsWithoutQuestions} subject(s) have no exam questions yet
          {self ? ', so students can’t sit them.' : '.'}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <div className="px-4 pt-4 pb-2">
          <span className="font-bold">{self ? 'My subjects' : 'Subjects taught'}</span>
          <span className="ml-2 text-xs text-slate-400">{d.term}</span>
        </div>
        {!d.subjects.length ? (
          <p className="px-4 pb-4 text-sm text-slate-500">
            No subjects assigned{self ? ' to you yet. Ask the admin.' : ' yet.'}
          </p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Class</th>
                <th>Subject</th>
                <th>Status</th>
                <th className="text-center">Questions</th>
                <th className="text-center">Exams taken</th>
                <th className="text-center">Avg score</th>
                <th className="text-center">Tests entered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.subjects.map((r) => (
                <tr key={`${r.subjectId}|${r.classId}`}>
                  <td className="font-medium whitespace-nowrap">{r.className}</td>
                  <td>{r.subject}</td>
                  <td><Status r={r} /></td>
                  <td className="text-center">
                    <b>{r.questions}</b>
                    {r.questions > 0 && r.questionsByThem !== r.questions && (
                      <div className="text-[11px] text-slate-400">
                        {r.questionsByThem} by {self ? 'you' : 'them'}
                      </div>
                    )}
                    {r.generalQuestions > 0 && (
                      <div className="text-[11px] text-slate-400">
                        +{r.generalQuestions} general
                      </div>
                    )}
                  </td>
                  <td className="text-center"><Of n={r.examsTaken} of={r.students} /></td>
                  <td className="text-center">
                    {r.averagePercent == null ? '—' : `${r.averagePercent}%`}
                  </td>
                  <td className="text-center"><Of n={r.testScoresEntered} of={r.students} /></td>
                  <td className="text-right whitespace-nowrap">
                    <Link to={`/staff/questions?${qs(r)}`} className="btn-sm btn-ghost mr-1">
                      Questions
                    </Link>
                    {r.classId && (
                      <Link to={`/staff/scores?${qs(r)}`} className="btn-sm btn-ghost">
                        Scores
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {d.formClasses.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <div className="px-4 pt-4 pb-2 font-bold">Form classes</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Class</th>
                <th className="text-center">Students</th>
                <th className="text-center">Attendance</th>
                <th className="text-center">Traits</th>
                <th className="text-center">Remarks typed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.formClasses.map((f) => (
                <tr key={f.classId}>
                  <td className="font-medium">{f.className}</td>
                  <td className="text-center">{f.students}</td>
                  <td className="text-center"><Of n={f.attendanceDone} of={f.students} /></td>
                  <td className="text-center"><Of n={f.traitsDone} of={f.students} /></td>
                  <td className="text-center">
                    {f.remarksTyped}
                    <div className="text-[11px] text-slate-400">rest auto</div>
                  </td>
                  <td className="text-right">
                    <Link to={`/staff/class-sheet?class=${f.classId}`} className="btn-sm btn-ghost">
                      Class sheet
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Admin page: /staff/team/:id */
export function StaffOverviewPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ['overview', id],
    queryFn: () => staffApi<Overview>(`/overview/${id}`),
  });
  const s = q.data?.staff;
  return (
    <>
      <Link to="/staff/team" className="btn-ghost btn-sm mb-4">← All staff</Link>
      <PageHead
        title={s?.name ?? 'Staff'}
        sub={
          s && (
            <>
              @{s.username} · <span className="capitalize">{s.role}</span>
              {!s.active && ' · inactive'}
            </>
          )
        }
      />
      <TeacherOverview id={id!} />
    </>
  );
}
