export interface QRTokenPayload {
  hotelId: string;
  roomId: string;
  roomNumber: string;
  issuedAt: number; // Unix timestamp in seconds
  expiresAt: number; // Unix timestamp in seconds
  nonce: string;
}

export interface EncryptedQRToken {
  token: string;
}
