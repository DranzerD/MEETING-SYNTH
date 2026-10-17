// Password hashing, isolated from auth.ts (which must stay Edge-compatible
// for middleware.ts) because bcryptjs needs the Node runtime.

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real bcrypt hash (cost 12) of a throwaway string, computed once. Logging
// in as an unknown email compares against this so it costs the same ~250ms as
// a wrong password -- otherwise response time reveals which emails exist.
let dummyHash: Promise<string> | null = null;

export async function spendPasswordCheckTime(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash("not-a-real-password", SALT_ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
}
