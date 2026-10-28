// Public API of the rooms module. Other modules import from this file only.
export { createRoomsModule, type RoomsModule } from './rooms.module.js';
export type { RoomSummary } from './application/rooms.service.js';
export {
  QRTokenService,
  QRTokenErrorCode,
  type QRTokenErrorCode as QRTokenErrorCodeType,
  type QRTokenVerificationResult,
  type DomainQRTokenPayload,
  type GenerateQRTokenInput,
  type QRTokenServiceOptions,
} from './domain/qr-token.service.js';

