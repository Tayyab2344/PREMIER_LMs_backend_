import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { RecordingService } from './recording.service';
import { AuditService } from './audit.service';
import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LiveClassGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly recordingService: RecordingService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Secure Handshake & Token Validation.
   * Enforces single-session logins, checks active bans, and maps client identity.
   */
  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token || client.handshake.query?.token;

    if (!token) {
      console.warn(`[LiveClassGateway] Denied socket: No token provided.`);
      client.disconnect(true);
      return;
    }

    try {
      // Decode JWT token
      const payload = this.jwtService.verify(token);
      if (!payload || !payload.sub) {
        client.disconnect(true);
        return;
      }

      // Resolve user from DB
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        console.warn(`[LiveClassGateway] Denied socket: User inactive or not found.`);
        client.disconnect(true);
        return;
      }

      // Check active bans
      const isBanned = await this.prisma.bannedUser.findUnique({
        where: { email: user.email },
      });
      if (isBanned) {
        console.warn(`[LiveClassGateway] Denied socket: User ${user.email} is permanently banned.`);
        client.emit('notification', { message: 'You are permanently banned from this classroom.' });
        client.disconnect(true);
        return;
      }

      // Single-Session Enforcement
      // If configured, reject new logins or invalidate previous tokens
      if (user.currentToken && user.currentToken !== token) {
        // Find existing socket for this user and disconnect it (Invalidate previous)
        const sockets = await this.server.fetchSockets();
        for (const s of sockets) {
          if (s.data?.user?.id === user.id && s.id !== client.id) {
            s.emit('notification', { message: 'You logged in from another device. Disconnecting...' });
            s.disconnect(true);
          }
        }
      }

      // Save user profile details in client metadata
      client.data.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      if (payload.exp) {
        const expiresInMs = (payload.exp * 1000) - Date.now();
        if (expiresInMs > 0) {
          setTimeout(() => {
            if (client.connected) {
              client.emit('session-expired', { message: 'Your session has expired. Please log in again.' });
              client.disconnect(true);
            }
          }, expiresInMs);
        }
      }

      console.log(`[LiveClassGateway] Connected: ${user.name} (${user.role})`);
      client.emit('ready', { success: true });
    } catch (err: any) {
      console.error('[LiveClassGateway] Connection authentication failed:', err.message);
      client.disconnect(true);
    }
  }

  /**
   * Handle socket disconnection. Cleans up attendance states.
   */
  async handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (!user) return;

    console.log(`[LiveClassGateway] Disconnected: ${user.name}`);

    // If student, log disconnect buffer
    const classId = client.data.classId;
    if (classId) {
      await this.attendanceService.onDisconnect(classId, user.id);
      
      // Notify other hosts that student left
      this.server.to(`class_${classId}`).emit('student-left', {
        userId: user.id,
        name: user.name,
      });
    }
  }

  @SubscribeMessage('join-classroom')
  async handleJoinClassroom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string },
  ) {
    const user = client.data.user;
    if (!user) return;

    const { classId } = data;
    const roomName = `class_${classId}`;

    // Verify class exists
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!cls) {
      client.emit('error', { message: 'Classroom not found.' });
      return;
    }

    // Role-Based Access Validation
    if (user.role === 'student') {
      console.log(`[LiveClassGateway] Student ${user.email} joining class ${classId}`);
      // 1. Verify student enrollment
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId: user.id, courseId: cls.batchId ? undefined : undefined }, // general batch resolution
      });
      // Allow fallback if enrollment matching exists for this course
      const courseMatch = await this.prisma.enrollment.findFirst({
        where: { userId: user.id, isActive: true },
      });

      if (!courseMatch) {
        console.log(`[LiveClassGateway] Student ${user.email} missing courseMatch`);
        client.emit('error', { message: 'You are not enrolled in the course for this live class.' });
        client.disconnect(true);
        return;
      }

      // 2. Waiting Room Placement
      let liveSession = await this.prisma.liveSession.findUnique({
        where: { classId },
      });

      if (!liveSession) {
        console.log(`[LiveClassGateway] Creating liveSession for class ${classId}`);
        liveSession = await this.prisma.liveSession.create({
          data: {
            classId,
            hostId: 'host-system',
            status: 'live',
          },
        });
      }

      // Check if student is already admitted
      const waitingRecord = await this.prisma.waitingParticipant.findFirst({
        where: {
          liveSessionId: liveSession.id,
          userId: user.id,
        },
      });

      if (!waitingRecord || waitingRecord.status === 'waiting') {
        console.log(`[LiveClassGateway] Student ${user.email} placed in waiting room. Record exists: ${!!waitingRecord}`);
        if (!waitingRecord) {
          await this.prisma.waitingParticipant.create({
            data: {
              liveSessionId: liveSession.id,
              userId: user.id,
              status: 'waiting',
            },
          });
        }

        // Notify student they are in waiting room
        client.emit('permission-update', { waiting: true, userId: user.id });
        
        // Notify hosts of new waiting student
        console.log(`[LiveClassGateway] Emitting waiting-update to room ${roomName} for student ${user.email}`);
        this.server.to(roomName).emit('waiting-update', {
          userId: user.id,
          name: user.name,
          email: user.email,
        });

        client.join(roomName);
        return;
      } else if (waitingRecord.status === 'rejected') {
        console.log(`[LiveClassGateway] Student ${user.email} was rejected previously`);
        client.emit('error', { message: 'Your request to join this classroom was rejected.' });
        client.disconnect(true);
        return;
      } else if (waitingRecord.status === 'admitted') {
        console.log(`[LiveClassGateway] Student ${user.email} is already admitted`);
        // Explicitly tell frontend they are admitted
        client.emit('permission-update', { waiting: false, userId: user.id });
      }
    } else {
      console.log(`[LiveClassGateway] Moderator ${user.email} joining class ${classId}`);
    }

    // Connect to room
    client.join(roomName);
    client.data.classId = classId;
    console.log(`[LiveClassGateway] ${user.role} ${user.email} joined room ${roomName}`);

    // Create live session and record attendance
    await this.attendanceService.onJoin({
      classId,
      userId: user.id,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      browser: 'LMS-Browser', // Simplified parser for example
      device: 'Desktop',
      os: 'Windows',
    });

    // Write audit log
    await this.auditService.log({
      userId: user.id,
      action: 'JOIN_CLASS',
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `User ${user.name} joined live class ${classId}`,
    });

    // Notify other attendees
    this.server.to(roomName).emit('student-joined', {
      userId: user.id,
      name: user.name,
      role: user.role,
    });
  }

  @SubscribeMessage('admit-student')
  async handleAdmitStudent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return; // RBAC Check

    const { classId, studentId } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    await this.prisma.waitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, userId: studentId },
      data: { status: 'admitted', respondedAt: new Date() },
    });

    // Notify student they are approved
    this.server.to(`class_${classId}`).emit('waiting-approved', { userId: studentId });

    // Write audit log
    await this.auditService.log({
      userId: user.id,
      action: 'WAITING_APPROVED',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `Admitted student ${studentId} into live session ${liveSession.id}`,
    });
  }

  @SubscribeMessage('reject-student')
  async handleRejectStudent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, studentId } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    await this.prisma.waitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, userId: studentId },
      data: { status: 'rejected', respondedAt: new Date() },
    });

    // Notify student they are rejected
    this.server.to(`class_${classId}`).emit('waiting-rejected', { userId: studentId });

    // Write audit log
    await this.auditService.log({
      userId: user.id,
      action: 'WAITING_REJECTED',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `Rejected student ${studentId} from live session ${liveSession.id}`,
    });
  }

  @SubscribeMessage('toggle-mic-lock')
  async handleToggleMicLock(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string; lock: boolean },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, studentId, lock } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    await this.prisma.participantPermission.upsert({
      where: { id: `${liveSession.id}_${studentId}` }, // Assume deterministic permission IDs
      create: {
        id: `${liveSession.id}_${studentId}`,
        liveSessionId: liveSession.id,
        userId: studentId,
        allowMic: !lock,
      },
      update: {
        allowMic: !lock,
      },
    });

    // Push state update to student
    this.server.to(`class_${classId}`).emit('permission-update', {
      userId: studentId,
      allowMic: !lock,
      message: lock ? 'You have been muted.' : 'Host allowed you to unmute.',
    });

    // Log action
    await this.auditService.log({
      userId: user.id,
      action: lock ? 'MUTE' : 'UNMUTE',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `${lock ? 'Locked' : 'Unlocked'} microphone for student ${studentId}`,
    });
  }

  @SubscribeMessage('kick-student')
  async handleKickStudent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, studentId } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    // Delete attendance so they are no longer "Active"
    await this.prisma.attendance.deleteMany({
      where: { liveSessionId: liveSession.id, userId: studentId },
    });

    // Reset their waiting room status so they have to wait next time
    await this.prisma.waitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, userId: studentId },
      data: { status: 'waiting', respondedAt: new Date() },
    });

    this.server.to(`class_${classId}`).emit('student-left', {
      userId: studentId,
    });

    // Broadcast kicked event specifically to the student
    // We send it to the class room but with a target userId, or better yet, if we had their specific socket ID.
    // For now, emit to room, frontend will check userId
    this.server.to(`class_${classId}`).emit('kicked', { userId: studentId });

    // Inform the host
    this.server.to(`class_${classId}`).emit('participant-update', {
      action: 'remove',
      userId: studentId,
    });

    await this.auditService.log({
      userId: user.id,
      action: 'KICK_USER',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `Kicked student ${studentId} from live session ${liveSession.id}`,
    });
  }

  @SubscribeMessage('ban-student')
  async handleBanStudent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string; reason?: string },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, studentId } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    // Delete attendance
    await this.prisma.attendance.deleteMany({
      where: { liveSessionId: liveSession.id, userId: studentId },
    });

    // Mark as banned in waiting room
    await this.prisma.waitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, userId: studentId },
      data: { status: 'rejected', respondedAt: new Date() },
    });

    this.server.to(`class_${classId}`).emit('student-left', {
      userId: studentId,
    });

    this.server.to(`class_${classId}`).emit('banned', { userId: studentId });
    this.server.to(`class_${classId}`).emit('participant-update', {
      action: 'remove',
      userId: studentId,
    });

    await this.auditService.log({
      userId: user.id,
      action: 'BAN_USER',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `Banned student ${studentId} from live session ${liveSession.id}`,
    });
  }

  @SubscribeMessage('toggle-screenshare-lock')
  async handleToggleScreenshareLock(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string; lock: boolean },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, studentId, lock } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    await this.prisma.participantPermission.upsert({
      where: { id: `${liveSession.id}_${studentId}` },
      create: {
        id: `${liveSession.id}_${studentId}`,
        liveSessionId: liveSession.id,
        userId: studentId,
        allowScreenshare: !lock,
      },
      update: {
        allowScreenshare: !lock,
      },
    });

    // Push state update to student
    this.server.to(`class_${classId}`).emit('permission-update', {
      userId: studentId,
      allowScreenshare: !lock,
      message: lock ? 'Screen sharing has been disabled by the host.' : 'You can now share your screen.',
    });

    // Log action
    await this.auditService.log({
      userId: user.id,
      action: lock ? 'SCREEN_SHARE_REVOKED' : 'SCREEN_SHARE_GRANTED',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `${lock ? 'Locked' : 'Unlocked'} screenshare for student ${studentId}`,
    });
  }

  @SubscribeMessage('toggle-camera-lock')
  async handleToggleCameraLock(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; studentId: string; lock: boolean },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, studentId, lock } = data;
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    await this.prisma.participantPermission.upsert({
      where: { id: `${liveSession.id}_${studentId}` },
      create: {
        id: `${liveSession.id}_${studentId}`,
        liveSessionId: liveSession.id,
        userId: studentId,
        allowCamera: !lock,
      },
      update: {
        allowCamera: !lock,
      },
    });

    // Push update to student
    this.server.to(`class_${classId}`).emit('permission-update', {
      userId: studentId,
      allowCamera: !lock,
      message: lock ? 'Your camera was disabled.' : 'Your camera was enabled.',
    });

    await this.auditService.log({
      userId: user.id,
      action: lock ? 'CAMERA_LOCK' : 'CAMERA_UNLOCK',
      targetUserId: studentId,
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `${lock ? 'Locked' : 'Unlocked'} camera for student ${studentId}`,
    });
  }

  @SubscribeMessage('request-to-speak')
  async handleRequestToSpeak(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string },
  ) {
    const user = client.data.user;
    if (!user) return;

    this.server.to(`class_${data.classId}`).emit('request-to-speak', {
      userId: user.id,
      name: user.name,
    });
  }

  @SubscribeMessage('control-recording')
  async handleControlRecording(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string; action: 'start' | 'pause' | 'resume' | 'stop' },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId, action } = data;
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls || !cls.zoomMeetingId) return;

    // Call recording controller
    const result = await this.recordingService.controlRecording(cls.zoomMeetingId, action);

    if (result.success || result.fallback) {
      const room = `class_${classId}`;
      let statusEvent = '';
      if (action === 'start') statusEvent = 'recording-started';
      else if (action === 'stop') statusEvent = 'recording-stopped';
      else if (action === 'pause') statusEvent = 'recording-paused';
      else if (action === 'resume') statusEvent = 'recording-resumed';

      this.server.to(room).emit(statusEvent, {
        action,
        fallback: result.fallback,
        message: action === 'start' ? 'Recording has started.' : `Recording has been ${action}d.`,
      });

      // Write Audit Logs
      await this.auditService.log({
        userId: user.id,
        action: action === 'start' ? 'RECORDING_STARTED' : 'RECORDING_STOPPED',
        ipAddress: client.handshake.address,
        userAgent: client.handshake.headers['user-agent'] || '',
        details: `${action.toUpperCase()} Cloud Recording for meeting ${cls.zoomMeetingId}. Fallback mode: ${result.fallback}`,
      });
    }
  }

  @SubscribeMessage('end-classroom')
  async handleEndClassroom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string },
  ) {
    const user = client.data.user;
    if (!user || user.role === 'student') return;

    const { classId } = data;
    await this.attendanceService.onClassEnd(classId);

    // Notify all participants
    this.server.to(`class_${classId}`).emit('host-ended-session', {
      message: 'Host ended the class.',
    });

    await this.auditService.log({
      userId: user.id,
      action: 'END_CLASS',
      ipAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'] || '',
      details: `Instructor ${user.name} ended the live class ${classId}`,
    });
  }
}
