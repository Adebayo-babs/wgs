import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '../../api/client';
import type { SessionInfo, TermInfo } from '../../lib/types';
import { Empty, Field, Modal, PageHead, Spinner, toast } from '../../components/ui';
import { useM } from './shell';

const TL = ['', '1st', '2nd', '3rd'];

/** "2027-01-11" in Lagos time, for date inputs. */
const ymd = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) : '';
/** "11 Jan 2027" */
const nice = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Lagos',
      })
    : '';

function nextSessionName(name: string) {
  const m = name.match(/(\d{4})\D+(\d{4})/);
  return m ? `${+m[1] + 1}/${+m[2] + 1}` : '';
}

/** The term after the current one, and whether it starts a new session. */
function upcoming(sessions: SessionInfo[]) {
  const cs = sessions.find((s) => s.terms.some((t) => t.isCurrent));
  const ct = cs?.terms.find((t) => t.isCurrent);
  if (!cs || !ct) return null;
  if (ct.number < 3) {
    const nt = cs.terms.find((t) => t.number === ct.number + 1);
    return nt ? { cur: ct, curSession: cs, next: nt, nextSession: cs, newSession: false } : null;
  }
  const ns = sessions.find((s) => s.name === nextSessionName(cs.name));
  const nt = ns?.terms.find((t) => t.number === 1);
  return ns && nt ? { cur: ct, curSession: cs, next: nt, nextSession: ns, newSession: true } : null;
}

/* What the system will do next, and when. */
function AutoBanner({ sessions, onSetDate }: { sessions: SessionInfo[]; onSetDate: (t: TermInfo, s: SessionInfo) => void }) {
  const st = useQuery({ queryKey: ['settings'], queryFn: () => staffApi<{ autoAdvance: boolean }>('/settings') });
  const u = upcoming(sessions);
  if (!u) return null;
  const curName = `${TL[u.cur.number]} Term ${u.curSession.name}`;
  const nextName = `${TL[u.next.number]} Term ${u.nextSession.name}`;
  if (st.data && !st.data.autoAdvance) {
    return (
      <div className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
        Automatic term changes are <b>off</b> (School setup). Use the buttons below to move terms by hand.
      </div>
    );
  }
  if (!u.next.startsOn) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <span>
          Set the start date of <b>{nextName}</b> and the system will open it by itself on that day.
        </span>
        <button className="btn-sm btn-primary" onClick={() => onSetDate(u.next, u.nextSession)}>Set start date</button>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <b>Automatic, on {nice(u.next.startsOn)}:</b>{' '}
      {!u.cur.publishedAt && <>{curName} results are published (parents emailed), </>}
      {u.newSession && <>every student is promoted to their next class, </>}
      and <b>{nextName}</b> opens.
    </div>
  );
}

type LogRow = { _id: string; action: string; detail: string; ok: boolean; createdAt: string };

function ActivityLog() {
  const q = useQuery({ queryKey: ['automation-log'], queryFn: () => staffApi<LogRow[]>('/admin/automation') });
  if (!q.data?.length) return null;
  return (
    <div className="card mt-5">
      <h3 className="mb-2 font-bold">What the system did automatically</h3>
      <ul className="space-y-1 text-sm">
        {q.data.map((x) => (
          <li key={x._id} className={x.ok ? '' : 'text-red-700'}>
            <span className="mr-2 text-xs text-slate-400">
              {new Date(x.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <b>{x.action}</b> — {x.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════════ Terms, publishing, promotion ══════════════ */
export function Terms() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: () => staffApi<{ sessions: SessionInfo[]; smtpConfigured: boolean }>('/admin/sessions'),
    refetchInterval: (query) =>
      query.state.data?.sessions.some((s) => s.terms.some((t) => t.delivery?.running)) ? 3000 : false,
  });
  const [editTerm, setEditTerm] = useState<{ t: TermInfo; s: SessionInfo } | null>(null);
  const [delivery, setDelivery] = useState<TermInfo | null>(null);
  const [promote, setPromote] = useState<SessionInfo | null>(null);
  const [newSession, setNewSession] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-sessions'] });
    qc.invalidateQueries({ queryKey: ['meta'] });
  };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => staffApi(path, { body: body ?? {} }),
    onSuccess: () => refresh(),
    onError: toast.err,
  });
  const create = useMutation({
    mutationFn: () => staffApi('/admin/sessions', { body: { name: newSession } }),
    onSuccess: () => {
      toast.ok('Session created');
      setNewSession('');
      refresh();
    },
    onError: toast.err,
  });

  if (q.isLoading) return <Spinner />;
  const { sessions = [], smtpConfigured = false } = q.data ?? {};
  return (
    <>
      <PageHead
        title="Terms & publishing"
        sub="Publishing a term releases report cards to students, locks score entry for teachers and emails every parent their child's report."
      />
      {!smtpConfigured && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Email isn't set up on the server yet (SMTP settings), so reports won't be emailed. You can still share them on WhatsApp from each report card.
        </div>
      )}
      {!sessions.length && (
        <div className="card mb-4 flex items-end gap-3">
          <Field label="First session"><input className="input" placeholder="2026/2027" value={newSession} onChange={(e) => setNewSession(e.target.value)} /></Field>
          <button className="btn-primary" onClick={() => create.mutate()}>Create</button>
        </div>
      )}
      <AutoBanner sessions={sessions} onSetDate={(t, s) => setEditTerm({ t, s })} />
      {sessions.flatMap((s) => s.terms).filter((t) => t.isCurrent).map((t) => (
        <ClassMismatches key={t._id} termId={t._id} />
      ))}
      <div className="space-y-5">
        {sessions.map((s) => (
          <div key={s._id} className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xl font-bold">
                {s.name} session
                {s.isCurrent && <span className="badge ml-2 bg-navy text-white">Current</span>}
                {s.closedAt && <span className="badge ml-2 bg-slate-200 text-slate-600">Closed</span>}
              </h3>
              {!s.closedAt && s.isCurrent && (
                <button className="btn-gold btn-sm" onClick={() => setPromote(s)}>End session & promote students</button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {s.terms.map((t) => (
                <div key={t._id} className={`rounded-lg border p-4 ${t.isCurrent ? 'border-gold bg-gold-pale/40' : 'border-slate-200'}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <b>{TL[t.number]} Term</b>
                    {t.isCurrent && <span className="badge bg-gold text-navy">Current</span>}
                  </div>
                  <div className="mb-3 space-y-0.5 text-xs text-slate-600">
                    <div className="font-semibold text-slate-700">
                      Starts: {t.startsOn ? nice(t.startsOn) : 'not set'}
                    </div>
                    <div>Term ended: {t.termEnded || '—'}</div>
                    <div>Next term begins: {t.nextTermBegins || '—'}</div>
                    <div>Days opened: {t.daysOpened ?? '—'}</div>
                    <div>
                      {t.publishedAt ? (
                        <span className="font-semibold text-emerald-700">Published {new Date(t.publishedAt).toLocaleDateString()}</span>
                      ) : (
                        'Not published'
                      )}
                    </div>
                    {t.delivery?.running && <div className="font-semibold text-navy">Sending reports… {t.delivery.sent} sent</div>}
                    {t.publishedAt && !t.delivery?.running && t.delivery?.finishedAt && (
                      <div>Emails: {t.delivery.sent} sent · {t.delivery.failed} failed · {t.delivery.skipped} skipped</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button className="btn-sm btn-ghost" onClick={() => setEditTerm({ t, s })}>Edit dates</button>
                    {!t.isCurrent && !s.closedAt && (
                      <button className="btn-sm btn-ghost" onClick={() => confirm(`Make ${TL[t.number]} Term ${s.name} the current term? New exams and scores will go into it.`) && act.mutate({ path: `/admin/terms/${t._id}/activate` })}>
                        Make current
                      </button>
                    )}
                    {!t.publishedAt ? (
                      <button
                        className="btn-sm btn-primary"
                        onClick={() =>
                          confirm('Publish this term? Students will see their reports, teachers can no longer change scores, and parents will be emailed.') &&
                          act.mutate({ path: `/admin/terms/${t._id}/publish` }, { onSuccess: () => toast.ok('Published. Reports are being sent.') })
                        }
                      >
                        Publish results
                      </button>
                    ) : (
                      <>
                        <button className="btn-sm btn-ghost" onClick={() => setDelivery(t)}>Delivery</button>
                        <button className="btn-sm btn text-red-600 hover:bg-red-50" onClick={() => confirm('Unpublish? Students lose access until you publish again.') && act.mutate({ path: `/admin/terms/${t._id}/unpublish` })}>
                          Unpublish
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {editTerm && (
        <TermForm
          t={editTerm.t}
          session={editTerm.s}
          onClose={() => setEditTerm(null)}
          onDone={() => {
            refresh();
            qc.invalidateQueries({ queryKey: ['automation-log'] });
          }}
        />
      )}
      <ActivityLog />
      {delivery && <Delivery t={delivery} onClose={() => setDelivery(null)} onResend={refresh} />}
      {promote && <Promotion s={promote} onClose={() => setPromote(null)} onDone={refresh} />}
    </>
  );
}

type Mismatch = {
  student: string;
  studentId: string;
  name: string;
  from: string;
  to: string;
};

/* Students moved to another class during the term whose
   results are still filed under the old class (moves made
   before this was automatic). */
function ClassMismatches({ termId }: { termId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['mismatches', termId],
    queryFn: () => staffApi<Mismatch[]>(`/admin/terms/${termId}/class-mismatches`),
  });
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const fix = useMutation({
    mutationFn: () =>
      staffApi<{ moved: number }>(`/admin/terms/${termId}/class-mismatches/fix`, {
        body: { students: [...pick] },
      }),
    onSuccess: (r) => {
      toast.ok(`${r.moved} student(s) moved`);
      setOpen(false);
      qc.invalidateQueries();
    },
    onError: toast.err,
  });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <span>
          {rows.length} student(s) are now in a different class, but this
          term's results are still filed under their old class.
        </span>
        <button
          className="btn-sm btn-ghost"
          onClick={() => {
            setPick(new Set(rows.map((r) => r.student)));
            setOpen(true);
          }}
        >
          Review
        </button>
      </div>
      {open && (
        <Modal title="Results filed under an old class" onClose={() => setOpen(false)} wide>
          <p className="mb-3 text-sm text-slate-600">
            Ticked students will have this term's results (scores, exams,
            report card, position) moved to the class they're in now. Untick
            anyone who should stay in their old class for this term's report,
            for example a student moved early for next session.
          </p>
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr><th /><th>Student</th><th>Results filed under</th><th>Class now</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student}>
                    <td>
                      <input
                        type="checkbox"
                        checked={pick.has(r.student)}
                        onChange={(e) => {
                          const n = new Set(pick);
                          if (e.target.checked) n.add(r.student);
                          else n.delete(r.student);
                          setPick(n);
                        }}
                      />
                    </td>
                    <td>{r.name} <span className="text-xs text-slate-400">{r.studentId}</span></td>
                    <td>{r.from}</td>
                    <td className="font-semibold">{r.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" disabled={!pick.size || fix.isPending} onClick={() => fix.mutate()}>
              Move {pick.size} student(s)' results
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TermForm(p: { t: TermInfo; session: SessionInfo; onClose: () => void; onDone: () => void }) {
  const [startsOn, setStartsOn] = useState(ymd(p.t.startsOn));
  const [termEnded, setEnded] = useState(p.t.termEnded);
  const [nextTermBegins, setNext] = useState(p.t.nextTermBegins);
  const [days, setDays] = useState(p.t.daysOpened?.toString() ?? '');
  const today = ymd(new Date().toISOString());
  const startsNewSession = p.t.number === 1 && !p.session.isCurrent && !p.session.closedAt;
  const m = useMutation({
    mutationFn: () =>
      staffApi(`/admin/terms/${p.t._id}`, {
        method: 'PATCH',
        body: {
          startsOn: startsOn || null,
          termEnded,
          nextTermBegins,
          daysOpened: days ? Number(days) : null,
        },
      }),
    onSuccess: () => {
      toast.ok('Saved');
      p.onDone();
      p.onClose();
    },
    onError: toast.err,
  });
  const save = () => {
    const changed = startsOn && startsOn !== ymd(p.t.startsOn);
    if (changed && !p.t.isCurrent && !p.t.publishedAt && startsOn <= today) {
      const msg = [
        'That date is today or already past, so the change happens as soon as you save:',
        '',
        '• the current term’s results are published (parents emailed)',
        ...(startsNewSession ? ['• every student is promoted to their next class'] : []),
        `• ${TL[p.t.number]} Term ${p.session.name} opens`,
        '',
        'Continue?',
      ].join('\n');
      if (!confirm(msg)) return;
    }
    m.mutate();
  };
  return (
    <Modal title={`${TL[p.t.number]} Term ${p.session.name}`} onClose={p.onClose}>
      <div className="space-y-3">
        <Field
          label="Term starts on"
          hint={
            startsNewSession
              ? 'On this day the system publishes the last term, promotes every student and opens this term.'
              : 'On this day the system publishes the previous term and opens this one.'
          }
        >
          <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </Field>
        <Field label="Term ended"><input className="input" value={termEnded} onChange={(e) => setEnded(e.target.value)} placeholder="30th July 2026" /></Field>
        <Field label="Next term begins" hint="Leave blank to use the next term’s start date automatically.">
          <input className="input" value={nextTermBegins} onChange={(e) => setNext(e.target.value)} placeholder="Filled in automatically" />
        </Field>
        <Field label="Days school opened"><input className="input" type="number" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">These appear on every report card for this term.</p>
        <button className="btn-primary" onClick={save} disabled={m.isPending}>Save</button>
      </div>
    </Modal>
  );
}

type DeliveryRow = {
  student: string;
  studentId: string;
  name: string;
  className: string;
  email: string;
  phone: string;
  status: string | null;
  error: string;
};

function Delivery(p: { t: TermInfo; onClose: () => void; onResend: () => void }) {
  const q = useQuery({
    queryKey: ['delivery', p.t._id],
    queryFn: () => staffApi<{ rows: DeliveryRow[] }>(`/admin/terms/${p.t._id}/delivery`),
    refetchInterval: 4000,
  });
  const resend = useMutation({
    mutationFn: (onlyFailed: boolean) => staffApi(`/admin/terms/${p.t._id}/deliver`, { body: { onlyFailed } }),
    onSuccess: () => {
      toast.ok('Sending started');
      p.onResend();
    },
    onError: toast.err,
  });
  const color: Record<string, string> = {
    sent: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
    skipped: 'bg-slate-100 text-slate-600',
  };
  return (
    <Modal title="Report delivery" onClose={p.onClose} wide>
      <div className="mb-3 flex gap-2">
        <button className="btn-primary btn-sm" onClick={() => resend.mutate(true)}>Retry failed & unsent</button>
        <button className="btn-ghost btn-sm" onClick={() => confirm('Email every parent again?') && resend.mutate(false)}>Resend to all</button>
      </div>
      {!q.data ? (
        <Spinner />
      ) : !q.data.rows.length ? (
        <Empty>No results this term.</Empty>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="tbl">
            <thead><tr><th>Student</th><th>Class</th><th>Parent email</th><th>Status</th></tr></thead>
            <tbody>
              {q.data.rows.map((r) => (
                <tr key={r.student}>
                  <td>{r.name}</td>
                  <td>{r.className}</td>
                  <td className="text-xs">{r.email || <span className="text-amber-700">none</span>}</td>
                  <td>
                    <span className={`badge ${color[r.status ?? ''] ?? 'bg-slate-100'}`}>{r.status ?? 'pending'}</span>
                    {r.error && <div className="text-xs text-slate-500">{r.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

type PromoGroup = {
  classId: string;
  className: string;
  nextClass: string | null;
  students: { id: string; studentId: string; name: string; cumulativeAverage: number | null; suggested: string }[];
};

function Promotion(p: { s: SessionInfo; onClose: () => void; onDone: () => void }) {
  const q = useQuery({
    queryKey: ['promotion', p.s._id],
    queryFn: () => staffApi<PromoGroup[]>(`/admin/sessions/${p.s._id}/promotion`),
  });
  const [dec, setDec] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    q.data?.forEach((g) => g.students.forEach((s) => (init[s.id] = s.suggested)));
    setDec(init);
  }, [q.data]);
  const close = useMutation({
    mutationFn: () =>
      staffApi<{ counts: Record<string, number>; newSession: string }>(`/admin/sessions/${p.s._id}/close`, { body: { decisions: dec } }),
    onSuccess: (r) => {
      toast.ok(`Done. ${r.counts.promote} promoted, ${r.counts.repeat} repeating, ${r.counts.graduate} graduated. ${r.newSession} 1st Term is now current.`);
      p.onDone();
      p.onClose();
    },
    onError: toast.err,
  });
  const third = p.s.terms.find((t) => t.number === 3);
  const total = Object.values(dec);
  return (
    <Modal title={`End ${p.s.name} session`} onClose={p.onClose} wide>
      {!third?.publishedAt && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Publish the third-term results first. You can review the list now, but closing the session needs them published.
        </div>
      )}
      <p className="mb-3 text-sm text-slate-600">
        Every student is moved to the next class unless you change it here. The top class graduates. The next session is created and its 1st Term becomes current. Students below the repeat mark in School setup are suggested to repeat.
      </p>
      {q.isLoading && <Spinner />}
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {q.data?.filter((g) => g.students.length).map((g) => (
          <div key={g.classId}>
            <div className="mb-1 text-sm font-bold">
              {g.className} → {g.nextClass ?? 'Graduation'}
            </div>
            <table className="tbl">
              <tbody>
                {g.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="text-xs text-slate-500">Cum. avg {s.cumulativeAverage ?? '—'}</td>
                    <td className="w-40">
                      <select className="input py-1" value={dec[s.id] ?? s.suggested} onChange={(e) => setDec({ ...dec, [s.id]: e.target.value })}>
                        {g.nextClass && <option value="promote">Promote</option>}
                        <option value="repeat">Repeat class</option>
                        <option value="graduate">Graduate</option>
                        <option value="withdraw">Withdrawn</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <div className="text-xs text-slate-500">
          {total.filter((x) => x === 'promote').length} promote · {total.filter((x) => x === 'repeat').length} repeat ·{' '}
          {total.filter((x) => x === 'graduate').length} graduate
        </div>
        <button
          className="btn-primary"
          disabled={close.isPending || !third?.publishedAt}
          onClick={() => confirm('This moves every student and opens the next session. Continue?') && close.mutate()}
        >
          Close session & promote
        </button>
      </div>
    </Modal>
  );
}

/* ══════════════ School setup ══════════════ */
type Settings = {
  school: Record<string, string>;
  affectiveTraits: string[];
  psychomotorTraits: string[];
  remarks: Record<string, Record<string, string[]>>;
  repeatBelow: number;
  emailReportsOnPublish: boolean;
  autoAdvance: boolean;
};

export function SchoolSetup() {
  const m = useM();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => staffApi<Settings>('/settings') });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => staffApi('/settings', { method: 'PUT', body: s }),
    onSuccess: () => {
      toast.ok('Settings saved');
      qc.invalidateQueries({ queryKey: ['meta'] });
    },
    onError: toast.err,
  });
  const refreshMeta = () => qc.invalidateQueries({ queryKey: ['meta'] });
  const crud = useMutation({
    mutationFn: (a: { path: string; method: string; body?: unknown }) => staffApi(a.path, { method: a.method, body: a.body }),
    onSuccess: refreshMeta,
    onError: toast.err,
  });
  const [newClass, setNewClass] = useState('');
  const [newSubject, setNewSubject] = useState('');

  if (!s) return <Spinner />;
  const lines = (arr: string[]) => arr.join('\n');
  const parse = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);

  return (
    <>
      <PageHead title="School setup" actions={<button className="btn-primary" onClick={() => save.mutate()}>Save settings</button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="font-bold">School details (report card letterhead)</h3>
          {(['name', 'shortName', 'motto', 'address', 'phone', 'email'] as const).map((k) => (
            <Field key={k} label={k === 'shortName' ? 'Short name' : k}>
              <input className="input" value={s.school[k] ?? ''} onChange={(e) => setS({ ...s, school: { ...s.school, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>

        <div className="card space-y-3">
          <h3 className="font-bold">Automation</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.emailReportsOnPublish} onChange={(e) => setS({ ...s, emailReportsOnPublish: e.target.checked })} />
            Email report cards to parents when a term is published
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={s.autoAdvance}
              onChange={(e) => setS({ ...s, autoAdvance: e.target.checked })}
            />
            <span>
              Change terms automatically on their start dates
              <span className="block text-xs text-slate-500">
                Publishes the term that’s ending, opens the next one, and at
                the start of a new session promotes every student.
              </span>
            </span>
          </label>
          <Field label="Suggest repeating below (cumulative average)" hint="0 = promote everyone by default. The admin always confirms.">
            <input className="input w-32" type="number" min={0} max={100} value={s.repeatBelow} onChange={(e) => setS({ ...s, repeatBelow: Number(e.target.value) })} />
          </Field>
          <h3 className="pt-2 font-bold">Traits on the report card</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Affective (one per line)">
              <textarea className="input min-h-48 text-xs" value={lines(s.affectiveTraits)} onChange={(e) => setS({ ...s, affectiveTraits: parse(e.target.value) })} />
            </Field>
            <Field label="Psychomotor (one per line)">
              <textarea className="input min-h-48 text-xs" value={lines(s.psychomotorTraits)} onChange={(e) => setS({ ...s, psychomotorTraits: parse(e.target.value) })} />
            </Field>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h3 className="mb-1 font-bold">Automatic remarks</h3>
          <p className="mb-3 text-xs text-slate-500">
            Chosen by the grade of the student's average (cumulative average in third term). Put one remark per line; with several, classmates get different ones. A remark typed on the class sheet always wins.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {([
              ['formMaster', "Form master's"],
              ['principal', "Principal's"],
              ['adviser', 'Academic adviser'],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <div className="mb-2 text-sm font-semibold">{label}</div>
                {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((g) => (
                  <Field key={g} label={`Grade ${g}`}>
                    <textarea
                      className="input mb-2 min-h-14 text-xs"
                      value={lines(s.remarks?.[k]?.[g] ?? [])}
                      onChange={(e) => setS({ ...s, remarks: { ...s.remarks, [k]: { ...s.remarks[k], [g]: parse(e.target.value) } } })}
                    />
                  </Field>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-1 font-bold">Classes</h3>
          <p className="mb-3 text-xs text-slate-500">Order decides promotion: students move to the next active class down the list.</p>
          <table className="tbl mb-3">
            <tbody>
              {m.classes.map((c, i) => (
                <tr key={c._id} className={c.active ? '' : 'opacity-50'}>
                  <td>{c.name}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-sm btn" disabled={i === 0} onClick={() => swap(i, i - 1)}>↑</button>
                    <button className="btn-sm btn" disabled={i === m.classes.length - 1} onClick={() => swap(i, i + 1)}>↓</button>
                    <button className="btn-sm btn-ghost ml-1" onClick={() => crud.mutate({ path: `/classes/${c._id}`, method: 'PATCH', body: { active: !c.active } })}>
                      {c.active ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <input className="input" placeholder="New class, e.g. SSS 1" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
            <button
              className="btn-ghost"
              onClick={() => {
                const order = Math.max(0, ...m.classes.map((c) => c.order)) + 10;
                crud.mutate({ path: '/classes', method: 'POST', body: { name: newClass, order } }, { onSuccess: () => setNewClass('') });
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-1 font-bold">Subjects</h3>
          <p className="mb-3 text-xs text-slate-500">Renaming a subject updates it everywhere, including past report cards.</p>
          <div className="mb-3 max-h-96 overflow-y-auto">
            <table className="tbl">
              <tbody>
                {m.subjects.map((x) => (
                  <tr key={x._id} className={x.active ? '' : 'opacity-50'}>
                    <td>
                      <input
                        className="w-full bg-transparent outline-none focus:border-b focus:border-navy-light"
                        defaultValue={x.name}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== x.name && crud.mutate({ path: `/subjects/${x._id}`, method: 'PATCH', body: { name: e.target.value } })}
                      />
                    </td>
                    <td className="text-right">
                      <button className="btn-sm btn-ghost" onClick={() => crud.mutate({ path: `/subjects/${x._id}`, method: 'PATCH', body: { active: !x.active } })}>
                        {x.active ? 'Turn off' : 'Turn on'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="New subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
            <button className="btn-ghost" onClick={() => crud.mutate({ path: '/subjects', method: 'POST', body: { name: newSubject } }, { onSuccess: () => setNewSubject('') })}>
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  );

  function swap(a: number, b: number) {
    const A = m.classes[a];
    const B = m.classes[b];
    Promise.all([
      staffApi(`/classes/${A._id}`, { method: 'PATCH', body: { order: B.order } }),
      staffApi(`/classes/${B._id}`, { method: 'PATCH', body: { order: A.order } }),
    ])
      .then(refreshMeta)
      .catch(toast.err);
  }
}
