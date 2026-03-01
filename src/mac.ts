import CryptoJS from 'crypto-js';
import type { HashAlgorithm } from './types';

/**
 * Generate MAC hash using the specified algorithm.
 *
 * Per SIA VPOS spec:
 * - SHA-1 and MD5: Hash(text + secretKey) — secret appended to string
 * - HMAC-SHA256: HMAC(text, secretKey) — secret used as HMAC key, NOT appended
 *
 * The result is hex-encoded (lowercase).
 * MD5 = 32 chars, SHA-1 = 40 chars, HMAC-SHA256 = 64 chars
 */
export function computeHash(text: string, secretKey: string, algorithm: HashAlgorithm = 'hmac-sha256'): string {
  switch (algorithm) {
    case 'md5':
      return CryptoJS.MD5(text + secretKey).toString(CryptoJS.enc.Hex);
    case 'sha1':
      return CryptoJS.SHA1(text + secretKey).toString(CryptoJS.enc.Hex);
    case 'hmac-sha256':
      return CryptoJS.HmacSHA256(text, secretKey).toString(CryptoJS.enc.Hex);
    default:
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
}

/**
 * Build MAC string from an ordered array of [KEY, VALUE] pairs.
 * Optional fields that are undefined/null/empty are SKIPPED entirely (per spec).
 * Format: KEY1=value1&KEY2=value2&...
 *
 * For SHA-1/MD5, the secret key is appended: ...&secretKey
 * For HMAC-SHA256, the secret key is used as HMAC key (not in the string)
 */
export function generateMAC(
  fields: [string, string | number | undefined | null][],
  secretKey: string,
  algorithm: HashAlgorithm = 'hmac-sha256'
): string {
  const parts: string[] = [];

  for (const [key, value] of fields) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${key}=${value}`);
  }

  const macString = parts.join('&');

  if (algorithm === 'hmac-sha256') {
    // HMAC-256: secret key is NOT appended; it's used as the HMAC key
    return computeHash(macString, secretKey, algorithm);
  } else {
    // SHA-1 / MD5: secret key IS appended to the string
    // The computeHash function already handles this (text + secretKey)
    return computeHash(macString, secretKey, algorithm);
  }
}

/**
 * Verify a MAC received in a response.
 */
export function verifyMAC(
  fields: [string, string | number | undefined | null][],
  secretKey: string,
  receivedMac: string,
  algorithm: HashAlgorithm = 'hmac-sha256'
): boolean {
  if (!receivedMac || receivedMac === 'NULL') return false;
  const computed = generateMAC(fields, secretKey, algorithm);
  return computed.toLowerCase() === receivedMac.toLowerCase();
}
