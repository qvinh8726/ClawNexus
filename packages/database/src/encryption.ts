/**
 * ClawNexus - API Key Encryption
 * Secure encryption/decryption for API keys using AES-256-GCM
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Derives an encryption key from the master key using scrypt
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH);
}

/**
 * Encrypts an API key using AES-256-GCM
 */
export function encryptApiKey(apiKey: string, masterKey?: string): string {
  const encryptionKey = masterKey || process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not set');
  }

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(encryptionKey, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:encryptedData (all hex encoded)
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted,
  ].join(':');
}

/**
 * Decrypts an encrypted API key
 */
export function decryptApiKey(encryptedData: string, masterKey?: string): string {
  const encryptionKey = masterKey || process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not set');
  }

  const parts = encryptedData.split(':');

  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltHex, ivHex, authTagHex, encrypted] = parts;

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(encryptionKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Extracts the prefix from an API key for identification
 */
export function extractKeyPrefix(apiKey: string, length = 8): string {
  if (apiKey.length <= length) {
    return apiKey.slice(0, Math.floor(apiKey.length / 2)) + '...';
  }
  return apiKey.slice(0, length) + '...';
}

/**
 * Generates a secure API key for user authentication
 */
export function generateApiKey(prefix = 'claw'): string {
  const randomPart = randomBytes(24).toString('base64url');
  return `${prefix}_${randomPart}`;
}

/**
 * Hashes an API key for secure storage and lookup
 */
export function hashApiKey(apiKey: string): string {
  const hash = scryptSync(apiKey, 'clawnexus-salt', 32);
  return hash.toString('hex');
}
