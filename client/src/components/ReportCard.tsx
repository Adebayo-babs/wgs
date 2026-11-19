import type { Report } from '../lib/types';
import { dash, ordinal } from '../lib/util';
import type { Kind } from '../api/client';
import { AuthImage } from './ui';

/* On-screen report card. Mirrors the printed layout; the
   PDF that parents get is drawn by the server. */
export default function ReportCard(p: {
  r: Report;
  passportPath: string | null;
  as: Kind;
}) {
  const { r } = p;
  const cum = r.term.number === 3;
  const KV = ({ pairs }: { pairs: [string, unknown][] }) => (
    <tr>
      {pairs.map(([k, v]) => [
        <td key={k} className="rc-k">{k}</td>,
        <td key={k + 'v'}>{dash(v)}</td>,
      ])}
    </tr>
  );

  return (
    <div className="rc-sheet rounded-lg border border-slate-200 shadow-sm">
      <div className="mb-3 flex items-start gap-4 border-b-2 border-gold pb-3">
        <div className="w-20" />
        <div className="flex-1 text-center">
          <div className="font-serif text-xl font-extrabold text-navy">
            {r.school.name}
          </div>
          <div className="italic">{r.school.motto}</div>
          <div>Address: {r.school.address}</div>
          <div>Phone: {r.school.phone}</div>
        </div>
        <div className="h-24 w-20 overflow-hidden border border-slate-400">
          <AuthImage
            path={r.student.hasPassport ? p.passportPath : null}
            as={p.as}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center text-center text-[10px] text-slate-400">
                No passport
              </div>
            }
          />
        </div>
      </div>

      <div className="mb-3 bg-navy py-1 text-center font-bold tracking-wide text-white">
        {cum ? 'CUMULATIVE ' : ''}REPORT SHEET — {r.term.label.toUpperCase()}{' '}
        TERM, {r.term.session}
      </div>

      <table className="mb-3">
        <tbody>
          <KV pairs={[['Name', r.student.name], ['Student ID', r.student.studentId], ['Class', r.student.className]]} />
          <KV pairs={[['Gender', r.student.gender], ['Age', r.student.age], ['Reg. No', r.student.regNo]]} />
          <KV pairs={[['Term ended', r.term.termEnded], ['Next term begins', r.term.nextTermBegins], ['Days opened', r.attendance.opened]]} />
          <KV pairs={[['Days present', r.attendance.present], ['Days absent', r.attendance.absent], ['No. in class', r.summary.classCount]]} />
          <KV pairs={[['Overall total', r.summary.overallTotal], ['Average', r.summary.average], ['Position', ordinal(r.summary.position)]]} />
          <KV pairs={[['Class average', r.summary.classAvg], ['Highest average', r.summary.highestAvg], ['Lowest average', r.summary.lowestAvg]]} />
          {r.cumulative ? (
            <KV pairs={[['Cumulative avg', r.cumulative.average], ['Cumulative pos.', ordinal(r.cumulative.position)], ['Performance', r.cumulative.performance]]} />
          ) : (
            <KV pairs={[['Performance', r.summary.performance], ['Grade', r.summary.grade], ['', '']]} />
          )}
        </tbody>
      </table>

      <div className="overflow-x-auto">
        <table className="mb-3 text-center">
          <thead>
            <tr>
              <th className="text-left">Subject</th>
              <th>Test 1 (20)</th>
              <th>Test 2 (20)</th>
              <th>Exam (60)</th>
              <th>Total (100)</th>
              {cum && <th>1st Term</th>}
              {cum && <th>2nd Term</th>}
              {cum && <th>Cum. Avg</th>}
              <th>Grade</th>
              <th>Pos.</th>
              <th>Class Avg</th>
              {!cum && <th>Weighted</th>}
              <th>Highest</th>
              <th>Lowest</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {r.subjects.length === 0 && (
              <tr>
                <td colSpan={15} className="py-4 text-slate-500">
                  No subject scores recorded yet
                </td>
              </tr>
            )}
            {r.subjects.map((l) => (
              <tr key={l.subjectId}>
                <td className="text-left font-medium">{l.subject}</td>
                <td>{dash(l.test1)}</td>
                <td>{dash(l.test2)}</td>
                <td>
                  {dash(l.exam)}
                  {l.examSource === 'cbt' && (
                    <span className="no-print ml-1 text-[9px] text-gold-dark">CBT</span>
                  )}
                </td>
                <td className="font-bold">{l.total}</td>
                {cum && <td>{dash(l.cumulative?.first)}</td>}
                {cum && <td>{dash(l.cumulative?.second)}</td>}
                {cum && <td className="font-bold">{dash(l.cumulative?.average)}</td>}
                <td className="font-bold">{cum ? l.cumulative?.grade : l.grade}</td>
                <td>{ordinal(l.position)}</td>
                <td>{l.classAvg}</td>
                {!cum && <td>{l.weighted}</td>}
                <td>{l.highest}</td>
                <td>{l.lowest}</td>
                <td>{l.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        {(
          [
            ['Affective traits', r.traits.affective],
            ['Psychomotor skills', r.traits.psychomotor],
          ] as const
        ).map(([title, list]) => (
          <table key={title}>
            <thead>
              <tr>
                <th className="text-left">{title}</th>
                <th className="w-16">Rating</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.trait}>
                  <td>{t.trait}</td>
                  <td className="text-center font-bold">{dash(t.rating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <p className="mb-3 text-[10px] text-slate-500">
        Grades: A 70–100 Excellent · B 60–69 Very good · C 50–59 Good · D
        40–49 Pass · E 30–39 Poor · F 0–29 Fail. Ratings: 5 Excellent · 4
        High · 3 Acceptable · 2 Minimal · 1 No regard.
      </p>

      <table>
        <tbody>
          <tr>
            <td className="rc-k w-1/4">Academic adviser</td>
            <td>{dash(r.remarks.adviser)}</td>
          </tr>
          <tr>
            <td className="rc-k">Form master's report</td>
            <td>{dash(r.remarks.formMaster)}</td>
          </tr>
          <tr>
            <td className="rc-k">Principal's report</td>
            <td>{dash(r.remarks.principal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
