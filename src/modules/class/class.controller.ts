import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ClassService } from './class.service';
import { CreateClassDto, UpdateClassDto, CreateRecordedLectureDto, UpdateRecordedLectureDto } from './dto/class.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';
import { RecordingService } from './recording.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Controller('classes')
export class ClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly recordingService: RecordingService,
    private readonly prisma: PrismaService,
  ) {}

  // Public — upcoming classes
  @Get('public/upcoming')
  findPublicUpcoming() {
    return this.classService.findUpcoming();
  }

  // Admin — create class
  @Post()
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateClassDto) {
    return this.classService.create(dto);
  }

  // Admin — list all classes
  @Get()
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findAll(@Query('status') status?: string) {
    return this.classService.findAll(status);
  }

  // Admin — upcoming count for dashboard
  @Get('count/upcoming')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  getUpcomingCount() {
    return this.classService.getUpcomingCount();
  }

  // Student — my upcoming classes
  @Get('my/upcoming')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  findMyUpcoming(@CurrentUser('sub') userId: string) {
    return this.classService.findUpcomingForStudent(userId);
  }

  // Student — my past classes
  @Get('my/past')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  findMyPast(@CurrentUser('sub') userId: string) {
    return this.classService.findPastForStudent(userId);
  }

  // Student — my recordings
  @Get('my/recordings')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  findMyRecordings(@CurrentUser('sub') userId: string) {
    return this.classService.findRecordingsForStudent(userId);
  }

  // Generate recording token (protected, checks enrollment + 2-month window)
  @Post(':id/recording-token')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  generateRecordingToken(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.classService.generateRecordingToken(id, userId, userRole);
  }

  // Verify recording token (protected, checks enrollment class unlock status)
  @Post('recording/verify')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  verifyRecordingToken(
    @Body('token') token: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.classService.verifyRecordingToken(token, userId, userRole);
  }

  // Join class — returns Zoom SDK credentials & signature
  @Get(':id/join')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  joinClass(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.classService.joinClass(id, userId, userRole);
  }

  // Admin — get single class
  @Get(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  findById(@Param('id') id: string) {
    return this.classService.findById(id);
  }

  // Admin — update class
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classService.update(id, dto);
  }

  // Admin — force end Zoom meeting session
  @Post(':id/end-zoom')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin', 'teacher')
  forceEndZoom(@Param('id') id: string) {
    return this.classService.forceEndZoom(id);
  }

  // Admin — delete class
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.classService.delete(id);
  }

  // Admin — dashboard hierarchy (Batch -> Course -> Classes)
  @Get('dashboard/hierarchy')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  getDashboardHierarchy() {
    return this.classService.getDashboardHierarchy();
  }

  // Admin — list all recordings across all courses
  @Get('recordings/all')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findAllRecordings() {
    return this.classService.findAllRecordings();
  }

  // Admin — create recorded lecture
  @Post('recordings')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  createRecording(@Body() dto: CreateRecordedLectureDto) {
    return this.classService.createRecording(dto);
  }

  // Admin — update recorded lecture
  @Patch('recordings/:id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  updateRecording(@Param('id') id: string, @Body() dto: UpdateRecordedLectureDto) {
    return this.classService.updateRecording(id, dto);
  }

  // Admin — delete recorded lecture
  @Delete('recordings/:id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  deleteRecording(@Param('id') id: string) {
    return this.classService.deleteRecording(id);
  }

  // Get secure playback credentials for recorded lecture
  @Get('recordings/secure-playback/:id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  getSecurePlayback(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.recordingService.getSecurePlayback(id, { id: user.sub, role: user.role });
  }

  // Save playback progress
  @Patch('recordings/progress')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  updatePlaybackProgress(
    @CurrentUser('sub') userId: string,
    @Body() body: { recordedLectureId: string; durationWatched: number; lastPosition: number },
  ) {
    return this.recordingService.updatePlaybackProgress({
      userId,
      recordedLectureId: body.recordedLectureId,
      durationWatched: body.durationWatched,
      lastPosition: body.lastPosition,
    });
  }

  // Zoom Webhook (Public API Endpoint for zoom events)
  @Post('zoom-webhook')
  async handleZoomWebhook(@Req() req: Request, @Body() body: any) {
    const secret = process.env.ZOOM_WEBHOOK_SECRET;
    if (!secret) {
      throw new UnauthorizedException('Zoom webhook secret not configured');
    }

    const signature = req.headers['x-zm-signature'] as string;
    const timestamp = req.headers['x-zm-request-timestamp'] as string;

    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing Zoom webhook headers');
    }

    // Verify signature
    const message = `v0:${timestamp}:${req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body)}`;
    const hashForVerify = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');
    const signatureString = `v0=${hashForVerify}`;

    if (signature !== signatureString) {
      throw new UnauthorizedException('Invalid Zoom webhook signature');
    }

    // Zoom webhook challenge validation (URL validation handshake)
    if (body?.event === 'url_validation' && body?.payload?.plainToken) {
      const plainToken = body.payload.plainToken;
      const hash = crypto
        .createHmac('sha256', secret)
        .update(plainToken)
        .digest('hex');
      return {
        plainToken,
        encryptedToken: hash,
      };
    }

    if (body?.event === 'recording.completed') {
      await this.recordingService.handleRecordingCompletedWebhook(body.payload);
    }
    return { status: 'ok' };
  }

  // Admin/Teacher — get live classroom active state
  @Get(':id/live-state')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin', 'teacher')
  getLiveSessionState(@Param('id') id: string) {
    return this.classService.getLiveSessionState(id);
  }

  // Admin/Teacher — get audit log history
  @Get('audit-logs/history')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin', 'teacher')
  getAuditLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    return this.prisma.auditLog.findMany({
      where: {
        userId: userId || undefined,
        action: action || undefined,
      },
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
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }
}

