import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateAdmissionDto, UpdateAdmissionStatusDto } from './dto/admission.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AdmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateAdmissionDto) {
    // Check for duplicate CNIC
    const existingCnic = await this.prisma.admission.findUnique({
      where: { cnic: dto.cnic },
    });
    if (existingCnic) {
      throw new ConflictException('An application with this CNIC already exists');
    }

    // Check for duplicate email in admissions (pending applications)
    const existingEmail = await this.prisma.admission.findFirst({
      where: { email: dto.email.toLowerCase(), status: 'pending' },
    });
    if (existingEmail) {
      throw new ConflictException('You already have a pending application. Please wait for admin approval.');
    }

    // Check if a registered user exists with this email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    let userId: string | undefined = undefined;

    if (existingUser) {
      // Check if user already has an active enrollment (single-course constraint)
      const activeEnrollment = await this.prisma.enrollment.findFirst({
        where: { userId: existingUser.id, isActive: true },
        include: { course: { select: { name: true } } },
      });

      if (activeEnrollment) {
        throw new BadRequestException(
          `You are currently enrolled in "${activeEnrollment.course.name}". You can only take one course at a time.`,
        );
      }

      userId = existingUser.id;
    }

    const newAdmission = await this.prisma.admission.create({
      data: {
        ...dto,
        email: dto.email.toLowerCase(),
        dateOfBirth: new Date(dto.dateOfBirth),
        userId: userId || undefined,
      },
    });

    this.mailService.sendAdmissionReceived(
      newAdmission.email,
      newAdmission.fullName,
      newAdmission.selectedCourses,
    ).catch((err) =>
      console.error('Failed to send admission received email:', err),
    );

    return newAdmission;
  }

  async findAll(status?: string) {
    const where = status ? { status } : {};
    return this.prisma.admission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findById(id: string) {
    const admission = await this.prisma.admission.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    if (!admission) {
      throw new NotFoundException('Application not found');
    }
    return admission;
  }

  async updateStatus(id: string, dto: UpdateAdmissionStatusDto) {
    const admission = await this.findById(id);

    if (admission.status !== 'pending') {
      throw new BadRequestException(
        `Application has already been ${admission.status}`,
      );
    }

    if (!['approved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('Status must be "approved" or "rejected"');
    }

    if (dto.status === 'approved') {
      const result = await this.approveApplication(admission, dto.remarks);
      
      this.mailService.sendAdmissionApproved(
        result.user.email,
        result.user.name,
        result.generatedPassword || undefined,
      ).catch((err) =>
        console.error('Failed to send admission approved email:', err),
      );

      return result;
    }

    // Reject
    const rejectedAdmission = await this.prisma.admission.update({
      where: { id },
      data: {
        status: 'rejected',
        remarks: dto.remarks,
      },
    });

    this.mailService.sendAdmissionRejected(
      rejectedAdmission.email,
      rejectedAdmission.fullName,
      dto.remarks,
    ).catch((err) =>
      console.error('Failed to send admission rejected email:', err),
    );

    return rejectedAdmission;
  }

  private async approveApplication(admission: any, remarks?: string) {
    // Use a transaction for atomicity
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let user: any;
      let rawPassword: string | null = null;

      // Check if the admission is linked to an existing user (self-registered student)
      if (admission.userId) {
        user = await tx.user.findUnique({
          where: { id: admission.userId },
        });
      }

      // Also check by email in case user registered after submitting
      if (!user) {
        user = await tx.user.findUnique({
          where: { email: admission.email },
        });
      }

      if (user) {
        // Existing user — ensure role is student and active
        if (user.role !== 'student') {
          await tx.user.update({
            where: { id: user.id },
            data: { role: 'student', isActive: true },
          });
        }
      } else {
        // New user — generate password and create account
        rawPassword = this.generatePassword();
        const hashedPassword = await bcrypt.hash(rawPassword, 12);

        user = await tx.user.create({
          data: {
            email: admission.email,
            name: admission.fullName,
            role: 'student',
            password: hashedPassword,
            isActive: true,
          },
        });
      }

      // Create Enrollments for each selected course
      const courses = await tx.course.findMany({
        where: {
          name: { in: admission.selectedCourses },
          isActive: true,
        },
      });

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      let batchName: string | undefined = undefined;
      let enrollmentStartDate = now;
      let enrollmentEndDate = threeMonthsLater;

      if (admission.batchId) {
        const batch = await tx.batch.findUnique({
          where: { id: admission.batchId },
        });
        if (batch) {
          batchName = batch.name;
          enrollmentStartDate = batch.startDate;
          enrollmentEndDate = batch.endDate;
        }
      }

      for (const course of courses) {
        await tx.enrollment.create({
          data: {
            userId: user.id,
            courseId: course.id,
            batchId: admission.batchId || undefined,
            batchName: batchName || undefined,
            startDate: enrollmentStartDate,
            endDate: enrollmentEndDate,
          },
        });
      }

      // Update Admission status and link user
      const updatedAdmission = await tx.admission.update({
        where: { id: admission.id },
        data: {
          status: 'approved',
          remarks,
          userId: user.id,
        },
      });

      return {
        admission: updatedAdmission,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        generatedPassword: rawPassword, // null if existing user
        enrolledCourses: courses.map((c: any) => c.name),
      };
    });

    return result;
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async getStats() {
    const [total, pending, approved, rejected] = await Promise.all([
      this.prisma.admission.count(),
      this.prisma.admission.count({ where: { status: 'pending' } }),
      this.prisma.admission.count({ where: { status: 'approved' } }),
      this.prisma.admission.count({ where: { status: 'rejected' } }),
    ]);
    return { total, pending, approved, rejected };
  }
}
