import { Router } from 'express';
import { getSettings } from '../models/index.js';
import { readReportToken } from '../services/publish.js';
import { buildReport } from '../services/results.js';
import { reportPdf, pdfName } from '../services/reportPdf.js';
import { notFound } from '../middleware/http.js';

const r = Router();

r.get('/school', async (_req, res) => {
  const s = await getSettings();
  res.json(s.school);
});

/* Signed report link sent to parents. Only works once
   the term has been published. */
r.get('/report/:token', async (req, res) => {
  const p = readReportToken(req.params.token);
  const report = await buildReport(p.s, p.t);
  if (!report.published) throw notFound('Report');
  const pdf = await reportPdf(report);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${pdfName(report)}"`,
  );
  res.send(pdf);
});

export default r;
