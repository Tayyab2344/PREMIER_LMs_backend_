import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async findAll(role?: string, page?: number, limit?: number, search?: string) {
    const pageNum = page ? Math.max(1, Number(page)) : undefined;
    const limitNum = limit ? Math.max(1, Number(limit)) : undefined;

    const where: any = {};
    if (role && role !== 'all') {
      where.role = role;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const selectFields = {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: { enrollments: true },
      },
    };

    if (!pageNum || !limitNum) {
      const data = await this.prisma.user.findMany({
        where,
        select: selectFields,
        orderBy: { createdAt: 'desc' },
      });
      return {
        data,
        meta: { total: data.length, page: 1, limit: data.length, totalPages: 1 },
      };
    }

    const skip = (pageNum - 1) * limitNum;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: selectFields,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
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
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        enrollments: {
          include: {
            course: {
              select: { id: true, name: true },
            },
          },
        },
        admissions: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async toggleActive(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        isActive: !user.isActive,
        currentToken: !user.isActive ? user.currentToken : null, // Clear token on deactivation
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    });
  }

  async getStudentCount() {
    return this.prisma.user.count({
      where: { role: 'student', isActive: true },
    });
  }

  private generatePassword(length = 12): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return password;
  }

  async createStudent(dto: {
    name: string;
    email: string;
    password?: string;
    courseId?: string;
    batchId?: string;
  }) {
    const emailNormalized = dto.email.toLowerCase();

    // 1. Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: emailNormalized },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    // 2. Generate / hash password
    const rawPassword = dto.password || this.generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // 3. If courseId is provided, make sure it exists
    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException('Course not found');
      }
    }

    // 4. Create user and enrollment inside a transaction
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: emailNormalized,
          name: dto.name,
          role: 'student',
          password: hashedPassword,
          isActive: true,
        },
      });

      if (dto.courseId) {
        const now = new Date();
        const threeMonthsLater = new Date(now);
        threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

        let batchName: string | undefined = undefined;
        let enrollmentStartDate = now;
        let enrollmentEndDate = threeMonthsLater;

        if (dto.batchId) {
          const batch = await tx.batch.findUnique({
            where: { id: dto.batchId },
          });
          if (batch) {
            batchName = batch.name;
            enrollmentStartDate = batch.startDate;
            enrollmentEndDate = batch.endDate;
          }
        }

        await tx.enrollment.create({
          data: {
            userId: user.id,
            courseId: dto.courseId,
            batchId: dto.batchId || undefined,
            batchName: batchName || undefined,
            startDate: enrollmentStartDate,
            endDate: enrollmentEndDate,
          },
        });
      }

      return user;
    });

    try {
      await this.mailService.sendAdmissionApproved(
        result.email,
        result.name,
        rawPassword,
      );
    } catch (err) {
      console.error('Failed to send student welcome email:', err);
    }

    return {
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
      },
      password: rawPassword, // Send plain password to admin
    };
  }
}
