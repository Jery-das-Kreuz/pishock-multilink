import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function hashAccessPassword(password: string): string {
  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    throw new Error("Password must not be empty.");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizedPassword, salt, KEY_LENGTH).toString("hex");

  return `scrypt$${salt}$${hash}`;
}

export function verifyAccessPassword(
  password: string,
  storedHash: string | null | undefined
): boolean {
  if (!storedHash) {
    return true;
  }

  const parts = storedHash.split("$");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, originalHash] = parts;
  const candidateHash = scryptSync(password.trim(), salt, KEY_LENGTH);

  const originalBuffer = Buffer.from(originalHash, "hex");

  if (candidateHash.length !== originalBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, originalBuffer);
}