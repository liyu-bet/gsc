import crypto from 'node:crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function keyBuffer(): Buffer {
  const key = env.encryptionKey.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters');
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(value: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, encryptedHex] = payload.split('.');
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid encrypted payload format');
  }
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function randomToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
