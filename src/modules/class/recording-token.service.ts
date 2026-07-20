import { Injectable } from '@nestjs/common';

interface TokenData {
  classId: string;
  lectureId: string;
  expiresAt: number;
}

@Injectable()
export class RecordingTokenService {
  private tokens = new Map<string, TokenData>();

  constructor() {
    // Periodic background cleanup of expired tokens every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [token, data] of this.tokens.entries()) {
        if (now > data.expiresAt) {
          this.tokens.delete(token);
        }
      }
    }, 5 * 60 * 1000).unref?.();
  }

  createToken(classId: string, lectureId: string): string {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    // Session token valid for 2 hours — survives browser refreshes
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    this.tokens.set(token, { classId, lectureId, expiresAt });
    return token;
  }

  /**
   * Verify token WITHOUT burning it.
   * Tokens survive browser refreshes and are only cleaned up by TTL expiry.
   */
  verifyAndBurn(token: string): { lectureId: string; expiresAt: number } | null {
    const data = this.tokens.get(token);
    if (!data) return null;

    if (Date.now() > data.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    // Do NOT delete the token — allow page refreshes
    return { lectureId: data.lectureId, expiresAt: data.expiresAt };
  }
}
