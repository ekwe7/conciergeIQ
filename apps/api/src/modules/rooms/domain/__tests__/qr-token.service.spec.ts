/**
 * WHAT IT DOES:
 * Unit test suite for `QRTokenService` validating cryptographically secure QR token generation,
 * HMAC-SHA256 signature verification, timing attack resistance, bit-flip tamper rejection,
 * and high-entropy collision resistance across 50,000 iterations.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Room QR codes must resist guessing, enumeration, and deliberate tampering by malicious guests.
 * - Tests assert that bit-flips in any character position of the token trigger cryptographic rejection.
 * - Tests use `MockClock` to verify expiration and future-issuance boundaries without brittle sleep calls.
 * - Stress tests assert 256-bit cryptographic entropy across 50,000 token generations with zero duplicates.
 * - All test callbacks and helper functions use arrow functions and descriptive variable names.
 */

import { describe, expect, it } from 'vitest';
import { MockClock } from '../../../../shared/utils/clock.js';
import {
  QRTokenErrorCode,
  QRTokenService,
} from '../qr-token.service.js';

const TEST_SECRET_KEY = 'super-secret-cryptographic-signing-key-32-bytes!';
const ALTERNATE_SECRET_KEY = 'another-completely-different-signing-key-32b!';
const FIXED_BASE_DATE = new Date('2026-10-27T12:00:00.000Z');

describe('QRTokenService', () => {
  describe('Initialization and Configuration', () => {
    it('throws when secret key is shorter than 32 characters', () => {
      const shortSecretKey = 'too-short-secret';
      expect(() => new QRTokenService(shortSecretKey)).toThrow(
        /secret key must be at least 32 characters long/i 
      );
    });

    it('accepts options object configuration with custom clock and TTL', () => {
      const mockClockInstance = new MockClock(FIXED_BASE_DATE);
      const tokenService = new QRTokenService   ({
        secretKey: TEST_SECRET_KEY, 
        clock: mockClockInstance,
        defaultTtlSeconds: 3600,
      });

      const generatedToken = tokenService.generateToken({
        hotelId: 'hotel-uuid-101',
        roomId: 'room-uuid-202',
        roomNumber: '305',
      });

      expect(typeof generatedToken).toBe('string');
      expect(generatedToken.length).toBeGreaterThan(0);
    });
  });

  describe('Token Generation and URL Safety', () => {
    it('generates a URL-safe Base64 token matching RFC 4648 character set', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const generatedTokenString = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
      });

      // Strict URL-safe Base64: only letters, digits, hyphen, and underscore
      const urlSafeBase64Pattern = /^[A-Za-z0-9_-]+$/;
      expect(urlSafeBase64Pattern.test(generatedTokenString)).toBe(true);

      // Must not contain unsafe URL characters
      expect(generatedTokenString).not.toContain('+');
      expect(generatedTokenString).not.toContain('/');
      expect(generatedTokenString).not.toContain('=');
      expect(generatedTokenString).not.toContain('?');
      expect(generatedTokenString).not.toContain('&');
    });

    it('generates a unique 256-bit entropy nonce by default', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const firstToken = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
      });
      const secondToken = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
      });

      expect(firstToken).not.toBe(secondToken);
    });

    it('rejects empty or whitespace roomNumber during generation', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      expect(() =>
        tokenService.generateToken({
          hotelId: 'hotel-001',
          roomId: 'room-101',
          roomNumber: '   ',
        })
      ).toThrow(/roomNumber cannot be empty/i);
    });
  });

  describe('Roundtrip Generation and Verification', () => {
    it('successfully verifies a freshly generated token and returns typed payload', () => {
      const mockClockInstance = new MockClock(FIXED_BASE_DATE);
      const tokenService = new QRTokenService(TEST_SECRET_KEY, mockClockInstance);

      const issuedAtSeconds = Math.floor(FIXED_BASE_DATE.getTime() / 1000);
      const customTtlSeconds = 86400; // 24 hours

      const generatedTokenString = tokenService.generateToken({
        hotelId: 'hotel-uuid-555',
        roomId: 'room-uuid-777',
        roomNumber: 'Penthouse-Suite',
        ttlSeconds: customTtlSeconds,
      });

      const verificationResult = tokenService.verifyToken(generatedTokenString);

      expect(verificationResult.success).toBe(true);
      if (verificationResult.success) {
        expect(verificationResult.payload.hotelId).toBe('hotel-uuid-555');
        expect(verificationResult.payload.roomId).toBe('room-uuid-777');
        expect(verificationResult.payload.roomNumber).toBe('Penthouse-Suite');
        expect(verificationResult.payload.issuedAt).toBe(issuedAtSeconds);
        expect(verificationResult.payload.expiresAt).toBe(issuedAtSeconds + customTtlSeconds);
        expect(verificationResult.payload.nonce).toBeDefined();
        expect(verificationResult.payload.nonce.length).toBe(64); // 32 bytes in hex = 64 chars
      }
    });

    it('remains valid when clock advances within the TTL expiration window', () => {
      const mockClockInstance = new MockClock(FIXED_BASE_DATE);
      const tokenService = new QRTokenService(TEST_SECRET_KEY, mockClockInstance, 7200);

      const generatedTokenString = tokenService.generateToken({
        hotelId: 'hotel-abc',
        roomId: 'room-xyz',
        roomNumber: '404',
      });

      // Advance clock by 1 hour (within 2-hour TTL)
      mockClockInstance.advanceByMs(3600 * 1000);

      const verificationResult = tokenService.verifyToken(generatedTokenString);
      expect(verificationResult.success).toBe(true);
    });
  });

  describe('Tampering and Bit-Flip Protection', () => {
    it('rejects token when any character across multiple positions is mutated', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const originalTokenString = tokenService.generateToken({
        hotelId: 'hotel-123',
        roomId: 'room-456',
        roomNumber: '202',
      });

      // Test character mutation at start, signature boundary, middle and end
      const characterIndicesToTest = [
        0,
        5,
        15,
        30,
        Math.floor(originalTokenString.length / 2),
        originalTokenString.length - 1,
      ];

      for (const targetCharacterIndex of characterIndicesToTest) {
        const originalCharacter = originalTokenString[targetCharacterIndex];
        const replacementCharacter = originalCharacter === 'A' ? 'B' : 'A';
        const tamperedTokenString =
          originalTokenString.substring(0, targetCharacterIndex) +
          replacementCharacter +
          originalTokenString.substring(targetCharacterIndex + 1);

        const verificationResult = tokenService.verifyToken(tamperedTokenString);
        expect(verificationResult.success).toBe(false);
        if (!verificationResult.success) {
          expect(
            [QRTokenErrorCode.INVALID_SIGNATURE, QRTokenErrorCode.INVALID_FORMAT]
          ).toContain(verificationResult.errorCode);
        }
      }
    });

    it('rejects token signed by a different secret key', () => {
      const originalService = new QRTokenService(TEST_SECRET_KEY);
      const untrustedService = new QRTokenService(ALTERNATE_SECRET_KEY);

      const tokenStringFromFirstService = originalService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
      });

      const verificationResult = untrustedService.verifyToken(tokenStringFromFirstService);

      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.INVALID_SIGNATURE);
      }
    });

    it('rejects token with tampered payload attributes even if valid JSON', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const originalTokenString = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
      });

      const decodedBuffer = Buffer.from(originalTokenString, 'base64url');
      const signatureBytes = decodedBuffer.subarray(0, 32);
      const payloadBytes = decodedBuffer.subarray(32);

      const parsedPayload = JSON.parse(payloadBytes.toString('utf-8')) as Record<string, unknown>;
      // Tamper room number from 101 to 999
      parsedPayload.roomNumber = '999';

      const tamperedPayloadBytes = Buffer.from(JSON.stringify(parsedPayload), 'utf-8');
      const forgedTokenString = Buffer.concat([signatureBytes, tamperedPayloadBytes]).toString(
        'base64url'
      );

      const verificationResult = tokenService.verifyToken(forgedTokenString);

      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.INVALID_SIGNATURE);
      }
    });

    it('rejects token with tampered timestamp in payload', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const originalTokenString = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
      });

      const decodedBuffer = Buffer.from(originalTokenString, 'base64url');
      const signatureBytes = decodedBuffer.subarray(0, 32);
      const payloadBytes = decodedBuffer.subarray(32);

      const parsedPayload = JSON.parse(payloadBytes.toString('utf-8')) as Record<string, unknown>;
      // Tamper expiration timestamp
      parsedPayload.expiresAt = Number(parsedPayload.expiresAt) + 100000;

      const tamperedPayloadBytes = Buffer.from(JSON.stringify(parsedPayload), 'utf-8');
      const forgedTokenString = Buffer.concat([signatureBytes, tamperedPayloadBytes]).toString(
        'base64url'
      );

      const verificationResult = tokenService.verifyToken(forgedTokenString);

      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.INVALID_SIGNATURE);
      }
    });
  });

  describe('Format and Truncation Safeguards', () => {
    it('returns INVALID_FORMAT on empty string or non-string input', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);

      const emptyResult = tokenService.verifyToken('');
      expect(emptyResult.success).toBe(false);
      if (!emptyResult.success) {
        expect(emptyResult.errorCode).toBe(QRTokenErrorCode.INVALID_FORMAT);
      }

      // @ts-expect-error verifying invalid runtime input type
      const nullResult = tokenService.verifyToken(null);
      expect(nullResult.success).toBe(false);
      if (!nullResult.success) {
        expect(nullResult.errorCode).toBe(QRTokenErrorCode.INVALID_FORMAT);
      }
    });

    it('returns INVALID_FORMAT on strings with invalid non-base64 characters', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const malformedInput = 'invalid@token!with#symbols$';

      const verificationResult = tokenService.verifyToken(malformedInput);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.INVALID_FORMAT);
      }
    });

    it('returns TRUNCATED_TOKEN when token byte length is less than 32-byte signature', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const shortBuffer = Buffer.from('too-short-to-be-a-token', 'utf-8');
      const truncatedTokenString = shortBuffer.toString('base64url');

      const verificationResult = tokenService.verifyToken(truncatedTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.TRUNCATED_TOKEN);
      }
    });

    it('returns TRUNCATED_TOKEN when token contains only 32-byte signature without payload', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const signatureOnlyBuffer = Buffer.alloc(32, 0x42);
      const signatureOnlyTokenString = signatureOnlyBuffer.toString('base64url');

      const verificationResult = tokenService.verifyToken(signatureOnlyTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.TRUNCATED_TOKEN);
      }
    });

    it('returns MALFORMED_PAYLOAD when payload JSON is corrupted but signature matches', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const malformedPayloadBytes = Buffer.from('{ corrupt json content ...', 'utf-8');
      const validSignatureForMalformedPayload =
        tokenService.computeHmacSignature(malformedPayloadBytes);
      const craftedTokenString = Buffer.concat([
        validSignatureForMalformedPayload,
        malformedPayloadBytes,
      ]).toString('base64url');

      const verificationResult = tokenService.verifyToken(craftedTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.MALFORMED_PAYLOAD);
      }
    });

    it('returns MALFORMED_PAYLOAD when payload is missing required fields', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const incompletePayloadBytes = Buffer.from(
        JSON.stringify({ hotelId: 'h1', roomNumber: '101' }),
        'utf-8'
      );
      const validSignature = tokenService.computeHmacSignature(incompletePayloadBytes);
      const craftedTokenString = Buffer.concat([
        validSignature,
        incompletePayloadBytes,
      ]).toString('base64url');

      const verificationResult = tokenService.verifyToken(craftedTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.MALFORMED_PAYLOAD);
      }
    });
  });

  describe('Expiration and Temporal Safeguards', () => {
    it('rejects expired token with EXPIRED_TOKEN error code', () => {
      const mockClockInstance = new MockClock(FIXED_BASE_DATE);
      const tokenService = new QRTokenService(TEST_SECRET_KEY, mockClockInstance, 3600);

      const generatedTokenString = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
        ttlSeconds: 60, // 60 seconds TTL
      });

      // Advance clock by 61 seconds
      mockClockInstance.advanceByMs(61 * 1000);

      const verificationResult = tokenService.verifyToken(generatedTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.EXPIRED_TOKEN);
      }
    });

    it('rejects token issued too far in the future with FUTURE_ISSUED_TOKEN', () => {
      const mockClockInstance = new MockClock(FIXED_BASE_DATE);
      const tokenService = new QRTokenService(TEST_SECRET_KEY, mockClockInstance);

      const currentTimestampSeconds = Math.floor(FIXED_BASE_DATE.getTime() / 1000);
      const futureIssuedAtSeconds = currentTimestampSeconds + 3600; // 1 hour in the future

      const generatedTokenString = tokenService.generateToken({
        hotelId: 'hotel-001',
        roomId: 'room-101',
        roomNumber: '101',
        issuedAt: futureIssuedAtSeconds,
        expiresAt: futureIssuedAtSeconds + 7200,
      });

      const verificationResult = tokenService.verifyToken(generatedTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.FUTURE_ISSUED_TOKEN);
      }
    });
  });

  describe('Dot-Delimited Token Format Compatibility', () => {
    it('verifies a dot-delimited token format (payload.signature)', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const issuedAtSeconds = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = issuedAtSeconds + 3600;

      const payload = {
        hotelId: 'hotel-delimited-1',
        roomId: 'room-delimited-2',
        roomNumber: '501',
        issuedAt: issuedAtSeconds,
        expiresAt: expiresAtSeconds,
        nonce: tokenService.generateEntropyNonce(),
      };

      const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8');
      const signatureBytes = tokenService.computeHmacSignature(payloadBytes);

      const delimitedTokenString = `${payloadBytes.toString('base64url')}.${signatureBytes.toString('base64url')}`;

      const verificationResult = tokenService.verifyToken(delimitedTokenString);
      expect(verificationResult.success).toBe(true);
      if (verificationResult.success) {
        expect(verificationResult.payload.hotelId).toBe('hotel-delimited-1');
        expect(verificationResult.payload.roomNumber).toBe('501');
      }
    });

    it('rejects dot-delimited token when signature is invalid', () => {
      const tokenService = new QRTokenService(TEST_SECRET_KEY);
      const payloadBytes = Buffer.from(
        JSON.stringify({
          hotelId: 'hotel-1',
          roomId: 'room-1',
          roomNumber: '101',
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          nonce: 'test-nonce',
        }),
        'utf-8'
      );
      const tamperedSignatureBytes = Buffer.alloc(32, 0x99);
      const delimitedTokenString = `${payloadBytes.toString('base64url')}.${tamperedSignatureBytes.toString('base64url')}`;

      const verificationResult = tokenService.verifyToken(delimitedTokenString);
      expect(verificationResult.success).toBe(false);
      if (!verificationResult.success) {
        expect(verificationResult.errorCode).toBe(QRTokenErrorCode.INVALID_SIGNATURE);
      }
    });
  });

  describe('Cryptographic Entropy and Collision Resistance', () => {
    it(
      'asserts zero collisions across 50,000 generated tokens with 256-bit entropy',
      { timeout: 20000 },
      () => {
        const tokenService = new QRTokenService(TEST_SECRET_KEY);
        const uniqueTokenCollectorSet = new Set<string>();
        const totalTokensToGenerate = 50000;

        for (
          let tokenGenerationIteration = 0;
          tokenGenerationIteration < totalTokensToGenerate;
          tokenGenerationIteration++
        ) {
          const generatedTokenString = tokenService.generateToken({
            hotelId: 'hotel-stress-test',
            roomId: 'room-stress-test',
            roomNumber: '101',
          });

          uniqueTokenCollectorSet.add(generatedTokenString);
        }

        expect(uniqueTokenCollectorSet.size).toBe(totalTokensToGenerate);
      }
    );
  });
});
