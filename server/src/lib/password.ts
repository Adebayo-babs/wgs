import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

/* The old Apps Script stored unsalted SHA-256 hex digests.
   Migrated accounts keep that value in `legacyHash` until
   their first successful login, when it is replaced with
   a bcrypt hash and cleared. */
export const sha256 = (plain: string) =>
  createHash('sha256').update(plain, 'utf8').digest('hex');

type Account = {
  passwordHash?: string | null;
  legacyHash?: string | null;
};

/** Returns 'ok', 'ok-upgrade' (legacy match), or 'fail'. */
export async function checkPassword(acc: Account, plain: string) {
  if (acc.passwordHash) {
    const ok = await bcrypt.compare(plain, acc.passwordHash);
    return ok ? 'ok' : 'fail';
  }
  if (acc.legacyHash && sha256(plain) === acc.legacyHash) {
    return 'ok-upgrade';
  }
  return 'fail';
}
