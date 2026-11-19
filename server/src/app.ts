import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, HttpError } from './middleware/http.js';
import auth from './routes/auth.js';
import pub from './routes/public.js';
import student from './routes/student.js';
import meta from './routes/meta.js';
import staff from './routes/staff.js';
import students from './routes/students.js';
import questions from './routes/questions.js';
import attempts from './routes/attempts.js';
import results from './routes/results.js';
import terms from './routes/terms.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render / Vercel sit behind a proxy
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CLIENT_URL.split(',').map((s) => s.trim()),
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', auth);
  app.use('/api/public', pub);
  app.use('/api/student', student);
  app.use('/api', meta); // /api/meta, /api/classes, /api/subjects, ...
  app.use('/api/staff', staff);
  app.use('/api/students', students);
  app.use('/api/questions', questions);
  app.use('/api/attempts', attempts);
  app.use('/api/results', results);
  app.use('/api/admin', terms);

  app.use('/api', (_req, _res, next) => {
    next(new HttpError(404, 'Not found'));
  });
  app.use(errorHandler);
  return app;
}
