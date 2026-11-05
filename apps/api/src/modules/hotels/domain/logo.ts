import { MAX_LOGO_BYTES, type UploadLogoInput } from '@conciergeiq/contracts';

export type LogoCheck = { ok: true; bytes: Buffer } | { ok: false; reason: string };

const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/webp': (bytes) => bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  'image/svg+xml': (bytes) => /<svg[\s>]/i.test(bytes.subarray(0, 2048).toString('utf8')),
};

/** Anything in an SVG that could run code or load something from elsewhere. */
const UNSAFE_SVG = /<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|data:text\/html|<!ENTITY|xlink:href\s*=\s*["']\s*(?!#)|href\s*=\s*["']\s*(?!#|data:image\/)/i;

/**
 * Checks an uploaded logo: real base64, within the size limit, the bytes
 * match the declared type, and SVGs contain nothing executable.
 */
export function checkLogo(upload: UploadLogoInput): LogoCheck {
  const data = upload.data.replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, reason: 'The logo file could not be read' };

  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0) return { ok: false, reason: 'The logo file is empty' };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, reason: 'The logo must be 256 KB or smaller' };
  if (!SIGNATURES[upload.contentType]?.(bytes)) {
    return { ok: false, reason: 'The file is not a PNG, JPEG, WebP or SVG image' };
  }
  if (upload.contentType === 'image/svg+xml' && UNSAFE_SVG.test(bytes.toString('utf8'))) {
    return { ok: false, reason: 'This SVG contains scripts or links. Export it as a plain SVG or a PNG.' };
  }
  return { ok: true, bytes };
}
