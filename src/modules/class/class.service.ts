import { Injectable, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { JitsiService } from './jitsi.service';
import { BbbService } from './bbb.service';
import { ZoomService } from './zoom.service';
import { CreateClassDto, UpdateClassDto, CreateRecordedLectureDto, UpdateRecordedLectureDto } from './dto/class.dto';
import { RecordingTokenService } from './recording-token.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class ClassService {
  private readonly logger = new Logger(ClassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jitsiService: JitsiService,
    private readonly bbbService: BbbService,
    private readonly zoomService: ZoomService,
    private readonly recordingTokenService: RecordingTokenService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateClassDto) {
    const jitsiRoomName = `premier-${dto.batchName.replace(/\s+/g, '-').toLowerCase()}-${uuidv4().slice(0, 8)}`;

    let batchId: string | null = null;
    if (dto.batchName) {
      const batch = await this.prisma.batch.findUnique({
        where: { name: dto.batchName },
      });
      if (batch) {
        batchId = batch.id;
      }
    }

    // Handle Zoom Auto-Scheduling
    let zoomMeetingId = dto.zoomMeetingId || null;
    let zoomPasscode = dto.zoomPasscode || null;

    if (!zoomMeetingId) {
      const start = new Date(dto.scheduledStart);
      const end = new Date(dto.scheduledEnd);
      let durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        durationMinutes = 60; // default to 1 hour
      }

      this.logger.log(`>>> Attempting Zoom auto-schedule: topic="${dto.courseName} - ${dto.title}", start=${start.toISOString()}, duration=${durationMinutes}min`);

      try {
        const zoomMeeting = await this.zoomService.createZoomMeeting({
          topic: `${dto.courseName} - ${dto.title}`,
          startTime: start,
          durationMinutes,
        });

        this.logger.log(`>>> Zoom API returned: ${JSON.stringify(zoomMeeting)}`);

        if (zoomMeeting) {
          zoomMeetingId = zoomMeeting.meetingId;
          zoomPasscode = zoomMeeting.passcode;
          this.logger.log(`Auto-scheduled Zoom meeting: ${zoomMeetingId}`);
        } else {
          this.logger.warn(`>>> Zoom returned null — check ZoomService logs above for details.`);
        }
      } catch (err: any) {
        this.logger.error(`Failed to auto-schedule Zoom meeting: ${err.message}`, err.stack);
      }
    }

    const newClass = await this.prisma.class.create({
      data: {
        batchId,
        batchName: dto.batchName,
        courseName: dto.courseName,
        title: dto.title,
        scheduledStart: new Date(dto.scheduledStart),
        scheduledEnd: new Date(dto.scheduledEnd),
        jitsiRoomName,
        allowStudentScreenshare: dto.allowStudentScreenshare !== undefined ? dto.allowStudentScreenshare : true,
        allowStudentMic: dto.allowStudentMic !== undefined ? dto.allowStudentMic : true,
        allowStudentCamera: dto.allowStudentCamera !== undefined ? dto.allowStudentCamera : true,
        zoomMeetingId,
        zoomPasscode,
      },
    });

    this.notifyStudentsAboutClass(newClass).catch((err) =>
      this.logger.error(`Failed to notify students for class ${newClass.id}:`, err),
    );

    return newClass;
  }

  private async notifyStudentsAboutClass(newClass: any) {
    try {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          batchName: newClass.batchName,
          course: { name: newClass.courseName },
          isActive: true,
        },
        include: {
          user: { select: { name: true, email: true } },
        },
      });

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const jitsiLink = `${appUrl}/dashboard/classes/${newClass.id}`;

      for (const enrollment of enrollments) {
        try {
          if (enrollment.user && enrollment.user.email) {
            await this.mailService.sendClassScheduled(
              enrollment.user.email,
              enrollment.user.name,
              newClass.courseName,
              newClass.title,
              newClass.scheduledStart,
              jitsiLink,
            );
          }
        } catch (emailErr) {
          this.logger.error(
            `Failed to send class scheduled email to ${enrollment.user?.email || 'unknown'}:`,
            emailErr,
          );
        }
      }
    } catch (dbErr) {
      this.logger.error(`Error querying enrollments for class notification:`, dbErr);
    }
  }

  async findAll(status?: string) {
    const where = status ? { status } : {};
    return this.prisma.class.findMany({
      where,
      orderBy: { scheduledStart: 'desc' },
    });
  }

  async findUpcoming() {
    return this.prisma.class.findMany({
      where: {
        scheduledStart: { gte: new Date() },
        status: { in: ['scheduled', 'live'] },
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async findById(id: string) {
    const cls = await this.prisma.class.findUnique({ where: { id } });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    return cls;
  }

  async update(id: string, dto: UpdateClassDto) {
    const cls = await this.findById(id);

    // If class is being marked as completed, end the Zoom meeting on Zoom's servers
    if (dto.status === 'completed' && cls.status !== 'completed' && cls.zoomMeetingId) {
      this.zoomService.endZoomMeeting(cls.zoomMeetingId).catch((err) =>
        this.logger.error(`Failed to end Zoom meeting ${cls.zoomMeetingId} for class ${id}:`, err),
      );
    }

    // Sync meeting details to Zoom if it exists
    if (cls.zoomMeetingId && (dto.title || dto.scheduledStart || dto.scheduledEnd)) {
      const start = dto.scheduledStart ? new Date(dto.scheduledStart) : cls.scheduledStart;
      const end = dto.scheduledEnd ? new Date(dto.scheduledEnd) : cls.scheduledEnd;
      const durationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);

      this.zoomService.updateZoomMeeting(cls.zoomMeetingId, {
        topic: dto.title,
        startTime: dto.scheduledStart ? new Date(dto.scheduledStart) : undefined,
        durationMinutes,
      }).catch((err) => this.logger.error(`Failed to update Zoom meeting ${cls.zoomMeetingId}`, err));
    }

    return this.prisma.class.update({
      where: { id },
      data: {
        ...dto,
        scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : undefined,
        scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : undefined,
      },
    });
  }

  async delete(id: string) {
    const cls = await this.findById(id);

    // Delete the Zoom meeting permanently
    if (cls.zoomMeetingId) {
      this.zoomService.deleteZoomMeeting(cls.zoomMeetingId).catch((err) =>
        this.logger.error(`Failed to delete Zoom meeting ${cls.zoomMeetingId} on delete for class ${id}:`, err),
      );
    }

    return this.prisma.class.delete({ where: { id } });
  }

  async joinClass(
    classId: string,
    userId: string,
    userRole: string,
  ) {
    const cls = await this.findById(classId);

    if (cls.status === 'completed') {
      throw new ForbiddenException('This class has already ended');
    }

    // If student, verify enrollment
    if (userRole === 'student') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          userId,
          isActive: true,
          course: { name: cls.courseName },
          OR: [
            { batchName: cls.batchName },
            { batchName: null },
          ],
        },
      });

      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course and batch');
      }
    }

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isModerator = user.role === 'admin' || user.role === 'teacher';

    // Ensure Zoom meeting details exist, join using Zoom SDK credentials and signature
    if (!cls.zoomMeetingId) {
      throw new BadRequestException('This class does not have a Zoom meeting scheduled. Please contact the administrator.');
    }

    const zoomMeetingNumber = this.zoomService.normalizeMeetingNumber(cls.zoomMeetingId);
    const signature = this.zoomService.generateSignature({
      meetingNumber: zoomMeetingNumber,
      role: isModerator ? 1 : 0,
    });

    // ── ZAK token: required for the host to claim host privileges in the SDK ──
    // Without a ZAK, the host joins with an elevated JWT (role:1) but Zoom's
    // backend does not grant actual host controls — Participants panel "Admit"
    // buttons, waiting-room management, and mute-all are all hidden.
    // We fetch a fresh ZAK on every host join (they expire in ~90 min, never cache).
    let zak: string | null = null;
    if (isModerator) {
      zak = await this.zoomService.getZakToken();
      if (!zak) {
        // Non-fatal: host can still join but will lack full host controls.
        // The error is already logged inside getZakToken() with fix instructions.
      }
    }

    return {
      zoomMeetingId: zoomMeetingNumber,
      zoomPasscode: cls.zoomPasscode,
      signature,
      sdkKey: this.zoomService.getSdkKey(),
      userName: user.name,
      userRole: user.role,
      isModerator,
      allowStudentMic: cls.allowStudentMic,
      allowStudentCamera: cls.allowStudentCamera,
      allowStudentScreenshare: cls.allowStudentScreenshare,
      // Included only for moderators; undefined for students (not serialised).
      ...(zak ? { zak } : {}),
    };
  }


  async forceEndZoom(id: string) {
    const cls = await this.findById(id);
    if (!cls.zoomMeetingId) {
      throw new BadRequestException('This class does not have a Zoom meeting scheduled.');
    }
    const ended = await this.zoomService.endZoomMeeting(cls.zoomMeetingId);
    if (!ended) {
      throw new InternalServerErrorException('Failed to end Zoom meeting. Please check API configurations.');
    }
    return { message: 'Zoom meeting ended successfully.' };
  }
  async findUpcomingForStudent(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, isActive: true },
      include: { course: { select: { name: true } } },
    });

    if (enrollments.length === 0) return [];

    const conditions = enrollments.map((e: any) => {
      if (e.batchName) {
        return {
          courseName: e.course.name,
          batchName: e.batchName,
        };
      }
      return {
        courseName: e.course.name,
      };
    });

    return this.prisma.class.findMany({
      where: {
        status: { in: ['scheduled', 'live'] },
        OR: conditions,
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async findPastForStudent(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, isActive: true },
      include: { course: { select: { name: true } } },
    });

    if (enrollments.length === 0) return [];

    const conditions = enrollments.map((e: any) => {
      if (e.batchName) {
        return {
          courseName: e.course.name,
          batchName: e.batchName,
        };
      }
      return {
        courseName: e.course.name,
      };
    });

    return this.prisma.class.findMany({
      where: {
        status: 'completed',
        OR: conditions,
      },
      orderBy: { scheduledStart: 'desc' },
    });
  }

  async findRecordingsForStudent(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, isActive: true },
      include: {
        course: { select: { id: true, name: true, lecturesPerLiveClass: true } },
        batch: { select: { status: true } },
      },
    });

    if (enrollments.length === 0) return [];

    const now = new Date();
    const allLectures: any[] = [];

    for (const enrollment of enrollments) {
      if (!enrollment.course) {
        this.logger.warn(`Enrollment ${enrollment.id} is missing course relation. Skipping.`);
        continue;
      }

      const isBatchCompleted = enrollment.batch?.status === 'completed' || (enrollment.endDate && now >= enrollment.endDate);

      const courseLectures = await this.prisma.recordedLecture.findMany({
        where: {
          courseId: enrollment.courseId,
          recordingLive: true,
        },
        include: {
          course: { select: { name: true } },
        },
      });

      // Sort lectures numerically by classNo
      courseLectures.sort((a: any, b: any) => a.classNo - b.classNo);

      let completedLiveCount = 0;
      if (!isBatchCompleted) {
        const classConditions: any[] = [];
        if (enrollment.batchId) {
          classConditions.push({ batchId: enrollment.batchId });
        }
        if (enrollment.batchName) {
          classConditions.push({ batchName: enrollment.batchName });
        }

        completedLiveCount = await this.prisma.class.count({
          where: {
            courseName: enrollment.course.name,
            status: 'completed',
            ...(classConditions.length > 0 ? { OR: classConditions } : {}),
          },
        });
      }

      const multiplier = enrollment.course.lecturesPerLiveClass ?? 1;
      const unlockedCount = completedLiveCount * multiplier;

      const mapped = courseLectures.map((lecture: any, index: number) => {
        const isLocked = !isBatchCompleted && index >= unlockedCount;
        return {
          id: lecture.id,
          classNo: lecture.classNo,
          title: lecture.title,
          courseName: lecture.course.name,
          duration: lecture.duration,
          hasRecording: true,
          isLocked,
        };
      });

      allLectures.push(...mapped);
    }

    return allLectures;
  }

  private extractYoutubeVideoId(url: string): string | null {
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|embed|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  }

  async generateRecordingToken(lectureId: string, userId: string, userRole: string) {
    const lecture = await this.prisma.recordedLecture.findUnique({
      where: { id: lectureId },
      include: { course: true },
    });
    if (!lecture) {
      throw new NotFoundException('Recorded lecture not found');
    }

    if (userRole !== 'admin' && userRole !== 'teacher') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          userId,
          isActive: true,
          courseId: lecture.courseId,
        },
        include: {
          course: { select: { name: true, lecturesPerLiveClass: true } },
          batch: { select: { status: true } },
        },
      });

      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course');
      }

      const now = new Date();
      const isBatchCompleted = enrollment.batch?.status === 'completed' || now >= enrollment.endDate;

      if (!isBatchCompleted) {
        const classConditions: any[] = [];
        if (enrollment.batchId) {
          classConditions.push({ batchId: enrollment.batchId });
        }
        if (enrollment.batchName) {
          classConditions.push({ batchName: enrollment.batchName });
        }

        const completedLiveCount = await this.prisma.class.count({
          where: {
            courseName: enrollment.course.name,
            status: 'completed',
            ...(classConditions.length > 0 ? { OR: classConditions } : {}),
          },
        });

        const siblingLectures = await this.prisma.recordedLecture.findMany({
          where: {
            courseId: lecture.courseId,
            recordingLive: true,
          },
        });

        siblingLectures.sort((a: any, b: any) => a.classNo - b.classNo);

        const lectureIndex = siblingLectures.findIndex((l: any) => l.id === lecture.id);
        const multiplier = enrollment.course.lecturesPerLiveClass ?? 1;
        const unlockedCount = completedLiveCount * multiplier;
        if (lectureIndex === -1 || lectureIndex >= unlockedCount) {
          throw new ForbiddenException('This recorded class is locked until the corresponding live class is held.');
        }
      }
    }

    const youtubeId = this.extractYoutubeVideoId(lecture.recordingUrl);
    if (!youtubeId) {
      throw new BadRequestException('Invalid recording URL. Only valid YouTube URLs are allowed.');
    }

    const token = this.recordingTokenService.createToken(lecture.id, lecture.id);
    return { token };
  }

  async getDashboardHierarchy() {
    const batches = await this.prisma.batch.findMany({
      include: {
        courses: {
          select: {
            id: true,
            name: true,
          },
        },
        enrollments: {
          select: {
            id: true,
          },
        },
        admissions: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    const allDbClasses = await this.prisma.class.findMany({
      orderBy: { scheduledStart: 'asc' },
    });

    return batches.map((batch: any) => {
      // Find classes belonging to this batch by ID or by Name
      const batchClasses = allDbClasses.filter(
        (cls: any) => cls.batchId === batch.id || (cls.batchName && cls.batchName.toLowerCase() === batch.name.toLowerCase())
      );

      // Group classes of this batch by course name
      const courseClassesMap: { [courseName: string]: any[] } = {};
      batch.courses.forEach((course: any) => {
        courseClassesMap[course.name] = [];
      });

      batchClasses.forEach((cls: any) => {
        if (courseClassesMap[cls.courseName]) {
          courseClassesMap[cls.courseName].push(cls);
        } else {
          const matchedCourseKey = Object.keys(courseClassesMap).find(
            (key) => key.toLowerCase() === cls.courseName.toLowerCase()
          );
          if (matchedCourseKey) {
            courseClassesMap[matchedCourseKey].push(cls);
          } else {
            courseClassesMap[cls.courseName] = [cls];
          }
        }
      });

      return {
        id: batch.id,
        name: batch.name,
        startDate: batch.startDate,
        endDate: batch.endDate,
        isActive: batch.isActive,
        status: batch.status,
        totalApplicants: batch.admissions.length || batch.enrollments.length,
        courses: batch.courses.map((course: any) => ({
          id: course.id,
          name: course.name,
          classes: courseClassesMap[course.name] || [],
        })),
      };
    });
  }

  async findAllRecordings() {
    return this.prisma.recordedLecture.findMany({
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { course: { name: 'asc' } },
        { classNo: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async createRecording(dto: CreateRecordedLectureDto) {
    return this.prisma.recordedLecture.create({
      data: {
        courseId: dto.courseId,
        classNo: dto.classNo,
        title: dto.title,
        recordingUrl: dto.recordingUrl,
        duration: dto.duration,
        recordingLive: dto.recordingLive ?? false,
      },
    });
  }

  async updateRecording(id: string, dto: UpdateRecordedLectureDto) {
    return this.prisma.recordedLecture.update({
      where: { id },
      data: dto,
    });
  }

  async deleteRecording(id: string) {
    return this.prisma.recordedLecture.delete({
      where: { id },
    });
  }

  async verifyRecordingToken(token: string, userId: string, userRole: string) {
    const tokenInfo = this.recordingTokenService.verifyAndBurn(token);
    if (!tokenInfo) {
      throw new ForbiddenException('Invalid or expired recording access token');
    }
    const lectureId = tokenInfo.lectureId;
    const expiresInSeconds = Math.max(0, Math.floor((tokenInfo.expiresAt - Date.now()) / 1000));

    const lecture = await this.prisma.recordedLecture.findUnique({
      where: { id: lectureId },
      include: { course: { select: { id: true, name: true } } },
    });
    if (!lecture) {
      throw new NotFoundException('Recorded lecture not found');
    }

    const youtubeId = this.extractYoutubeVideoId(lecture.recordingUrl);
    if (!youtubeId) {
      throw new BadRequestException('Recording URL is not a valid YouTube URL');
    }

    // Fetch all published sibling lectures in the same course for sidebar
    const siblingLectures = await this.prisma.recordedLecture.findMany({
      where: {
        courseId: lecture.courseId,
        recordingLive: true,
      },
      select: {
        id: true,
        classNo: true,
        title: true,
        duration: true,
      },
    });

    // Sort sibling lectures numerically
    siblingLectures.sort((a: any, b: any) => a.classNo - b.classNo);

    // Check lock status for each sibling lecture if user is student
    let completedLiveCount = 0;
    let isBatchCompleted = false;

    if (userRole !== 'admin' && userRole !== 'teacher') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          userId,
          isActive: true,
          courseId: lecture.courseId,
        },
        include: {
          course: { select: { name: true, lecturesPerLiveClass: true } },
          batch: { select: { status: true } },
        },
      });

      if (enrollment) {
        const now = new Date();
        isBatchCompleted = enrollment.batch?.status === 'completed' || now >= enrollment.endDate;

        if (!isBatchCompleted) {
          const classConditions: any[] = [];
          if (enrollment.batchId) {
            classConditions.push({ batchId: enrollment.batchId });
          }
          if (enrollment.batchName) {
            classConditions.push({ batchName: enrollment.batchName });
          }

          completedLiveCount = await this.prisma.class.count({
            where: {
              courseName: enrollment.course.name,
              status: 'completed',
              ...(classConditions.length > 0 ? { OR: classConditions } : {}),
            },
          });
        }

        const mappedLectures = siblingLectures.map((item: any, index: number) => {
          let isLocked = false;
          if (!isBatchCompleted) {
            const multiplier = enrollment.course.lecturesPerLiveClass ?? 1;
            const unlockedCount = completedLiveCount * multiplier;
            isLocked = index >= unlockedCount;
          }
          return {
            ...item,
            isLocked,
          };
        });

        return {
          type: 'youtube',
          videoId: youtubeId,
          expiresInSeconds,
          currentLectureId: lecture.id,
          courseName: lecture.course.name,
          lectures: mappedLectures,
        };
      }
    }

    const mappedLectures = siblingLectures.map((item: any) => ({
      ...item,
      isLocked: false,
    }));

    return {
      type: 'youtube',
      videoId: youtubeId,
      expiresInSeconds,
      currentLectureId: lecture.id,
      courseName: lecture.course.name,
      lectures: mappedLectures,
    };
  }

  async getUpcomingCount() {
    return this.prisma.class.count({
      where: {
        scheduledStart: { gte: new Date() },
        status: { in: ['scheduled', 'live'] },
      },
    });
  }

  async getLiveSessionState(classId: string) {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });

    if (!liveSession) {
      return { waiting: [], active: [] };
    }

    const waiting = await this.prisma.waitingParticipant.findMany({
      where: { liveSessionId: liveSession.id, status: 'waiting' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const active = await this.prisma.attendance.findMany({
      where: { liveSessionId: liveSession.id, leaveTime: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      waiting: waiting.map((w: any) => ({
        userId: w.user.id,
        name: w.user.name,
        email: w.user.email,
      })),
      active: active.map((a: any) => ({
        userId: a.user.id,
        name: a.user.name,
        email: a.user.email,
        role: a.user.role,
      })),
    };
  }
}
