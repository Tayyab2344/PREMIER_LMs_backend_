import { Injectable, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBatchDto, UpdateBatchDto } from './dto/batch.dto';

// Trigger TS refresh after schema sync
@Injectable()
export class BatchService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Align old inactive batches with status = 'completed'
    await this.prisma.batch.updateMany({
      where: {
        isActive: false,
        status: 'admission',
      },
      data: {
        status: 'completed',
      },
    });
  }

  async create(dto: CreateBatchDto) {
    const existing = await this.prisma.batch.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A batch with this name already exists');
    }

    const courseConnect = dto.courseIds
      ? dto.courseIds.map((id) => ({ id }))
      : [];

    return this.prisma.batch.create({
      data: {
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        thumbnail: dto.thumbnail,
        status: 'admission',
        classesPerWeek: dto.classesPerWeek ?? 3,
        isActive: true,
        courses: {
          connect: courseConnect,
        },
      },
      include: {
        courses: true,
      },
    });
  }

  async findAll() {
    return this.prisma.batch.findMany({
      include: {
        courses: true,
        enrollments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findPublic() {
    return this.prisma.batch.findMany({
      where: { isActive: true },
      include: {
        courses: {
          select: {
            id: true,
            name: true,
            originalFee: true,
            discountedFee: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async findById(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        courses: true,
        enrollments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
      },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    return batch;
  }

  async update(id: string, dto: UpdateBatchDto) {
    const batch = await this.findById(id);

    // If name is changing, check uniqueness
    if (dto.name && dto.name !== batch.name) {
      const existing = await this.prisma.batch.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('A batch with this name already exists');
      }
    }

    // Set course connections
    const dataUpdate: any = {
      name: dto.name,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      thumbnail: dto.thumbnail,
      classesPerWeek: dto.classesPerWeek !== undefined ? dto.classesPerWeek : undefined,
    };

    if (dto.status !== undefined) {
      dataUpdate.status = dto.status;
      dataUpdate.isActive = dto.status !== 'completed';
    } else if (dto.isActive !== undefined) {
      dataUpdate.isActive = dto.isActive;
      dataUpdate.status = dto.isActive ? 'classes' : 'completed';
    }

    if (dto.courseIds) {
      // Disconnect all previous courses and connect new ones
      dataUpdate.courses = {
        set: dto.courseIds.map((courseId) => ({ id: courseId })),
      };
    }

    const updatedBatch = await this.prisma.batch.update({
      where: { id },
      data: dataUpdate,
      include: { courses: true },
    });

    if (dto.name && dto.name !== batch.name) {
      await this.prisma.class.updateMany({
        where: { batchId: id },
        data: { batchName: dto.name },
      });

      await this.prisma.enrollment.updateMany({
        where: { batchId: id },
        data: { batchName: dto.name },
      });
    }

    return updatedBatch;
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.batch.delete({
      where: { id },
    });
  }
}
