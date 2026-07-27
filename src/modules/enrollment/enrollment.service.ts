import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId, isActive: true },
      include: {
        course: {
          select: { id: true, name: true, originalFee: true, discountedFee: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findAll(page?: number, limit?: number, search?: string) {
    const pageNum = page ? Math.max(1, Number(page)) : undefined;
    const limitNum = limit ? Math.max(1, Number(limit)) : undefined;

    const where: any = {};
    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { course: { name: { contains: search, mode: 'insensitive' } } },
        { batchName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const includeConfig = {
      user: {
        select: { id: true, name: true, email: true },
      },
      course: {
        select: { id: true, name: true },
      },
    };

    if (!pageNum || !limitNum) {
      const data = await this.prisma.enrollment.findMany({
        where,
        include: includeConfig,
        orderBy: { createdAt: 'desc' },
      });
      return {
        data,
        meta: { total: data.length, page: 1, limit: data.length, totalPages: 1 },
      };
    }

    const skip = (pageNum - 1) * limitNum;
    const [data, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        include: includeConfig,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.enrollment.count({ where }),
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

  async updateBatch(id: string, batchName: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    const batch = await this.prisma.batch.findUnique({
      where: { name: batchName },
    });

    return this.prisma.enrollment.update({
      where: { id },
      data: {
        batchName,
        batchId: batch ? batch.id : null,
      },
    });
  }
}
