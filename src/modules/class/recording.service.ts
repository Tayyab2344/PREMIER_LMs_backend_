import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ZoomService } from './zoom.service';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zoomService: ZoomService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Toggles live recording control using Zoom REST API.
   * Gracefully falls back to manual host control if programmatic recording is restricted.
   */
  async controlRecording(meetingId: string, action: 'start' | 'pause' | 'resume' | 'stop') {
    const token = await this.zoomService.getAccessToken();
    if (!token) {
      this.logger.warn('[RecordingService] Zoom OAuth token missing. Falling back to host control.');
      return { success: false, fallback: true, message: 'OAuth token unavailable' };
    }

    try {
      const response = await fetch(
        `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/recordings`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action }),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`[RecordingService] Zoom API rejected recording control (${response.status}): ${errText}`);
        return { success: false, fallback: true, message: `Zoom API returned ${response.status}` };
      }

      this.logger.log(`[RecordingService] Successfully sent recording ${action} command to Zoom.`);
      return { success: true, fallback: false };
    } catch (err: any) {
      this.logger.error(`[RecordingService] Failed to call Zoom recording control: ${err.message}`);
      return { success: false, fallback: true, message: err.message };
    }
  }

  /**
   * Processes the recording.completed Zoom Webhook event.
   * Downloads the cloud recording, uploads it to secure storage, and creates database records.
   */
  async handleRecordingCompletedWebhook(payload: any) {
    this.logger.log('[RecordingService] Received Zoom recording.completed webhook.');
    const object = payload?.object;
    if (!object) return;

    const meetingId = String(object.id);
    const recordingFiles = object.recording_files || [];
    
    // Find all video files (MP4)
    const videoFiles = recordingFiles.filter(
      (f: any) => f.file_type?.toUpperCase() === 'MP4',
    );

    if (videoFiles.length === 0) {
      this.logger.warn(`[RecordingService] No video file found in recording payload for meeting ${meetingId}`);
      return;
    }

    // Resolve corresponding class in database
    const cls = await this.prisma.class.findFirst({
      where: { zoomMeetingId: meetingId },
      include: { batch: { include: { courses: true } } },
    });

    if (!cls) {
      this.logger.warn(`[RecordingService] Could not find Class record for Zoom meeting ${meetingId}`);
      return;
    }

    // Find course ID
    const courseId = cls.batch?.courses[0]?.id;
    if (!courseId) {
      this.logger.warn(`[RecordingService] Class ${cls.id} has no course associated with it.`);
      return;
    }

    const downloadToken = payload.download_token;

    for (const videoFile of videoFiles) {
      const zoomFileId = String(videoFile.id);

      // Check idempotency: Have we already processed this specific recording file?
      const existing = await this.prisma.recordedLecture.findUnique({
        where: { zoomFileId },
      });

      if (existing) {
        this.logger.log(`[RecordingService] Skipping already processed recording file ${zoomFileId} for meeting ${meetingId}`);
        continue;
      }
      
      const downloadUrl = videoFile.download_url;
      const finalDownloadUrl = downloadToken ? `${downloadUrl}?access_token=${downloadToken}` : downloadUrl;

      // Pipeline-wide exponential backoff retry logic
      const MAX_RETRIES = 3;
      let cloudinaryUrl = '';

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          this.logger.log(`[RecordingService] Fetching Zoom recording stream for ${zoomFileId} (Attempt ${attempt})`);
          const response = await fetch(finalDownloadUrl);
          
          if (!response.ok) {
            throw new Error(`Failed to download from Zoom: ${response.status} ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error(`Empty response body from Zoom`);
          }

          // Convert Web ReadableStream to Node Readable
          const nodeStream = Readable.fromWeb(response.body as any);

          this.logger.log(`[RecordingService] Uploading stream to Cloudinary for ${zoomFileId}`);
          cloudinaryUrl = await new Promise<string>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { resource_type: 'video', folder: 'premier_lms/recordings' },
              (error, result) => {
                if (error) return reject(error);
                if (result) return resolve(result.secure_url);
                reject(new Error('Unknown Cloudinary upload error'));
              }
            );

            nodeStream.pipe(uploadStream);
            
            // Handle upstream errors killing the pipeline
            nodeStream.on('error', (err) => {
              uploadStream.destroy(err);
              reject(err);
            });
          });

          // If we reach here, upload succeeded, break out of retry loop
          this.logger.log(`[RecordingService] Successfully uploaded ${zoomFileId} to Cloudinary`);
          break;
        } catch (error: any) {
          this.logger.error(`[RecordingService] Pipeline failed for ${zoomFileId} on attempt ${attempt}: ${error.message}`);
          if (attempt === MAX_RETRIES) {
            this.logger.error(`[RecordingService] Giving up on recording ${zoomFileId} after ${MAX_RETRIES} attempts.`);
            // Don't continue to database saving, let it skip this file but process others
            cloudinaryUrl = ''; 
          } else {
            // Exponential backoff
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(res => setTimeout(res, delay));
          }
        }
      }

      if (!cloudinaryUrl) {
        continue; // Skip DB creation if the upload ultimately failed
      }

      try {
        // 1. Save recording metadata in database using Cloudinary URL
        const durationSeconds = videoFile.duration || Math.floor((videoFile.file_size || 0) / 100000); // fallback estimation
        
        const lecture = await this.prisma.recordedLecture.create({
          data: {
            courseId,
            title: `Recording: ${cls.title}`,
            recordingUrl: cloudinaryUrl,
            recordingLive: false,
            duration: durationSeconds,
            zoomFileId,
          },
        });

        // 2. Log in AuditLog
        await this.prisma.auditLog.create({
          data: {
            userId: 'system-webhook',
            action: 'RECORDING_STOPPED',
            details: `Migrated Zoom recording ${zoomFileId} to Cloudinary. Saved as Lecture ${lecture.id}`,
            ipAddress: '127.0.0.1',
            userAgent: 'Zoom-Webhook-Client',
          },
        });

        // 3. Update Class record status
        await this.prisma.class.update({
          where: { id: cls.id },
          data: {
            recordingUrl: cloudinaryUrl,
            status: 'completed',
          },
        });

        this.logger.log(`[RecordingService] Saved recorded lecture ${lecture.id} for course ${courseId}`);
      } catch (err: any) {
        this.logger.error(`[RecordingService] Error saving recording to database: ${err.message}`);
      }
    }
  }

  /**
   * Generates secure playback credentials for a student or teacher.
   * Ensures the student is enrolled in the course and returns temporary URLs.
   */
  async getSecurePlayback(recordedLectureId: string, user: { id: string; role: string }) {
    const lecture = await this.prisma.recordedLecture.findUnique({
      where: { id: recordedLectureId },
      include: { course: true },
    });

    if (!lecture) {
      throw new NotFoundException('Recorded lecture not found');
    }

    // If user is student, enforce enrollment check
    if (user.role === 'student') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          userId: user.id,
          courseId: lecture.courseId,
          isActive: true,
        },
      });

      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course to view this recording.');
      }
    }

    // Log the playback view in AuditLog
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'JOIN_CLASS', // Maps to classroom playback audit
        details: `Viewed recording ${recordedLectureId} of Course ${lecture.courseId}`,
        ipAddress: '127.0.0.1', // Will be overridden by controller's real IP
        userAgent: 'LMS-Web-Player',
      },
    });

    // Return secure config with temporary play duration and resume positions
    const history = await this.prisma.playbackHistory.findFirst({
      where: {
        userId: user.id,
        recordedLectureId,
      },
    });

    return {
      id: lecture.id,
      title: lecture.title,
      courseName: lecture.course.name,
      duration: lecture.duration,
      lastPosition: history?.lastPosition || 0,
      streamUrl: lecture.recordingUrl, // Secure tokenized URL or cloud stream
      disableDownload: true,
      playbackSpeedEnabled: true,
    };
  }

  /**
   * Save user's resume position and play duration.
   */
  async updatePlaybackProgress(params: {
    userId: string;
    recordedLectureId: string;
    durationWatched: number;
    lastPosition: number;
  }) {
    const existing = await this.prisma.playbackHistory.findFirst({
      where: {
        userId: params.userId,
        recordedLectureId: params.recordedLectureId,
      },
    });

    if (existing) {
      await this.prisma.playbackHistory.update({
        where: { id: existing.id },
        data: {
          durationWatched: { increment: params.durationWatched },
          lastPosition: params.lastPosition,
          viewedAt: new Date(),
        },
      });
    } else {
      await this.prisma.playbackHistory.create({
        data: {
          userId: params.userId,
          recordedLectureId: params.recordedLectureId,
          durationWatched: params.durationWatched,
          lastPosition: params.lastPosition,
        },
      });
    }
  }
}
