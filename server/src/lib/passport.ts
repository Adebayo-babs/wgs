import type { Response } from 'express';
import { Types } from 'mongoose';
import { Passport, Student } from '../models/index.js';
import { bad, notFound } from '../middleware/http.js';
import { toBuffer } from '../services/reportPdf.js';

const MAX_BYTES = 200 * 1024;

/** Save a data:image/... URL as the student's passport. */
export async function savePassport(student: Types.ObjectId, dataUrl: string) {
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw bad('Send a JPG or PNG image');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_BYTES) throw bad('Photo is too large (max 200KB)');
  await Passport.updateOne(
    { student },
    { student, data, contentType: m[1] },
    { upsert: true },
  );
  await Student.updateOne({ _id: student }, { hasPassport: true });
}

export async function sendPassport(student: Types.ObjectId, res: Response) {
  const p = await Passport.findOne({ student }).lean();
  if (!p) throw notFound('Passport');
  res.setHeader('Content-Type', p.contentType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(toBuffer(p.data));
}
