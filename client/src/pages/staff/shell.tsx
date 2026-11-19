import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession, setSession, staffApi } from '../../api/client';
import type { Meta } from '../../lib/types';
import { Field, Spinner, toast } from '../../components/ui';
import { AuthShell } from '../student/Student';

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => staffApi<Meta>('/meta'),
    staleTime: 60_000,
  });
}

/** Meta is loaded by the layout before any page renders. */
export function useM(): Meta {
  const q = useMeta();
  return q.data!;
}

/* Classes and subjects this person may pick, based on
   their role. Admin gets everything. */
export function useScope() {
  const m = useM();
  return useMemo(() => {
    const me = m.me;
    const activeClasses = m.classes.filter((c) => c.active);
    const subjectsFor = (classId: string) =>
      me.isAdmin
        ? m.subjects.filter((s) => s.active)
        : m.subjects.filter((s) =>
            me.assignments.some(
              (a) => a.class === classId && a.subject === s._id,
            ),
          );
    return {
      me,
      subjectClasses: me.isAdmin
        ? activeClasses
        : activeClasses.filter((c) =>
            me.assignments.some((a) => a.class === c._id),
          ),
      formClasses: me.isAdmin
        ? activeClasses
        : activeClasses.filter((c) => me.formClasses.includes(c._id)),
      anyClasses: me.isAdmin
        ? activeClasses
        : activeClasses.filter(
            (c) =>
              me.formClasses.includes(c._id) ||
              me.assignments.some((a) => a.class === c._id),
          ),
      subjectsFor,
      className: (id?: string | null) =>
        m.classes.find((c) => c._id === id)?.name ?? 'All classes',
      subjectName: (id?: string | null) =>
        m.subjects.find((s) => s._id === id)?.name ?? '',
    };
  }, [m]);
}

/** Term picker: every term, current first. */
export function TermSelect(p: { value: string; onChange: (v: string) => void }) {
  const m = useM();
  const opts = m.sessions.flatMap((s) =>
    s.terms.map((t) => ({
      id: t._id,
      label: `${['', '1st', '2nd', '3rd'][t.number]} Term ${s.name}${t.isCurrent ? ' (current)' : ''}`,
    })),
  );
  return (
    <select className="input w-auto" value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StaffLogin() {
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api<{ token: string; user: Record<string, unknown> }>('/auth/staff/login', {
        body: { username, password },
      }),
    onSuccess: (s) => {
      setSession('staff', s);
      nav('/staff/home', { replace: true });
    },
    onError: toast.err,
  });
  if (getSession('staff')) return <Navigate to="/staff/home" replace />;
  return (
    <AuthShell title="Staff Portal" sub="Sign in with the username and password from the school admin.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Username">
          <input className="input lowercase placeholder:normal-case" value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password" hint="Moved over from the old portal? Your password is your old PIN.">
          <input className="input" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
        </Field>
        <button className="btn-primary w-full" disabled={m.isPending}>
          {m.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

type NavItem = [to: string, label: string, show: boolean];

export function StaffLayout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(!!getSession('staff'));
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const f = () => setAuthed(false);
    window.addEventListener('wgs-logout', f);
    return () => window.removeEventListener('wgs-logout', f);
  }, []);
  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: () => staffApi<Meta>('/meta'),
    enabled: authed,
    staleTime: 60_000,
  });
  if (!authed) return <Navigate to="/staff" replace />;
  if (meta.isLoading || !meta.data) {
    return meta.error ? (
      <div className="p-8 text-red-700">{(meta.error as Error).message}</div>
    ) : (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }
  const me = meta.data.me;
  const t = meta.data.currentTerm;
  const isForm = me.isAdmin || me.formClasses.length > 0;
  const isSubj = me.isAdmin || me.assignments.length > 0;

  const groups: [string, NavItem[]][] = [
    ['', [['/staff/home', 'Dashboard', true]]],
    [
      'Exams',
      [
        ['/staff/questions', 'Question bank', isSubj],
        ['/staff/cbt', 'CBT results', isSubj],
      ],
    ],
    [
      'Results',
      [
        ['/staff/scores', 'Score entry', isSubj],
        ['/staff/class-sheet', 'Class sheet', isForm],
        ['/staff/reports', 'Report cards', true],
      ],
    ],
    ['People', [['/staff/students', 'Students', true], ['/staff/team', 'Staff', me.isAdmin]]],
    [
      'Admin',
      [
        ['/staff/terms', 'Terms & publishing', me.isAdmin],
        ['/staff/settings', 'School setup', me.isAdmin],
      ],
    ],
    ['', [['/staff/password', 'Change password', true]]],
  ];

  const logout = () => {
    setSession('staff', null);
    qc.clear();
    nav('/staff');
  };

  return (
    <div className="min-h-screen md:flex">
      <aside
        className={`no-print ${menu ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-navy p-4 md:sticky md:top-0 md:block md:h-screen`}
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" className="h-9 w-9" alt="" />
          <div>
            <div className="font-serif font-bold text-white">WITH GOD Schools</div>
            <div className="text-xs text-gold-light">Staff Portal</div>
          </div>
        </div>
        {groups.map(([g, items], k) => {
          const vis = items.filter((i) => i[2]);
          if (!vis.length) return null;
          return (
            <div key={k} className="mb-3">
              {g && <div className="mb-1 px-3 text-[10px] font-bold tracking-widest text-white/40 uppercase">{g}</div>}
              {vis.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenu(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-gold font-semibold text-navy' : 'text-white/80 hover:bg-white/10'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="mt-6 border-t border-white/10 pt-4 text-sm text-white/80">
          <div className="font-semibold text-white">{me.name}</div>
          <div className="mb-3 text-xs capitalize text-gold-light">{me.role}</div>
          <button className="btn-sm btn w-full border border-white/30 text-white" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMenu(false)} />}
      <div className="min-w-0 flex-1">
        <div className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="text-2xl md:hidden" onClick={() => setMenu(true)} aria-label="Menu">
            ☰
          </button>
          <div className="text-sm text-slate-600">
            {t ? (
              <>
                Current term: <b className="text-navy">{t.label} {t.session}</b>
                {t.publishedAt && <span className="badge ml-2 bg-emerald-100 text-emerald-800">Published</span>}
              </>
            ) : (
              <span className="text-red-700">No current term set</span>
            )}
          </div>
        </div>
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
