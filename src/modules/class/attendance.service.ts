import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tracks user joining a live class session.
   * Creates/resolves the active LiveSession and records the Join entry.
   */
  async onJoin(params: {
    classId: string;
    userId: string;
    ipAddress: string;
    userAgent: string;
    browser: string;
    device: string;
    os: string;
  }) {
    // 1. Resolve or create LiveSession
    let liveSession = await this.prisma.liveSession.findUnique({
      where: { classId: params.classId },
    });

    if (!liveSession) {
      // Find the class host (the creator/admin or teacher)
      const cls = await this.prisma.class.findUnique({
        where: { id: params.classId },
      });
      
      liveSession = await this.prisma.liveSession.create({
        data: {
          classId: params.classId,
          hostId: cls?.zoomMeetingId || 'host-system',
          status: 'live',
        },
      });
    }

    // 2. Check if there's already an active attendance record for this session/user
    const active = await this.prisma.attendance.findFirst({
      where: {
        liveSessionId: liveSession.id,
        userId: params.userId,
        leaveTime: null,
      },
    });

    if (active) {
      // User is already connected. Just return it.
      return active;
    }

    // 3. Reconnection Buffer: If they left less than 5 minutes ago, just resume the previous record
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentDisconnect = await this.prisma.attendance.findFirst({
      where: {
        liveSessionId: liveSession.id,
        userId: params.userId,
        leaveTime: { gte: fiveMinsAgo },
      },
      orderBy: { leaveTime: 'desc' },
    });

    if (recentDisconnect) {
      // Resume the previous session
      return this.prisma.attendance.update({
        where: { id: recentDisconnect.id },
        data: { leaveTime: null },
      });
    }

    // 4. Create fresh attendance entry
    return this.prisma.attendance.create({
      data: {
        liveSessionId: liveSession.id,
        userId: params.userId,
        ipAddress: params.ipAddress,
        browser: params.browser,
        device: params.device,
        os: params.os,
        joinTime: new Date(),
      },
    });
  }

  /**
   * Handles user disconnect. Sets the leave time.
   */
  async onDisconnect(classId: string, userId: string) {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });
    if (!liveSession) return;

    const activeAttendance = await this.prisma.attendance.findFirst({
      where: {
        liveSessionId: liveSession.id,
        userId,
        leaveTime: null,
      },
    });

    if (activeAttendance) {
      const now = new Date();
      const durationSeconds = Math.max(
        0,
        Math.floor((now.getTime() - activeAttendance.joinTime.getTime()) / 1000)
      );

      await this.prisma.attendance.update({
        where: { id: activeAttendance.id },
        data: {
          leaveTime: now,
          duration: durationSeconds,
        },
      });
    }
  }

  /**
   * Handles user reconnect. Increments reconnectCount and resumes session.
   */
  async onReconnect(classId: string, userId: string) {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });
    if (!liveSession) return;

    // Find the most recent attendance record
    const lastAttendance = await this.prisma.attendance.findFirst({
      where: {
        liveSessionId: liveSession.id,
        userId,
      },
      orderBy: { joinTime: 'desc' },
    });

    if (lastAttendance) {
      // Re-activate this record (nullify leaveTime) and increment reconnectCount
      await this.prisma.attendance.update({
        where: { id: lastAttendance.id },
        data: {
          leaveTime: null,
          reconnectCount: { increment: 1 },
        },
      });
    }
  }

  /**
   * Closes the LiveSession and updates all attendance durations.
   */
  async onClassEnd(classId: string) {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });
    if (!liveSession) return;

    const now = new Date();

    // 1. End live session status
    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: {
        status: 'ended',
        endedAt: now,
      },
    });

    // 2. Find and resolve all unclosed attendances
    const openAttendances = await this.prisma.attendance.findMany({
      where: {
        liveSessionId: liveSession.id,
        leaveTime: null,
      },
    });

    for (const att of openAttendances) {
      const durationSeconds = Math.max(
        0,
        Math.floor((now.getTime() - att.joinTime.getTime()) / 1000)
      );

      await this.prisma.attendance.update({
        where: { id: att.id },
        data: {
          leaveTime: now,
          duration: durationSeconds,
        },
      });
    }
  }
}
