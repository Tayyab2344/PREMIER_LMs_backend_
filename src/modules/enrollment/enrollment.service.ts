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

  async findAll() {
    return this.prisma.enrollment.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        course: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
