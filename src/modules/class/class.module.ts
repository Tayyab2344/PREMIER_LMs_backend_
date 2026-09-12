import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClassService } from './class.service';
import { ClassController } from './class.controller';
import { JitsiService } from './jitsi.service';
import { BbbService } from './bbb.service';
import { RecordingTokenService } from './recording-token.service';
import { ZoomService } from './zoom.service';
import { LiveClassGateway } from './live-class.gateway';
import { AttendanceService } from './attendance.service';
import { RecordingService } from './recording.service';
import { AuditService } from './audit.service';

import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret || secret.trim().length < 32) {
          throw new Error(
            'FATAL SECURITY ERROR: JWT_SECRET environment variable is missing or under 32 chars.',
          );
        }

        return { secret };
      },
    }),
  ],
  controllers: [ClassController],
  providers: [
    ClassService,
    JitsiService,
    BbbService,
    RecordingTokenService,
    ZoomService,
    LiveClassGateway,
    AttendanceService,
    RecordingService,
    AuditService,
  ],
  exports: [
    ClassService,
    RecordingTokenService,
    BbbService,
    ZoomService,
    LiveClassGateway,
    AttendanceService,
    RecordingService,
    AuditService,
  ],
})
export class ClassModule { }
