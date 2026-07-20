import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically records an immutable entry in the database AuditLog table.
   * Logs are designed for compliance and cannot be edited by users.
   */
  async log(params: {
    userId: string;
    action: 'LOGIN' | 'JOIN_CLASS' | 'LEAVE_CLASS' | 'WAITING_APPROVED' | 'WAITING_REJECTED' | 'MUTE' | 'UNMUTE' | 'CAMERA_LOCK' | 'CAMERA_UNLOCK' | 'SCREEN_SHARE_GRANTED' | 'SCREEN_SHARE_REVOKED' | 'RECORDING_STARTED' | 'RECORDING_STOPPED' | 'BAN_USER' | 'KICK_USER' | 'END_CLASS';
    ipAddress: string;
    userAgent: string;
    targetUserId?: string;
    details?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          targetUserId: params.targetUserId,
          details: params.details,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
    } catch (err) {
      console.error('[AuditService] Failed to write audit log:', err);
    }
  }
}
