import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(role?: string) {
    const where = role ? { role } : {};
    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
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
