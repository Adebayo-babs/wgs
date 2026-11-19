import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  downloadFile,
  getSession,
  setSession,
  studentApi,
} from '../../api/client';
import type { ExamReview, Report } from '../../lib/types';
import { compressImage } from '../../lib/util';
import {
  AuthImage,
  Empty,
  Field,
  PageHead,
  Spinner,
  toast,
} from '../../components/ui';
import ReportCard from '../../components/ReportCard';

type Profile = {
  studentId: string;
  name: string;
  className: string;
  hasPassport: boolean;
  term: { label: string; session: string };
};

function useLoggedOut(cb: () => void) {
  useEffect(() => {
    window.addEventListener('wgs-logout', cb);
    return () => window.removeEventListener('wgs-logout', cb);
  }, [cb]);
}

/* ══════ Login ══════ */
export function StudentLogin() {
  const nav = useNavigate();
  const [studentId, setId] = useState('');
  const [password, setPw] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api<{ token: string; user: Record<string, unknown> }>(
        '/auth/student/login',
        { body: { studentId, password } },
      ),
    onSuccess: (s) => {
      setSession('student', s);
      nav('/student/exams', { replace: true });
    },
    onError: toast.err,
  });
  if (getSession('student')) return <Navigate to="/student/exams" replace />;
  return (
    <AuthShell title="Student Portal" sub="Sign in with the student ID and password your school gave you.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Student ID">
          <input
            className="input uppercase placeholder:normal-case"
            value={studentId}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. WGS20171001"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <button className="btn-primary w-full" disabled={m.isPending}>
          {m.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-slate-500">
          Forgot your password? Ask your class teacher to reset it.
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell(p: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy to-navy-light p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3 text-white">
          <img src="/favicon.svg" className="h-10 w-10" alt="" />
          <span className="font-serif text-xl font-bold">WITH GOD Schools</span>
        </Link>
        <div className="card">
          <h1 className="text-2xl font-bold">{p.title}</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">{p.sub}</p>
          {p.children}
        </div>
      </div>
    </div>
  );
}

/* ══════ Layout ══════ */
export function StudentLayout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(!!getSession('student'));
  useLoggedOut(() => setAuthed(false));
  const profile = useQuery({
    queryKey: ['s-profile'],
    queryFn: () => studentApi<Profile>('/student/profile'),
    enabled: authed,
  });
  if (!authed) return <Navigate to="/student" replace />;
  const logout = () => {
    setSession('student', null);
    qc.clear();
    nav('/student');
  };
  const p = profile.data;
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${isActive ? 'bg-gold text-navy' : 'text-white/80 hover:bg-white/10'}`;
  return (
    <div className="min-h-screen">
      <header className="no-print bg-navy">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-full border-2 border-gold bg-navy-mid">
              <AuthImage
                path={p?.hasPassport ? '/student/passport' : null}
                as="student"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="leading-tight text-white">
              <div className="font-semibold">{p?.name ?? '…'}</div>
              <div className="text-xs text-gold-light">
                {p ? `${p.studentId} · ${p.className} · ${p.term.label} ${p.term.session}` : ''}
              </div>
            </div>
          </div>
          <button className="btn-sm btn border border-white/30 text-white" onClick={logout}>
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-3">
          <NavLink to="/student/exams" className={tab}>Exams</NavLink>
          <NavLink to="/student/reports" className={tab}>Report cards</NavLink>
          <NavLink to="/student/passport" className={tab}>Passport photo</NavLink>
          <NavLink to="/student/password" className={tab}>Password</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/* ══════ Exam lobby ══════ */
type LobbyRow = {
  subjectId: string;
  subject: string;
  count: number;
  status: 'not_started' | 'in_progress' | 'submitted';
  score: number | null;
  total: number | null;
};

export function ExamLobby() {
  const q = useQuery({
    queryKey: ['s-exams'],
    queryFn: () => studentApi<LobbyRow[]>('/student/exams'),
  });
  if (q.isLoading) return <Spinner />;
  const rows = q.data ?? [];
  const done = rows.filter((r) => r.status === 'submitted').length;
  return (
    <>
      <PageHead
        title="Your exams"
        sub={rows.length ? `${done} of ${rows.length} subjects completed` : undefined}
      />
      {!rows.length && <Empty>No exams have been set for your class yet.</Empty>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.subjectId} className="card flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold">{r.subject}</h3>
              {r.status === 'submitted' && (
                <span className="badge bg-emerald-100 text-emerald-800">Done</span>
              )}
              {r.status === 'in_progress' && (
                <span className="badge bg-amber-100 text-amber-800">Started</span>
              )}
            </div>
            <p className="mb-4 text-sm text-slate-500">{r.count} questions</p>
            <div className="mt-auto">
              {r.status === 'submitted' ? (
                <Link to={`/student/exams/${r.subjectId}/result`} className="btn-ghost w-full">
                  Score: {r.score}/{r.total} · View answers
                </Link>
              ) : (
                <Link to={`/student/exams/${r.subjectId}`} className="btn-primary w-full">
                  {r.status === 'in_progress' ? 'Continue exam' : 'Start exam'}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ══════ Taking an exam ══════ */
type Paper = {
  attemptId: string;
  subject: string;
  questions: { id: string; text: string; options: string[] }[];
};
const LETTERS = ['A', 'B', 'C', 'D'];

function loadAnswers(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

export function TakeExam() {
  const { subjectId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState(false);

  const paper = useQuery({
    queryKey: ['s-paper', subjectId],
    queryFn: () =>
      studentApi<Paper>(`/student/exams/${subjectId}/start`, { body: {} }),
    staleTime: Infinity,
    retry: false,
  });
  const storeKey = paper.data ? `wgs_ans_${paper.data.attemptId}` : '';
  useEffect(() => {
    if (storeKey) setAnswers(loadAnswers(storeKey));
  }, [storeKey]);

  const submit = useMutation({
    mutationFn: () =>
      studentApi<ExamReview>(`/student/exams/${subjectId}/submit`, {
        body: { answers },
      }),
    onSuccess: (res) => {
      try {
        localStorage.removeItem(storeKey);
      } catch {
        /* ignore */
      }
      qc.setQueryData(['s-review', subjectId], res);
      qc.invalidateQueries({ queryKey: ['s-exams'] });
      qc.removeQueries({ queryKey: ['s-paper', subjectId] });
      nav(`/student/exams/${subjectId}/result`, { replace: true });
    },
    onError: toast.err,
  });

  if (paper.isLoading) return <Spinner label="Preparing your exam…" />;
  if (paper.error) {
    return (
      <Empty>
        {(paper.error as Error).message}
        <div className="mt-4">
          <Link to="/student/exams" className="btn-ghost">Back to exams</Link>
        </div>
      </Empty>
    );
  }
  const p = paper.data!;
  const q = p.questions[idx];
  const answered = Object.keys(answers).length;
  const pick = (opt: number) => {
    const next = { ...answers, [q.id]: opt };
    setAnswers(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
      <div className="card">
        <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
          <span className="font-semibold text-navy">{p.subject}</span>
          <span>
            Question {idx + 1} of {p.questions.length}
          </span>
        </div>
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-gold transition-all"
            style={{ width: `${(answered / p.questions.length) * 100}%` }}
          />
        </div>
        <p className="mb-5 text-lg font-medium whitespace-pre-line">{q.text}</p>
        <div className="space-y-2">
          {q.options.map((o, k) => (
            <button
              key={k}
              onClick={() => pick(k)}
              className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition ${answers[q.id] === k ? 'border-navy bg-navy/5' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${answers[q.id] === k ? 'bg-navy text-white' : 'bg-slate-100'}`}
              >
                {LETTERS[k]}
              </span>
              {o}
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-between">
          <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
            ← Previous
          </button>
          {idx < p.questions.length - 1 ? (
            <button className="btn-primary" onClick={() => setIdx(idx + 1)}>
              Next →
            </button>
          ) : (
            <button className="btn-gold" onClick={() => setConfirm(true)}>
              Finish & submit
            </button>
          )}
        </div>
      </div>

      <div className="card h-fit">
        <div className="mb-3 text-sm font-semibold">
          Answered {answered}/{p.questions.length}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {p.questions.map((x, k) => (
            <button
              key={x.id}
              onClick={() => setIdx(k)}
              className={`h-8 rounded text-xs font-semibold ${k === idx ? 'ring-2 ring-gold' : ''} ${answers[x.id] != null ? 'bg-navy text-white' : 'bg-slate-100'}`}
            >
              {k + 1}
            </button>
          ))}
        </div>
        <button className="btn-gold mt-4 w-full" onClick={() => setConfirm(true)}>
          Submit exam
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card max-w-sm">
            <h3 className="mb-2 text-lg font-bold">Submit your exam?</h3>
            <p className="mb-4 text-sm text-slate-600">
              {answered < p.questions.length
                ? `You have ${p.questions.length - answered} unanswered question(s). `
                : ''}
              You cannot change your answers after submitting.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirm(false)}>
                Keep working
              </button>
              <button
                className="btn-primary"
                disabled={submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExamResult() {
  const { subjectId } = useParams();
  const q = useQuery({
    queryKey: ['s-review', subjectId],
    queryFn: () => studentApi<ExamReview>(`/student/exams/${subjectId}/review`),
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty>Result not found.</Empty>;
  return <ReviewView r={q.data} back="/student/exams" />;
}

export function ReviewView({ r, back }: { r: ExamReview; back?: string }) {
  const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
  return (
    <>
      <div className="card mb-5 text-center">
        <div className="text-sm text-slate-500">{r.subject}</div>
        <div className="font-serif text-6xl font-bold text-navy">
          {r.score}
          <span className="text-2xl text-slate-400">/{r.total}</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-gold-dark">{pct}%</div>
        {back && (
          <Link to={back} className="btn-ghost mt-4">
            Back to exams
          </Link>
        )}
      </div>
      <div className="space-y-2">
        {r.breakdown.map((b, i) => (
          <div
            key={i}
            className={`rounded-lg border-l-4 bg-white p-3 text-sm shadow-sm ${b.ok ? 'border-emerald-500' : 'border-red-500'}`}
          >
            <div className="font-medium">
              {i + 1}. {b.question}
            </div>
            <div className="mt-1 text-slate-600">
              Your answer:{' '}
              {b.given ? `${b.given}. ${b.givenText}` : <em>not answered</em>}
              {!b.ok && (
                <span className="ml-3 text-emerald-700">
                  Correct: {b.correct}. {b.correctText}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ══════ Report cards ══════ */
type TermRow = { id: string; label: string; session: string };

export function StudentReports() {
  const [termId, setTermId] = useState<string | null>(null);
  const terms = useQuery({
    queryKey: ['s-reports'],
    queryFn: () => studentApi<TermRow[]>('/student/reports'),
  });
  const chosen = termId ?? terms.data?.[0]?.id ?? null;
  const rep = useQuery({
    queryKey: ['s-report', chosen],
    queryFn: () => studentApi<Report>(`/student/reports/${chosen}`),
    enabled: !!chosen,
  });
  if (terms.isLoading) return <Spinner />;
  if (!terms.data?.length) {
    return (
      <>
        <PageHead title="Report cards" />
        <Empty>Your report card will appear here once the school releases results.</Empty>
      </>
    );
  }
  const t = terms.data.find((x) => x.id === chosen);
  return (
    <>
      <PageHead
        title="Report cards"
        actions={
          <>
            <select className="input w-auto" value={chosen ?? ''} onChange={(e) => setTermId(e.target.value)}>
              {terms.data.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label} {x.session}
                </option>
              ))}
            </select>
            <button
              className="btn-primary"
              onClick={() =>
                downloadFile(
                  `/student/reports/${chosen}/pdf`,
                  `Report ${t?.label} ${t?.session.replace('/', '-')}.pdf`,
                  'student',
                ).catch(toast.err)
              }
            >
              Download PDF
            </button>
          </>
        }
      />
      {rep.isLoading && <Spinner />}
      {rep.data && <ReportCard r={rep.data} passportPath="/student/passport" as="student" />}
    </>
  );
}

/* ══════ Passport ══════ */
export function StudentPassport() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [v, setV] = useState(0);
  const profile = qc.getQueryData<Profile>(['s-profile']);
  const save = useMutation({
    mutationFn: () => studentApi('/student/passport', { method: 'PUT', body: { image: preview } }),
    onSuccess: () => {
      toast.ok('Passport photo saved');
      setPreview(null);
      setV((x) => x + 1);
      qc.invalidateQueries({ queryKey: ['s-profile'] });
    },
    onError: toast.err,
  });
  return (
    <>
      <PageHead title="Passport photo" sub="This photo appears on your report card." />
      <div className="card flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="h-48 w-40 overflow-hidden rounded-lg border-2 border-slate-200 bg-slate-50">
          {preview ? (
            <img src={preview} className="h-full w-full object-cover" alt="" />
          ) : (
            <AuthImage
              path={profile?.hasPassport ? '/student/passport' : null}
              as="student"
              version={v}
              className="h-full w-full object-cover"
              fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">No photo yet</div>}
            />
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Use a clear, front-facing photo on a plain background. It will be resized automatically.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPreview(await compressImage(f));
              } catch (err) {
                toast.err(err);
              }
            }}
          />
          {preview && (
            <div className="flex gap-2">
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : 'Save photo'}
              </button>
              <button className="btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ══════ Change password (both portals) ══════ */
export function ChangePassword({ kind }: { kind: 'staff' | 'student' }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api(`/auth/${kind}/password`, { body: { current, next }, as: kind }),
    onSuccess: () => {
      toast.ok('Password changed');
      setCurrent('');
      setNext('');
      setAgain('');
    },
    onError: toast.err,
  });
  return (
    <>
      <PageHead title="Change password" />
      <form
        className="card max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (next !== again) return toast.err('The new passwords do not match');
          m.mutate();
        }}
      >
        <Field label="Current password">
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 6 characters">
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Repeat new password">
          <input className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </Field>
        <button className="btn-primary" disabled={m.isPending}>Save</button>
      </form>
    </>
  );
}
