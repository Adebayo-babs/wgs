import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { Passport } from '../models/index.js';
import { ordinal } from '../lib/grading.js';
import type { ReportData } from './results.js';

const NAVY = '#0b1f3a';
const GOLD = '#c9a84c';
const LINE = '#9aa5b5';

const s = StyleSheet.create({
  page: { padding: 22, fontSize: 7.5, fontFamily: 'Helvetica', color: '#111' },
  head: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 6,
    marginBottom: 6,
  },
  headText: { flex: 1, alignItems: 'center' },
  school: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY },
  motto: { fontSize: 8, fontStyle: 'italic', marginVertical: 2 },
  photo: { width: 62, height: 70, borderWidth: 1, borderColor: LINE },
  photoEmpty: {
    width: 62,
    height: 70,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    backgroundColor: NAVY,
    color: '#fff',
    padding: 3,
    marginBottom: 5,
  },
  table: { borderWidth: 0.6, borderColor: LINE, marginBottom: 5 },
  row: { flexDirection: 'row' },
  cell: {
    borderRightWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: LINE,
    padding: 2.5,
  },
  th: {
    backgroundColor: '#eef1f6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    textAlign: 'center',
  },
  key: { fontFamily: 'Helvetica-Bold', backgroundColor: '#f6f7fa' },
  b: { fontFamily: 'Helvetica-Bold' },
  c: { textAlign: 'center' },
});

const dash = (v: unknown) =>
  v === null || v === undefined || v === '' ? '-' : String(v);

function Cell(p: {
  w: number | string;
  children?: React.ReactNode;
  style?: Style | Style[];
}) {
  const extra = Array.isArray(p.style) ? p.style : p.style ? [p.style] : [];
  return (
    <View style={[s.cell, { width: p.w }, ...extra]}>
      <Text>{p.children}</Text>
    </View>
  );
}

function KV(p: { pairs: [string, unknown][] }) {
  return (
    <View style={s.row}>
      {p.pairs.map(([k, v], i) => (
        <View key={i} style={{ flexDirection: 'row', flex: 1 }}>
          <Cell w="55%" style={s.key}>
            {k}
          </Cell>
          <Cell w="45%">{dash(v)}</Cell>
        </View>
      ))}
    </View>
  );
}

function ReportDoc({ r, photo }: { r: ReportData; photo: Buffer | null }) {
  const cum = r.term.number === 3;
  const cols = cum
    ? ['Test 1 (20)', 'Test 2 (20)', 'Exam (60)', 'Total (100)', '1st Term',
       '2nd Term', 'Cum. Avg', 'Grade', 'Pos.', 'Class Avg', 'Highest',
       'Lowest', 'Remark']
    : ['Test 1 (20)', 'Test 2 (20)', 'Exam (60)', 'Total (100)', 'Grade',
       'Pos.', 'Class Avg', 'Weighted', 'Highest', 'Lowest', 'Remark'];
  const subW = cum ? '19%' : '22%';
  const colW = cum ? '6.2%' : '7%';
  const remW = cum ? '6.6%' : '8%';

  const cells = (l: ReportData['subjects'][number]) =>
    cum
      ? [l.test1, l.test2, l.exam, l.total, l.cumulative?.first,
         l.cumulative?.second, l.cumulative?.average, l.cumulative?.grade,
         ordinal(l.position), l.classAvg, l.highest, l.lowest,
         l.remark]
      : [l.test1, l.test2, l.exam, l.total, l.grade, ordinal(l.position),
         l.classAvg, l.weighted, l.highest, l.lowest, l.remark];

  const traitTable = (title: string, list: ReportData['traits']['affective']) => (
    <View style={[s.table, { flex: 1 }]}>
      <View style={s.row}>
        <Cell w="78%" style={s.th}>{title}</Cell>
        <Cell w="22%" style={s.th}>RATING</Cell>
      </View>
      {list.map((t) => (
        <View key={t.trait} style={s.row}>
          <Cell w="78%">{t.trait}</Cell>
          <Cell w="22%" style={[s.c, s.b]}>{dash(t.rating)}</Cell>
        </View>
      ))}
    </View>
  );

  return (
    <Document title={`${r.student.name} - Report Card`}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View style={{ width: 62 }} />
          <View style={s.headText}>
            <Text style={s.school}>{r.school.name}</Text>
            <Text style={s.motto}>{r.school.motto}</Text>
            <Text>Address: {r.school.address}</Text>
            <Text>Phone: {r.school.phone}</Text>
            {r.school.email ? <Text>Email: {r.school.email}</Text> : null}
          </View>
          {photo ? (
            <Image style={s.photo} src={{ data: photo, format: 'jpg' }} />
          ) : (
            <View style={s.photoEmpty}>
              <Text>No passport</Text>
            </View>
          )}
        </View>

        <Text style={s.title}>
          {cum ? 'CUMULATIVE ' : ''}REPORT SHEET — {r.term.label.toUpperCase()}{' '}
          TERM, {r.term.session}
        </Text>

        <View style={s.table}>
          <KV pairs={[['Name', r.student.name], ['Student ID', r.student.studentId],
            ['Class', r.student.className]]} />
          <KV pairs={[['Gender', r.student.gender], ['Age', r.student.age],
            ['Reg. No', r.student.regNo]]} />
          <KV pairs={[['Term ended', r.term.termEnded],
            ['Next term begins', r.term.nextTermBegins],
            ['Days school opened', r.attendance.opened]]} />
          <KV pairs={[['Days present', r.attendance.present],
            ['Days absent', r.attendance.absent],
            ['No. in class', r.summary.classCount]]} />
          <KV pairs={[['Overall total', r.summary.overallTotal],
            ['Average', r.summary.average],
            ['Position', ordinal(r.summary.position)]]} />
          <KV pairs={[['Class average', r.summary.classAvg],
            ['Highest average', r.summary.highestAvg],
            ['Lowest average', r.summary.lowestAvg]]} />
          {r.cumulative ? (
            <KV pairs={[['Cumulative average', r.cumulative.average],
              ['Cumulative position', ordinal(r.cumulative.position)],
              ['Overall performance', r.cumulative.performance]]} />
          ) : (
            <KV pairs={[['Overall performance', r.summary.performance],
              ['Grade', r.summary.grade], ['', '']]} />
          )}
        </View>

        <View style={s.table}>
          <View style={s.row}>
            <Cell w={subW} style={s.th}>SUBJECT</Cell>
            {cols.map((c) => (
              <Cell key={c} w={c === 'Remark' ? remW : colW} style={s.th}>
                {c}
              </Cell>
            ))}
          </View>
          {r.subjects.length ? (
            r.subjects.map((l) => (
              <View key={l.subjectId} style={s.row}>
                <Cell w={subW}>{l.subject}</Cell>
                {cells(l).map((v, i) => (
                  <Cell key={i} w={i === cells(l).length - 1 ? remW : colW}
                    style={s.c}>
                    {dash(v)}
                  </Cell>
                ))}
              </View>
            ))
          ) : (
            <Cell w="100%">No subject scores recorded</Cell>
          )}
        </View>

        <View style={[s.row, { gap: 5 }]}>
          {traitTable('AFFECTIVE TRAITS', r.traits.affective)}
          <View style={{ flex: 1 }}>
            {traitTable('PSYCHOMOTOR SKILLS', r.traits.psychomotor)}
            <View style={s.table}>
              <View style={s.row}>
                <Cell w="50%" style={s.th}>SCORE</Cell>
                <Cell w="20%" style={s.th}>GRADE</Cell>
                <Cell w="30%" style={s.th}>MEANING</Cell>
              </View>
              {[['70 - 100', 'A', 'Excellent'], ['60 - 69', 'B', 'Very good'],
                ['50 - 59', 'C', 'Good'], ['40 - 49', 'D', 'Pass'],
                ['30 - 39', 'E', 'Poor'], ['0 - 29', 'F', 'Fail']].map((g) => (
                <View key={g[1]} style={s.row}>
                  <Cell w="50%">{g[0]}</Cell>
                  <Cell w="20%" style={[s.c, s.b]}>{g[1]}</Cell>
                  <Cell w="30%">{g[2]}</Cell>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 6.5 }}>
              Rating key: 5 Excellent · 4 High · 3 Acceptable · 2 Minimal ·
              1 No regard
            </Text>
          </View>
        </View>

        <View style={[s.table, { marginTop: 4 }]}>
          {([['Academic adviser', r.remarks.adviser],
             ["Form master's report", r.remarks.formMaster],
             ["Principal's report", r.remarks.principal]] as const).map(
            ([k, v]) => (
              <View key={k} style={s.row}>
                <Cell w="25%" style={s.key}>{k}</Cell>
                <Cell w="75%">{dash(v)}</Cell>
              </View>
            ),
          )}
        </View>
      </Page>
    </Document>
  );
}

export async function reportPdf(r: ReportData) {
  const p = r.student.hasPassport
    ? await Passport.findOne({ student: r.student.id }).lean()
    : null;
  const photo = p?.data ? toBuffer(p.data) : null;
  return renderToBuffer(<ReportDoc r={r} photo={photo} />);
}

/** lean() returns a BSON Binary, not a Buffer. */
export function toBuffer(d: unknown): Buffer {
  if (Buffer.isBuffer(d)) return d;
  const inner = (d as { buffer?: Uint8Array }).buffer;
  return Buffer.from(inner ?? new Uint8Array());
}

export const pdfName = (r: ReportData) =>
  `${r.student.name.replace(/[^\w\- ]/g, '').trim() || 'Report'} - ` +
  `${r.term.label} Term ${r.term.session.replace('/', '-')}.pdf`;
