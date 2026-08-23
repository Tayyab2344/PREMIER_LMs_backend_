import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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

    const {
      applicationType,
      testReason,
      previousTraining,
      professionalExperience,
      assessmentMode,
      preferredAssessmentDate,
      transactionId,
      referenceId,
      classMode,
      ...prismaPayload
    } = dto;

    const formattedRemarks = [
      applicationType ? `[Type: ${applicationType}]` : null,
      classMode ? `[Class Mode: ${classMode}]` : null,
      testReason ? `[Test Reason: ${testReason}]` : null,
      assessmentMode ? `[Assessment Mode: ${assessmentMode}]` : null,
      preferredAssessmentDate ? `[Pref Date: ${preferredAssessmentDate}]` : null,
      previousTraining ? `[Training: ${previousTraining}]` : null,
      professionalExperience ? `[Exp: ${professionalExperience}]` : null,
      referenceId ? `[Ref: ${referenceId}]` : null,
    ]
      .filter(Boolean)
      .join(' ');

    const formattedPaymentMethod = dto.paymentMethod
      ? `${dto.paymentMethod}${transactionId ? ` (Trx: ${transactionId})` : ''}`
      : undefined;

    const newAdmission = await this.prisma.admission.create({
      data: {
        ...prismaPayload,
        email: dto.email.toLowerCase(),
        dateOfBirth: new Date(dto.dateOfBirth),
        userId: userId || undefined,
        paymentMethod: formattedPaymentMethod,
        remarks: formattedRemarks || undefined,
      },
    });

    try {
      await this.mailService.sendAdmissionReceived(
        newAdmission.email,
        newAdmission.fullName,
        newAdmission.selectedCourses,
      );
    } catch (err) {
      console.error('Failed to send admission received email:', err);
    }

    return newAdmission;
  }

  async findAll(status?: string, page?: number, limit?: number, search?: string) {
    const pageNum = page ? Math.max(1, Number(page)) : undefined;
    const limitNum = limit ? Math.max(1, Number(limit)) : undefined;

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { cnic: { contains: search, mode: 'insensitive' } },
        { whatsapp: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (!pageNum || !limitNum) {
      const data = await this.prisma.admission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      return {
        data,
        meta: { total: data.length, page: 1, limit: data.length, totalPages: 1 },
      };
    }

    const skip = (pageNum - 1) * limitNum;
    const [data, total] = await Promise.all([
      this.prisma.admission.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.admission.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
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
      
      try {
        await this.mailService.sendAdmissionApproved(
          result.user.email,
          result.user.name,
          result.generatedPassword || undefined,
        );
      } catch (err) {
        console.error('Failed to send admission approved email:', err);
      }

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

    // Deactivate user account if one exists so student cannot access portal
    const targetEmail = (admission.email || '').toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: admission.userId || undefined },
          { email: targetEmail },
        ],
      },
    });

    if (existingUser && existingUser.role === 'student') {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { isActive: false },
      });
    }

    try {
      await this.mailService.sendAdmissionRejected(
        rejectedAdmission.email,
        rejectedAdmission.fullName,
        dto.remarks,
      );
    } catch (err) {
      console.error('Failed to send admission rejected email:', err);
    }

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
        const registrationNo = await this.generateRegistrationNo(
          tx,
          admission.batchId,
          course.name,
          course.id,
          enrollmentStartDate,
        );

        await tx.enrollment.create({
          data: {
            userId: user.id,
            courseId: course.id,
            batchId: admission.batchId || undefined,
            batchName: batchName || undefined,
            registrationNo,
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

  private generatePassword(length = 12): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return password;
  }

  private async generateRegistrationNo(
    tx: Prisma.TransactionClient,
    batchId: string | null | undefined,
    courseName: string,
    courseId: string,
    enrollmentStartDate: Date,
  ): Promise<string> {
    let yearStr = new Date(enrollmentStartDate).getFullYear().toString().slice(-2);
    let batchNum = '01';

    if (batchId) {
      const batch = await tx.batch.findUnique({ where: { id: batchId } });
      if (batch) {
        yearStr = new Date(batch.startDate).getFullYear().toString().slice(-2);
        const match = batch.name.match(/\d+/);
        if (match) {
          batchNum = match[0].padStart(2, '0');
        }
      }
    }

    const batchPrefix = `B${yearStr}-${batchNum}`;

    const words = courseName.trim().split(/\s+/);
    let courseCode = words.map((w) => w[0]).join('').toUpperCase().slice(0, 3);
    if (!courseCode || courseCode.length < 2) {
      courseCode = courseName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CRS';
    }

    const existingCount = await tx.enrollment.count({
      where: {
        courseId,
        ...(batchId ? { batchId } : {}),
      },
    });

    const sequence = String(existingCount + 1).padStart(3, '0');
    return `${batchPrefix}-${courseCode}-${sequence}`;
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
