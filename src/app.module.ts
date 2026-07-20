import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CourseModule } from './modules/course/course.module';
import { AdmissionModule } from './modules/admission/admission.module';
import { UserModule } from './modules/user/user.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { ClassModule } from './modules/class/class.module';
import { UploadModule } from './modules/upload/upload.module';
import { BatchModule } from './modules/batch/batch.module';
import { MailModule } from './modules/mail/mail.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    CourseModule,
    AdmissionModule,
    UserModule,
    EnrollmentModule,
    ClassModule,
    UploadModule,
    BatchModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
