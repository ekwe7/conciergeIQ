import { describe, expect, it } from 'vitest';
import { checkLogo } from '../domain/logo.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const base64 = (value: Buffer | string) => Buffer.from(value).toString('base64');

describe('logo upload checks', () => {
  it('accepts a real PNG and a plain SVG', () => {
    expect(checkLogo({ contentType: 'image/png', data: base64(PNG) }).ok).toBe(true);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123"/></svg>';
    expect(checkLogo({ contentType: 'image/svg+xml', data: base64(svg) }).ok).toBe(true);
    expect(checkLogo({ contentType: 'image/png', data: `data:image/png;base64,${base64(PNG)}` }).ok).toBe(true);
  });

  it('rejects files that are not what they claim', () => {
    expect(checkLogo({ contentType: 'image/png', data: base64('<html>hello</html>') })).toEqual({
      ok: false,
      reason: 'The file is not a PNG, JPEG, WebP or SVG image',
    });
    expect(checkLogo({ contentType: 'image/png', data: 'not base64!' }).ok).toBe(false);
  });

  it('rejects SVGs that could run code', () => {
    for (const svg of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><a href="javascript:alert(1)">x</a></svg>',
      '<svg><image href="https://tracker.example/x.png"/></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>',
    ]) {
      expect(checkLogo({ contentType: 'image/svg+xml', data: base64(svg) }).ok, svg).toBe(false);
    }
  });

  it('rejects logos over 256 KB', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(256 * 1024)]);
    expect(checkLogo({ contentType: 'image/png', data: base64(big) })).toEqual({ ok: false, reason: 'The logo must be 256 KB or smaller' });
  });
});
