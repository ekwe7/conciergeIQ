import { randomBytes } from 'node:crypto';

/**
 * A QR token is 32 random URL-safe characters. It never contains the room
 * number, so a code cannot be guessed or forged from the room it belongs to.
 */
export function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}
