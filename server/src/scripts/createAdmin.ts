/* Creates (or resets) the single admin account from the
   ADMIN_* values in .env.  Run: npm run create-admin */
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { Staff } from '../models/index.js';
import { hashPassword } from '../lib/password.js';

const name = process.env.ADMIN_NAME?.trim() || 'School Admin';
const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (password.length < 8) {
  console.error('Set ADMIN_PASSWORD (8+ characters) in .env first.');
  process.exit(1);
}

await connectDb();
const hash = await hashPassword(password);
const existing = await Staff.findOne({ username });
if (existing) {
  existing.set({ name, role: 'admin', active: true, passwordHash: hash });
  await existing.save();
  console.log(`Admin "${username}" updated.`);
} else {
  await Staff.create({ name, username, role: 'admin', passwordHash: hash });
  console.log(`Admin "${username}" created.`);
}
await mongoose.disconnect();
