import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '../../api/client';
import { CSV_TEMPLATE, decodeCsv, fromCsv, fromPaste, type ParseResult } from '../../lib/bulk';
import { Empty, Field, Modal, PageHead, Spinner, toast } from '../../components/ui';
import { useM, useScope } from './shell';

type Q = {
  _id: string;
  text: string;
  passage?: string;
  options: string[];
  correct: number;
  subject: { _id: string; name: string };
  class: { _id: string; name: string } | null;
  teacher: { name: string } | null;
};

const L = ['A', 'B', 'C', 'D'];

export default function Questions() {
  const sc = useScope();
  const m = useM();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [cls, setCls] = useState(
    sp.get('class') ?? sc.subjectClasses[0]?._id ?? '',
  );
  const subjects = cls === 'general' ? (sc.me.isAdmin ? m.subjects : m.subjects.filter((s) => sc.me.assignments.some((a) => a.subject === s._id))) : sc.subjectsFor(cls);
  const [subject, setSubject] = useState(sp.get('subject') ?? '');
  const subj = subjects.some((s) => s._id === subject) ? subject : subjects[0]?._id ?? '';
  const [mode, setMode] = useState<'one' | 'csv' | 'paste' | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const key = ['questions', cls, subj];
  const list = useQuery({
    queryKey: key,
    queryFn: () => staffApi<Q[]>(`/questions?class=${cls}&subject=${subj}`),
    enabled: !!cls && !!subj,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['questions'] });
  type Impact = {
    questions: number;
    attemptsChanged: number;
    attemptsRemoved: number;
  };
  const delAll = useMutation({
    mutationFn: async () => {
      const body = { ...target };
      const i = await staffApi<Impact>('/questions/delete-many', {
        body: { ...body, dryRun: true },
      });
      const where = `${sc.subjectName(subj)} · ${
        cls === 'general' ? 'every class' : sc.className(cls)
      }`;
      const lines = [
        `Delete ALL ${i.questions} question(s) for ${where}?`,
        'This cannot be undone.',
      ];
      if (i.attemptsRemoved) {
        lines.push(
          '',
          `${i.attemptsRemoved} student exam(s) will be removed, with the ` +
            'CBT score on their report cards. Those students can sit ' +
            'this subject again once new questions are added.',
        );
      }
      if (i.attemptsChanged) {
        lines.push(
          '',
          `${i.attemptsChanged} other exam(s) will be re-scored without ` +
            'these questions.',
        );
      }
      if (!confirm(lines.join('\n'))) return null;
      return staffApi<Impact>('/questions/delete-many', { body });
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.ok(`${r.questions} question(s) deleted`);
      refresh();
      qc.invalidateQueries({ queryKey: ['attempts'] });
    },
    onError: toast.err,
  });
  const del = useMutation({
    mutationFn: (id: string) => staffApi(`/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.ok('Question deleted');
      refresh();
    },
    onError: toast.err,
  });

  if (!sc.subjectClasses.length) {
    return <Empty>You have no subject assignments yet. Ask the admin to assign you a subject and class.</Empty>;
  }
  const target = { subject: subj, class: cls === 'general' ? null : cls };

  return (
    <>
      <PageHead
        title="Question bank"
        sub={`Questions for the current term (${m.currentTerm?.label} ${m.currentTerm?.session}). Students never see the correct answer, and every student gets the questions and options in a different order.`}
      />
      <div className="card mb-5 flex flex-wrap items-end gap-3">
        <Field label="Class">
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            {sc.subjectClasses.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
            <option value="general">General (every class)</option>
          </select>
        </Field>
        <Field label="Subject">
          <select className="input" value={subj} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!subj} onClick={() => setMode('one')}>+ Add question</button>
          <button className="btn-ghost" disabled={!subj} onClick={() => setMode('csv')}>Upload CSV</button>
          <button className="btn-ghost" disabled={!subj} onClick={() => setMode('paste')}>Paste questions</button>
          <button className="btn-ghost" disabled={!subj} onClick={() => setCopyOpen(true)}>Copy from earlier term</button>
        </div>
      </div>

      {list.isLoading && <Spinner />}
      {list.data && !list.data.length && <Empty>No questions yet for this class and subject.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">{list.data.length} question(s)</div>
            <button
              className="btn-sm btn text-red-600 hover:bg-red-50"
              disabled={delAll.isPending}
              onClick={() => delAll.mutate()}
            >
              {delAll.isPending ? 'Deleting…' : `Delete all ${list.data.length}`}
            </button>
          </div>
          {list.data.map((q, i) => (
            <div key={q._id} className="card flex gap-4 p-4">
              <div className="w-7 shrink-0 font-mono text-sm font-bold text-gold-dark">{i + 1}</div>
              <div className="min-w-0 flex-1">
                {q.passage && (
                  <details className="mb-2 rounded bg-gold-pale/50 px-3 py-1.5 text-xs text-slate-600">
                    <summary className="cursor-pointer font-semibold text-gold-dark">
                      Passage / instruction
                    </summary>
                    <div className="mt-1 whitespace-pre-line">{q.passage}</div>
                  </details>
                )}
                <div className="font-medium whitespace-pre-line">{q.text}</div>
                <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {q.options.map((o, k) => (
                    <div key={k} className={k === q.correct ? 'font-semibold text-emerald-700' : 'text-slate-600'}>
                      {L[k]}. {o} {k === q.correct && '✓'}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {q.class ? q.class.name : 'All classes'} · by {q.teacher?.name ?? 'unknown'}
                </div>
              </div>
              <button
                className="btn-sm btn h-fit text-red-600 hover:bg-red-50"
                onClick={() => confirm('Delete this question?') && del.mutate(q._id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === 'one' && <AddOne target={target} onClose={() => setMode(null)} onDone={refresh} />}
      {(mode === 'csv' || mode === 'paste') && (
        <BulkAdd kind={mode} target={target} onClose={() => setMode(null)} onDone={refresh} />
      )}
      {copyOpen && <CopyFromTerm target={target} onClose={() => setCopyOpen(false)} onDone={refresh} />}
    </>
  );
}

type Target = { subject: string; class: string | null };

function AddOne(p: { target: Target; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [passage, setPassage] = useState('');
  const [opts, setOpts] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState<number | null>(null);
  const reset = () => {
    setText('');
    setOpts(['', '', '', '']);
    setCorrect(null);
  };
  const m = useMutation({
    mutationFn: () =>
      staffApi('/questions', {
        body: { ...p.target, text, passage, options: opts, correct },
      }),
    onSuccess: () => {
      toast.ok('Question added');
      reset();
      p.onDone();
    },
    onError: toast.err,
  });
  return (
    <Modal title="Add a question" onClose={p.onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (correct == null) return toast.err('Tick the correct answer');
          m.mutate();
        }}
      >
        <Field
          label="Passage or instruction (optional)"
          hint="Kept for the next question too, so you can add several questions for one passage."
        >
          <textarea
            className="input min-h-16 text-xs"
            placeholder="e.g. a comprehension passage, or “Choose the word nearest in meaning…”"
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
          />
        </Field>
        <Field label="Question">
          <textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} required />
        </Field>
        {opts.map((o, k) => (
          <div key={k} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(k)}
              title="Mark as correct"
              className={`h-9 w-9 shrink-0 rounded-full text-sm font-bold ${correct === k ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}
            >
              {L[k]}
            </button>
            <input
              className="input"
              placeholder={`Option ${L[k]}`}
              value={o}
              onChange={(e) => setOpts(opts.map((x, j) => (j === k ? e.target.value : x)))}
              required
            />
          </div>
        ))}
        <p className="text-xs text-slate-500">Tap a letter to mark the correct answer.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={p.onClose}>Done</button>
          <button className="btn-primary" disabled={m.isPending}>Save & add another</button>
        </div>
      </form>
    </Modal>
  );
}

function BulkAdd(p: { kind: 'csv' | 'paste'; target: Target; onClose: () => void; onDone: () => void }) {
  const [res, setRes] = useState<ParseResult | null>(null);
  const [paste, setPaste] = useState('');
  const m = useMutation({
    mutationFn: () => staffApi<{ added: number }>('/questions/bulk', { body: { ...p.target, items: res!.valid } }),
    onSuccess: (r) => {
      toast.ok(`${r.added} questions added`);
      p.onDone();
      p.onClose();
    },
    onError: toast.err,
  });
  return (
    <Modal title={p.kind === 'csv' ? 'Upload questions from CSV' : 'Paste questions'} onClose={p.onClose} wide>
      {p.kind === 'csv' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Columns: Question, Option A, Option B, Option C, Option D, Correct Answer (A–D).{' '}
            <button
              className="font-semibold text-navy-light underline"
              onClick={() => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
                a.download = 'question-template.csv';
                a.click();
              }}
            >
              Download template
            </button>
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setRes(fromCsv(decodeCsv(await f.arrayBuffer())));
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Number each question, give options A–D, and end each one with <b>Answer: X</b>.
            Passages and instructions (e.g. “Read the passage carefully…”) are kept and shown
            to students above the questions that follow them.
          </p>
          <textarea
            className="input min-h-48 font-mono text-xs"
            placeholder={'1. What is 2 + 2?\nA. 3  B. 4  C. 5  D. 6\nAnswer: B'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => setRes(fromPaste(paste))}>Check questions</button>
        </div>
      )}
      {res && (
        <div className="mt-4">
          <div className="mb-2 text-sm">
            <b className="text-emerald-700">{res.valid.length} ready</b>
            {res.errors.length > 0 && <b className="ml-3 text-red-700">{res.errors.length} problem(s)</b>}
          </div>
          {res.errors.length > 0 && (
            <ul className="mb-3 max-h-32 overflow-y-auto rounded bg-red-50 p-3 text-xs text-red-800">
              {res.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
            <table className="tbl">
              <tbody>
                {res.valid.map((q, i) => [
                  q.passage && q.passage !== res.valid[i - 1]?.passage ? (
                    <tr key={`p${i}`}>
                      <td colSpan={4} className="bg-gold-pale/50 text-xs whitespace-pre-line text-slate-600">
                        <b className="text-gold-dark">Passage / instruction for the questions below:</b>
                        {'\n'}
                        {q.passage.length > 300 ? q.passage.slice(0, 300) + '…' : q.passage}
                      </td>
                    </tr>
                  ) : null,
                  <tr key={i}>
                    <td className="w-8 text-slate-400">{i + 1}</td>
                    <td>{q.text}</td>
                    <td className="text-xs text-slate-500">{q.options.map((o, k) => `${L[k]}. ${o}`).join('  ')}</td>
                    <td className="font-bold text-emerald-700">{q.correct}</td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" disabled={!res.valid.length || m.isPending} onClick={() => m.mutate()}>
              Add {res.valid.length} questions
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CopyFromTerm(p: { target: Target; onClose: () => void; onDone: () => void }) {
  const m = useM();
  const terms = m.sessions.flatMap((s) =>
    s.terms.filter((t) => !t.isCurrent).map((t) => ({ id: t._id, label: `${['', '1st', '2nd', '3rd'][t.number]} Term ${s.name}` })),
  );
  const [from, setFrom] = useState(terms[0]?.id ?? '');
  const mut = useMutation({
    mutationFn: () => staffApi<{ added: number }>('/questions/copy', { body: { ...p.target, fromTerm: from } }),
    onSuccess: (r) => {
      toast.ok(`${r.added} questions copied into this term`);
      p.onDone();
      p.onClose();
    },
    onError: toast.err,
  });
  return (
    <Modal title="Copy questions from an earlier term" onClose={p.onClose}>
      {!terms.length ? (
        <p className="text-sm text-slate-600">There are no earlier terms yet.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Copies this subject's questions for the same class into the current term.
          </p>
          <Field label="Copy from">
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <button className="btn-primary" disabled={mut.isPending} onClick={() => mut.mutate()}>Copy questions</button>
        </div>
      )}
    </Modal>
  );
}
