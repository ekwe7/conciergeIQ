/**
 * WHAT IT DOES:
 * Implements cryptographically secure, high-entropy QR token generation, signing,
 * and verification for hotel guest room QR codes.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Hotel room QR codes are printed on physical stands in rooms. They must never expose
 *   raw database sequence IDs, predictable room numbers, or unauthenticated parameters
 *   that would allow an attacker in room 101 to alter the URL and access room 102.
 * - Minimum 256-bit cryptographic entropy (via CSPRNG `crypto.randomBytes(32)`) ensures
 *   uniqueness and unguessability across millions of room QR codes.
 * - Tokens are digitally signed using HMAC-SHA256 with a minimum 256-bit server-side secret key.
 * - Signatures are verified using `crypto.timingSafeEqual` after strict byte-length checking
 *   to mitigate timing side-channel attacks.
 * - Verification returns strongly-typed discriminated result objects (`QRTokenVerificationResult`)
 *   with explicit cryptographic error codes (`INVALID_SIGNATURE`, `EXPIRED_TOKEN`, `TRUNCATED_TOKEN`,
 *   `MALFORMED_PAYLOAD`, `INVALID_FORMAT`), never throwing unhandled exceptions on invalid input.
 * - Pluggable `Clock` injection allows deterministic verification and expiration testing.
 * - The serialized token is a URL-safe Base64 string compliant with RFC 4648 §5 (`[A-Za-z0-9_-]`).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { QRTokenPayload } from '@conciergeiq/contracts';
import {
  createHotelId,
  createRoomId,
  type HotelId,
  type RoomId,
} from '../../../shared/domain/ids.js';
import { type Clock, systemClock } from '../../../shared/utils/clock.js';

/**
 * Standard error codes returned by cryptographic token verification.
 */
export const QRTokenErrorCode = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  TRUNCATED_TOKEN: 'TRUNCATED_TOKEN',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  MALFORMED_PAYLOAD: 'MALFORMED_PAYLOAD',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  FUTURE_ISSUED_TOKEN: 'FUTURE_ISSUED_TOKEN',
} as const;

export type QRTokenErrorCode = (typeof QRTokenErrorCode)[keyof typeof QRTokenErrorCode];

/**
 * Domain-specific QR token payload strongly branded with HotelId and RoomId nominal types.
 */
export interface DomainQRTokenPayload extends QRTokenPayload {
  readonly hotelId: HotelId;
  readonly roomId: RoomId;
  readonly roomNumber: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
}

/**
 * Discriminated union result of a token verification operation.
 */
export type QRTokenVerificationResult =
  | {
      readonly success: true;
      readonly payload: DomainQRTokenPayload;
    }
  | {
      readonly success: false;
      readonly errorCode: QRTokenErrorCode;
      readonly errorMessage: string;
    };

/**
 * Parameters required to generate a signed QR token.
 */
export interface GenerateQRTokenInput {
  readonly hotelId: HotelId | string;
  readonly roomId: RoomId | string;
  readonly roomNumber: string;
  readonly ttlSeconds?: number;
  readonly nonce?: string;
  readonly issuedAt?: number;
  readonly expiresAt?: number;
}

/**
 * Configuration options for the QR token cryptography service.
 */
export interface QRTokenServiceOptions {
  readonly secretKey: string;
  readonly clock?: Clock;
  readonly defaultTtlSeconds?: number;
}

const HMAC_SHA256_DIGEST_BYTE_LENGTH = 32;
const MINIMUM_SECRET_KEY_CHARACTER_LENGTH = 32;
const DEFAULT_QR_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const ALLOWED_CLOCK_SKEW_TOLERANCE_SECONDS = 60;
const URL_SAFE_BASE64_REGULAR_EXPRESSION = /^[A-Za-z0-9_-]+$/;

export class QRTokenService {
  private readonly secretKey: string;
  private readonly clock: Clock;
  private readonly defaultTtlSeconds: number;

  constructor(
    secretKeyOrOptionsConfiguration: string | QRTokenServiceOptions,
    injectedClock: Clock = systemClock,
    fallbackDefaultTtlSeconds: number = DEFAULT_QR_TOKEN_TTL_SECONDS
  ) {
    if (typeof secretKeyOrOptionsConfiguration === 'string') {
      this.secretKey = secretKeyOrOptionsConfiguration;
      this.clock = injectedClock;
      this.defaultTtlSeconds = fallbackDefaultTtlSeconds;
    } else {
      this.secretKey = secretKeyOrOptionsConfiguration.secretKey;
      this.clock = secretKeyOrOptionsConfiguration.clock ?? injectedClock;
      this.defaultTtlSeconds =
        secretKeyOrOptionsConfiguration.defaultTtlSeconds ?? fallbackDefaultTtlSeconds;
    }

    if (
      !this.secretKey ||
      typeof this.secretKey !== 'string' ||
      this.secretKey.trim().length < MINIMUM_SECRET_KEY_CHARACTER_LENGTH
    ) {
      throw new Error(
        `QRTokenService secret key must be at least ${MINIMUM_SECRET_KEY_CHARACTER_LENGTH} characters long to ensure cryptographic entropy.`
      );
    }
  }

  /**
   * Generates a minimum 256-bit cryptographically secure pseudorandom nonce.
   */
  public generateEntropyNonce = (): string => {
    // 32 bytes = 256 bits of CSPRNG entropy
    return randomBytes(32).toString('hex');
  };

  /**
   * Computes an HMAC-SHA256 signature over the provided payload byte buffer.
   */
  public computeHmacSignature = (payloadBytesBuffer: Buffer): Buffer => {
    return createHmac('sha256', this.secretKey).update(payloadBytesBuffer).digest();
  };

  /**
   * Serializes a QR token payload into a deterministic UTF-8 JSON string.
   */
  public serializePayload = (tokenPayload: QRTokenPayload): string => {
    return JSON.stringify({
      hotelId: tokenPayload.hotelId,
      roomId: tokenPayload.roomId,
      roomNumber: tokenPayload.roomNumber,
      issuedAt: tokenPayload.issuedAt,
      expiresAt: tokenPayload.expiresAt,
      nonce: tokenPayload.nonce,
    });
  };

  /**
   * Parses and validates a JSON string into a branded DomainQRTokenPayload.
   */
  public deserializePayload = (serializedPayloadString: string): DomainQRTokenPayload => {
    const parsedPayloadObject: unknown = JSON.parse(serializedPayloadString);

    if (
      !parsedPayloadObject ||
      typeof parsedPayloadObject !== 'object' ||
      Array.isArray(parsedPayloadObject)
    ) {
      throw new Error('Serialized payload JSON must represent an object.');
    }

    const payloadAttributesRecord = parsedPayloadObject as Record<string, unknown>;

    if (
      typeof payloadAttributesRecord.hotelId !== 'string' ||
      payloadAttributesRecord.hotelId.trim().length === 0 ||
      typeof payloadAttributesRecord.roomId !== 'string' ||
      payloadAttributesRecord.roomId.trim().length === 0 ||
      typeof payloadAttributesRecord.roomNumber !== 'string' ||
      payloadAttributesRecord.roomNumber.trim().length === 0 ||
      typeof payloadAttributesRecord.nonce !== 'string' ||
      payloadAttributesRecord.nonce.trim().length === 0 ||
      typeof payloadAttributesRecord.issuedAt !== 'number' ||
      !Number.isFinite(payloadAttributesRecord.issuedAt) ||
      typeof payloadAttributesRecord.expiresAt !== 'number' ||
      !Number.isFinite(payloadAttributesRecord.expiresAt)
    ) {
      throw new Error('Serialized payload is missing required fields or has invalid types.');
    }

    return {
      hotelId: createHotelId(payloadAttributesRecord.hotelId),
      roomId: createRoomId(payloadAttributesRecord.roomId),
      roomNumber: payloadAttributesRecord.roomNumber.trim(),
      issuedAt: payloadAttributesRecord.issuedAt,
      expiresAt: payloadAttributesRecord.expiresAt,
      nonce: payloadAttributesRecord.nonce.trim(),
    };
  };

  /**
   * Generates a signed, URL-safe Base64 QR token containing room identity,
   * 256-bit entropy nonce, and cryptographic expiration timestamps.
   */
  public generateToken = (tokenGenerationInput: GenerateQRTokenInput): string => {
    const currentUnixTimestampSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const resolvedIssuedAtSeconds =
      tokenGenerationInput.issuedAt ?? currentUnixTimestampSeconds;
    const resolvedExpiresAtSeconds =
      tokenGenerationInput.expiresAt ??
      (resolvedIssuedAtSeconds + (tokenGenerationInput.ttlSeconds ?? this.defaultTtlSeconds));
    const cryptographicEntropyNonce =
      tokenGenerationInput.nonce ?? this.generateEntropyNonce();

    const validatedHotelIdentifier = createHotelId(tokenGenerationInput.hotelId);
    const validatedRoomIdentifier = createRoomId(tokenGenerationInput.roomId);

    if (
      !tokenGenerationInput.roomNumber ||
      typeof tokenGenerationInput.roomNumber !== 'string' ||
      tokenGenerationInput.roomNumber.trim().length === 0
    ) {
      throw new Error('QRTokenService roomNumber cannot be empty.');
    }

    const tokenPayloadRecord: QRTokenPayload = {
      hotelId: validatedHotelIdentifier,
      roomId: validatedRoomIdentifier,
      roomNumber: tokenGenerationInput.roomNumber.trim(),
      issuedAt: resolvedIssuedAtSeconds,
      expiresAt: resolvedExpiresAtSeconds,
      nonce: cryptographicEntropyNonce,
    };

    const serializedPayloadString = this.serializePayload(tokenPayloadRecord);
    const payloadBytesBuffer = Buffer.from(serializedPayloadString, 'utf-8');
    const hmacSignatureBytesBuffer = this.computeHmacSignature(payloadBytesBuffer);

    // Concatenate [32-byte HMAC signature] + [UTF-8 serialized payload bytes]
    const combinedTokenBytesBuffer = Buffer.concat([
      hmacSignatureBytesBuffer,
      payloadBytesBuffer,
    ]);

    return combinedTokenBytesBuffer.toString('base64url');
  };

  /**
   * Verifies the authenticity, integrity, and validity of an unguessable QR token.
   * Returns a strongly-typed failure result on any tampering, expiration, or corruption.
   */
  public verifyToken = (rawTokenString: string): QRTokenVerificationResult => {
    if (!rawTokenString || typeof rawTokenString !== 'string') {
      return {
        success: false,
        errorCode: QRTokenErrorCode.INVALID_FORMAT,
        errorMessage: 'Token must be a non-empty string.',
      };
    }

    const trimmedTokenString = rawTokenString.trim();
    let extractedSignatureBytesBuffer: Buffer;
    let extractedPayloadBytesBuffer: Buffer;

    // Support both dot-delimited tokens (payload.signature) and binary-concatenated base64url tokens
    if (trimmedTokenString.includes('.')) {
      const delimitedTokenSegments = trimmedTokenString.split('.');
      if (delimitedTokenSegments.length !== 2) {
        return {
          success: false,
          errorCode: QRTokenErrorCode.INVALID_FORMAT,
          errorMessage: 'Dot-delimited token must contain exactly two base64url segments.',
        };
      }

      const [encodedPayloadSegment, encodedSignatureSegment] = delimitedTokenSegments;
      if (!encodedPayloadSegment || !encodedSignatureSegment) {
        return {
          success: false,
          errorCode: QRTokenErrorCode.INVALID_FORMAT,
          errorMessage: 'Dot-delimited token segments cannot be empty.',
        };
      }

      if (
        !URL_SAFE_BASE64_REGULAR_EXPRESSION.test(encodedPayloadSegment) ||
        !URL_SAFE_BASE64_REGULAR_EXPRESSION.test(encodedSignatureSegment)
      ) {
        return {
          success: false,
          errorCode: QRTokenErrorCode.INVALID_FORMAT,
          errorMessage: 'Dot-delimited token segments contain invalid URL-safe base64 characters.',
        };
      }

      extractedPayloadBytesBuffer = Buffer.from(encodedPayloadSegment, 'base64url');
      extractedSignatureBytesBuffer = Buffer.from(encodedSignatureSegment, 'base64url');
    } else {
      if (!URL_SAFE_BASE64_REGULAR_EXPRESSION.test(trimmedTokenString)) {
        return {
          success: false,
          errorCode: QRTokenErrorCode.INVALID_FORMAT,
          errorMessage: 'Token contains invalid characters for URL-safe Base64.',
        };
      }

      const decodedCombinedTokenBuffer = Buffer.from(trimmedTokenString, 'base64url');

      if (decodedCombinedTokenBuffer.length < HMAC_SHA256_DIGEST_BYTE_LENGTH) {
        return {
          success: false,
          errorCode: QRTokenErrorCode.TRUNCATED_TOKEN,
          errorMessage: `Token is truncated: byte length ${decodedCombinedTokenBuffer.length} is shorter than the required 32-byte signature.`,
        };
      }

      extractedSignatureBytesBuffer = decodedCombinedTokenBuffer.subarray(
        0,
        HMAC_SHA256_DIGEST_BYTE_LENGTH
      );
      extractedPayloadBytesBuffer = decodedCombinedTokenBuffer.subarray(
        HMAC_SHA256_DIGEST_BYTE_LENGTH
      );

      if (extractedPayloadBytesBuffer.length === 0) {
        return {
          success: false,
          errorCode: QRTokenErrorCode.TRUNCATED_TOKEN,
          errorMessage: 'Token is truncated: payload segment is empty.',
        };
      }
    }

    // 1. Verify HMAC signature length
    if (extractedSignatureBytesBuffer.length !== HMAC_SHA256_DIGEST_BYTE_LENGTH) {
      return {
        success: false,
        errorCode: QRTokenErrorCode.INVALID_SIGNATURE,
        errorMessage: `Invalid HMAC signature byte length: received ${extractedSignatureBytesBuffer.length}, expected ${HMAC_SHA256_DIGEST_BYTE_LENGTH}.`,
      };
    }

    // 2. Constant-time signature verification to prevent timing side-channel attacks
    const expectedHmacDigestBuffer = this.computeHmacSignature(extractedPayloadBytesBuffer);
    if (!timingSafeEqual(extractedSignatureBytesBuffer, expectedHmacDigestBuffer)) {
      return {
        success: false,
        errorCode: QRTokenErrorCode.INVALID_SIGNATURE,
        errorMessage: 'Cryptographic signature mismatch: token has been tampered with or corrupted.',
      };
    }

    // 3. Deserialize JSON payload
    let deserializedDomainPayload: DomainQRTokenPayload;
    try {
      const rawPayloadUtf8String = extractedPayloadBytesBuffer.toString('utf-8');
      deserializedDomainPayload = this.deserializePayload(rawPayloadUtf8String);
    } catch (payloadDeserializationError) {
      return {
        success: false,
        errorCode: QRTokenErrorCode.MALFORMED_PAYLOAD,
        errorMessage:
          payloadDeserializationError instanceof Error
            ? payloadDeserializationError.message
            : 'Failed to deserialize token payload JSON.',
      };
    }

    // 4. Validate temporal constraints
    const currentUnixTimestampSeconds = Math.floor(this.clock.now().getTime() / 1000);

    if (deserializedDomainPayload.expiresAt <= currentUnixTimestampSeconds) {
      return {
        success: false,
        errorCode: QRTokenErrorCode.EXPIRED_TOKEN,
        errorMessage: `Token expired at timestamp ${deserializedDomainPayload.expiresAt} (current time is ${currentUnixTimestampSeconds}).`,
      };
    }

    if (
      deserializedDomainPayload.issuedAt >
      currentUnixTimestampSeconds + ALLOWED_CLOCK_SKEW_TOLERANCE_SECONDS
    ) {
      return {
        success: false,
        errorCode: QRTokenErrorCode.FUTURE_ISSUED_TOKEN,
        errorMessage: `Token issued in the future at timestamp ${deserializedDomainPayload.issuedAt} (current time is ${currentUnixTimestampSeconds}).`,
      };
    }

    return {
      success: true,
      payload: deserializedDomainPayload,
    };
  };
}
