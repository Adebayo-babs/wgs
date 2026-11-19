import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '../../api/client';
import type { Named } from '../../lib/types';
import { compressImage } from '../../lib/util';
import { AuthImage, Empty, Field, Modal, PageHead, Spinner, toast } from '../../components/ui';
import { useM, useScope } from './shell';

/* ══════════════ Students ══════════════ */
type StudentRow = {
  _id: string;
  studentId: string;
  name: string;
  gender: string;
  age: number | null;
  regNo: string;
  status: string;
  class: Named | null;
  hasPassport: boolean;
  parent: { name: string; email: string; phone: string };
  examsTaken: number;
};

export function Students() {
  const sc = useScope();
  const [cls, setCls] = useState('');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<StudentRow | 'new' | null>(null);
  const qs = new URLSearchParams({ status });
  if (cls) qs.set('class', cls);
  if (search.trim()) qs.set('search', search.trim());
  const q = useQuery({
    queryKey: ['students', cls, status, search.trim()],
    queryFn: () => staffApi<StudentRow[]>(`/students?${qs}`),
  });
  const canEdit = (s: StudentRow) => sc.me.isAdmin || (!!s.class && sc.me.formClasses.includes(s.class._id));
  const missingParent = q.data?.filter((s) => !s.parent?.email && !s.parent?.phone).length ?? 0;

  return (
    <>
      <PageHead
        title="Students"
        sub="Student accounts are created here. Give the student their ID and password to sign in."
        actions={<button className="btn-primary" onClick={() => setEdit('new')}>+ Add student</button>}
      />
      <div className="card mb-5 flex flex-wrap items-end gap-3">
        <Field label="Class">
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">{sc.me.isAdmin ? 'All classes' : 'All my classes'}</option>
            {sc.anyClasses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="graduated">Graduated</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </Field>
        <Field label="Search">
          <input className="input" placeholder="Name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
      </div>
      {missingParent > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {missingParent} student(s) here have no parent email or phone. Add them so report cards can be sent automatically.
        </div>
      )}
      {q.isLoading && <Spinner />}
      {q.data && !q.data.length && <Empty>No students found.</Empty>}
      {q.data && q.data.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead>
              <tr><th /><th>Student</th><th>Class</th><th>Parent contact</th><th>Exams</th><th /></tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s._id}>
                  <td className="w-12">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                      <AuthImage path={s.hasPassport ? `/students/${s._id}/passport` : null} as="staff" className="h-full w-full object-cover" />
                    </div>
                  </td>
                  <td>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.studentId}</div>
                  </td>
                  <td>{s.class?.name ?? <span className="text-red-600">No class</span>}</td>
                  <td className="text-xs">
                    {s.parent?.email || s.parent?.phone ? (
                      <>
                        <div>{s.parent.email}</div>
                        <div>{s.parent.phone}</div>
                      </>
                    ) : (
                      <span className="text-amber-700">Missing</span>
                    )}
                  </td>
                  <td>{s.examsTaken}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link to={`/staff/reports/${s._id}`} className="btn-sm btn-ghost mr-1">Report</Link>
                    {canEdit(s) && <button className="btn-sm btn-ghost" onClick={() => setEdit(s)}>Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <StudentForm s={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function StudentForm({ s, onClose }: { s: StudentRow | null; onClose: () => void }) {
  const sc = useScope();
  const qc = useQueryClient();
  const allowed = s ? sc.formClasses : sc.anyClasses;
  const [f, setF] = useState({
    studentId: s?.studentId ?? '',
    name: s?.name ?? '',
    class: s?.class?._id ?? allowed[0]?._id ?? '',
    password: '',
    gender: s?.gender ?? '',
    age: s?.age?.toString() ?? '',
    regNo: s?.regNo ?? '',
    status: s?.status ?? 'active',
    pName: s?.parent?.name ?? '',
    pEmail: s?.parent?.email ?? '',
    pPhone: s?.parent?.phone ?? '',
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        studentId: f.studentId,
        name: f.name,
        class: f.class,
        gender: f.gender,
        age: f.age ? Number(f.age) : null,
        regNo: f.regNo,
        parent: { name: f.pName, email: f.pEmail, phone: f.pPhone },
      };
      let id = s?._id;
      if (s) {
        await staffApi(`/students/${s._id}`, { method: 'PATCH', body: { ...body, status: f.status } });
        if (f.password) await staffApi(`/students/${s._id}/password`, { body: { password: f.password } });
      } else {
        id = (await staffApi<{ id: string }>('/students', { body: { ...body, password: f.password } })).id;
      }
      if (photo && id) await staffApi(`/students/${id}/passport`, { method: 'PUT', body: { image: photo } });
    },
    onSuccess: () => {
      toast.ok(s ? 'Student updated' : `Student added. They can now sign in with ${f.studentId.toUpperCase()}.`);
      qc.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: toast.err,
  });

  return (
    <Modal title={s ? `Edit ${s.name}` : 'Add a student'} onClose={onClose} wide>
      <form
        className="grid gap-4 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Student ID"><input className="input uppercase placeholder:normal-case" value={f.studentId} onChange={up('studentId')} required /></Field>
        <Field label="Full name"><input className="input" value={f.name} onChange={up('name')} required /></Field>
        <Field label="Class">
          <select className="input" value={f.class} onChange={up('class')} required>
            {allowed.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={s ? 'New password' : 'Password'} hint={s ? 'Leave blank to keep the current one' : 'At least 4 characters'}>
          <input className="input" value={f.password} onChange={up('password')} required={!s} minLength={4} />
        </Field>
        <Field label="Gender">
          <select className="input" value={f.gender} onChange={up('gender')}>
            <option value="">—</option><option value="M">Male</option><option value="F">Female</option>
          </select>
        </Field>
        <Field label="Age"><input className="input" type="number" min={1} max={30} value={f.age} onChange={up('age')} /></Field>
        <Field label="Reg. No"><input className="input" value={f.regNo} onChange={up('regNo')} /></Field>
        {s && (
          <Field label="Status">
            <select className="input" value={f.status} onChange={up('status')}>
              <option value="active">Active</option><option value="graduated">Graduated</option><option value="withdrawn">Withdrawn</option>
            </select>
          </Field>
        )}
        <div className="md:col-span-3">
          <div className="mb-2 border-t border-slate-200 pt-3 text-sm font-semibold">Parent / guardian (report cards are sent here)</div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Name"><input className="input" value={f.pName} onChange={up('pName')} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.pEmail} onChange={up('pEmail')} /></Field>
            <Field label="WhatsApp / phone"><input className="input" value={f.pPhone} onChange={up('pPhone')} placeholder="0803..." /></Field>
          </div>
        </div>
        <div className="flex items-center gap-3 md:col-span-3">
          <div className="h-20 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
            {photo ? <img src={photo} className="h-full w-full object-cover" alt="" /> : (
              <AuthImage path={s?.hasPassport ? `/students/${s._id}/passport` : null} as="staff" className="h-full w-full object-cover" />
            )}
          </div>
          <label className="text-sm">
            <span className="label">Passport photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setPhoto(await compressImage(file).catch((err) => (toast.err(err), null)));
              }}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 md:col-span-3">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ══════════════ Staff (admin) ══════════════ */
type StaffRow = {
  _id: string;
  name: string;
  username: string;
  role: 'admin' | 'teacher';
  active: boolean;
  assignments: { subject: Named; class: Named }[];
  formClasses: Named[];
  questionCount: number;
  submissionCount: number;
};

export function Team() {
  const q = useQuery({ queryKey: ['staff'], queryFn: () => staffApi<StaffRow[]>('/staff') });
  const [edit, setEdit] = useState<StaffRow | 'new' | null>(null);
  return (
    <>
      <PageHead
        title="Staff"
        sub="Create staff accounts and decide what each teacher handles. Subject assignments control questions and score entry; form classes control attendance, traits and remarks."
        actions={<button className="btn-primary" onClick={() => setEdit('new')}>+ Add staff</button>}
      />
      {q.isLoading && <Spinner />}
      <div className="grid gap-4 md:grid-cols-2">
        {q.data?.map((s) => (
          <div key={s._id} className={`card ${s.active ? '' : 'opacity-60'}`}>
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="font-bold">{s.name}</div>
                <div className="text-xs text-slate-500">
                  @{s.username} · <span className="capitalize">{s.role}</span>
                  {!s.active && ' · inactive'}
                </div>
              </div>
              <button className="btn-sm btn-ghost" onClick={() => setEdit(s)}>Edit</button>
            </div>
            <div className="mb-2 text-xs text-slate-500">
              {s.questionCount} questions this term · {s.submissionCount} exam submissions
            </div>
            {s.formClasses.length > 0 && (
              <div className="mb-1 text-xs"><b>Form teacher:</b> {s.formClasses.map((c) => c.name).join(', ')}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {s.assignments.map((a, i) => (
                <span key={i} className="badge bg-slate-100 text-slate-700">{a.subject?.name} · {a.class?.name}</span>
              ))}
              {!s.assignments.length && s.role === 'teacher' && <span className="text-xs text-amber-700">No subjects assigned</span>}
            </div>
          </div>
        ))}
      </div>
      {edit && <StaffForm s={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function StaffForm({ s, onClose }: { s: StaffRow | null; onClose: () => void }) {
  const m = useM();
  const qc = useQueryClient();
  const [name, setName] = useState(s?.name ?? '');
  const [username, setUsername] = useState(s?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(s?.role ?? 'teacher');
  const [active, setActive] = useState(s?.active ?? true);
  const [pairs, setPairs] = useState(s?.assignments.map((a) => ({ subject: a.subject?._id, class: a.class?._id })) ?? []);
  const [forms, setForms] = useState(s?.formClasses.map((c) => c._id) ?? []);
  const [addCls, setAddCls] = useState(m.classes[0]?._id ?? '');
  const [addSub, setAddSub] = useState(m.subjects[0]?._id ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, username, role, assignments: pairs, formClasses: forms };
      if (s) {
        await staffApi(`/staff/${s._id}`, { method: 'PATCH', body: { ...body, active } });
        if (password) await staffApi(`/staff/${s._id}/password`, { body: { password } });
      } else {
        await staffApi('/staff', { body: { ...body, password } });
      }
    },
    onSuccess: () => {
      toast.ok('Saved');
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['meta'] });
      onClose();
    },
    onError: toast.err,
  });
  type Impact = {
    questions: number;
    attemptsChanged: number;
    attemptsRemoved: number;
  };
  const remove = useMutation({
    mutationFn: async () => {
      const i = await staffApi<Impact>(`/staff/${s!._id}/impact`);
      const lines = [
        `Delete ${s!.name}? This cannot be undone.`,
        '',
        `• ${i.questions} question(s) they set will be deleted`,
      ];
      if (i.attemptsRemoved) {
        lines.push(
          `• ${i.attemptsRemoved} student exam(s) made only of their ` +
            'questions will be removed, with the CBT score on the report card',
        );
      }
      if (i.attemptsChanged) {
        lines.push(
          `• ${i.attemptsChanged} other exam(s) will be re-scored ` +
            'without their questions',
        );
      }
      if (!confirm(lines.join('\n'))) return false;
      await staffApi(`/staff/${s!._id}`, { method: 'DELETE' });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.ok(`${s!.name} deleted`);
      qc.invalidateQueries();
      onClose();
    },
    onError: toast.err,
  });
  const nm = (list: Named[], id: string) => list.find((x) => x._id === id)?.name ?? '?';

  return (
    <Modal title={s ? `Edit ${s.name}` : 'Add staff'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Username"><input className="input lowercase placeholder:normal-case" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
          <Field label={s ? 'New password' : 'Password'} hint={s ? 'Blank = unchanged' : '6+ characters'}>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required={!s} minLength={6} />
          </Field>
          <Field label="Role">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'teacher')}>
              <option value="teacher">Teacher</option><option value="admin">Admin</option>
            </select>
          </Field>
        </div>
        {s && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Account active
          </label>
        )}
        <div>
          <span className="label">Form teacher of</span>
          <div className="flex flex-wrap gap-2">
            {m.classes.filter((c) => c.active).map((c) => (
              <label key={c._id} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${forms.includes(c._id) ? 'border-navy bg-navy text-white' : 'border-slate-300'}`}>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={forms.includes(c._id)}
                  onChange={(e) => setForms(e.target.checked ? [...forms, c._id] : forms.filter((x) => x !== c._id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Subjects taught</span>
          <div className="mb-2 flex flex-wrap gap-1">
            {pairs.map((p, i) => (
              <span key={i} className="badge flex items-center gap-1 bg-slate-100 text-slate-700">
                {nm(m.subjects, p.subject)} · {nm(m.classes, p.class)}
                <button type="button" className="text-red-600" onClick={() => setPairs(pairs.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
            {!pairs.length && <span className="text-xs text-slate-400">None yet</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={addSub} onChange={(e) => setAddSub(e.target.value)}>
              {m.subjects.filter((x) => x.active).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </select>
            <select className="input w-auto" value={addCls} onChange={(e) => setAddCls(e.target.value)}>
              {m.classes.filter((x) => x.active).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </select>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (pairs.some((p) => p.subject === addSub && p.class === addCls)) return;
                setPairs([...pairs, { subject: addSub, class: addCls }]);
              }}
            >
              Add
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {s && s._id !== m.me.id && (
            <button
              type="button"
              className="btn mr-auto text-red-600 hover:bg-red-50"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Deleting…' : 'Delete staff'}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}