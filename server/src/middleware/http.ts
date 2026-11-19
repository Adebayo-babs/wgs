import type { ErrorRequestHandler, Request } from 'express';
import { ZodError, type ZodType } from 'zod';
import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const forbidden = (msg = 'You do not have access to this') =>
  new HttpError(403, msg);
export const notFound = (what = 'Record') =>
  new HttpError(404, `${what} not found`);

/** Parse req.body / req.query with a zod schema. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function oid(v: unknown, what = 'id') {
  const s = String(v ?? '');
  if (!mongoose.isValidObjectId(s)) throw bad(`Invalid ${what}`);
  return new mongoose.Types.ObjectId(s);
}

export const q = (req: Request, k: string) => {
  const v = req.query[k];
  return typeof v === 'string' && v ? v : undefined;
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _n) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.join('.');
    res.status(400).json({
      error: where ? `${where}: ${first.message}` : first?.message,
    });
    return;
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    res.status(409).json({ error: `That ${field} is already in use` });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Upload is too large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
