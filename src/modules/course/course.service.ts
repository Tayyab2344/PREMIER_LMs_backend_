import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllActive() {
    return this.prisma.course.findMany({
      where: { isActive: true },
      include: {
        modules: {
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        reviews: {
          orderBy: { createdAt: 'desc' }
        },
        batches: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.course.findMany({
      include: {
        modules: {
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        reviews: {
          orderBy: { createdAt: 'desc' }
        },
        batches: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        reviews: {
          orderBy: { createdAt: 'desc' }
        },
        batches: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          }
        }
      }
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  async create(dto: CreateCourseDto) {
    const existing = await this.prisma.course.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A course with this name already exists');
    }

    const { modules, reviews, ...fields } = dto;

    return this.prisma.course.create({
      data: {
        ...fields,
        originalFee: dto.originalFee ?? 50000,
        discountedFee: dto.discountedFee ?? 30000,
        modules: modules ? {
          create: modules.map((m, mIdx) => ({
            title: m.title,
            sortOrder: m.sortOrder ?? mIdx,
            lessons: {
              create: m.lessons.map((l, lIdx) => ({
                title: l.title,
                duration: l.duration,
                isPreview: l.isPreview ?? false,
                sortOrder: l.sortOrder ?? lIdx,
              }))
            }
          }))
        } : undefined,
        reviews: reviews ? {
          create: reviews.map((r) => ({
            name: r.name,
            rating: r.rating,
            content: r.content,
            date: r.date,
          }))
        } : undefined,
      },
      include: {
        modules: {
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        reviews: true,
      }
    });
  }

  async update(id: string, dto: UpdateCourseDto) {
    await this.findById(id);

    if (dto.name) {
      const existing = await this.prisma.course.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('A course with this name already exists');
      }
    }

    const { modules, reviews, ...fields } = dto;

    // Update main fields
    await this.prisma.course.update({
      where: { id },
      data: fields,
    });

    // Update modules if provided
    if (modules !== undefined) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Cascade delete existing modules and lessons
        await tx.courseModule.deleteMany({
          where: { courseId: id },
        });

        // Recreate new modules and lessons
        if (modules && modules.length > 0) {
          for (let mIdx = 0; mIdx < modules.length; mIdx++) {
            const m = modules[mIdx];
            await tx.courseModule.create({
              data: {
                courseId: id,
                title: m.title,
                sortOrder: m.sortOrder ?? mIdx,
                lessons: {
                  create: m.lessons.map((l, lIdx) => ({
                    title: l.title,
                    duration: l.duration,
                    isPreview: l.isPreview ?? false,
                    sortOrder: l.sortOrder ?? lIdx,
                  }))
                }
              }
            });
          }
        }
      });
    }

    // Update reviews if provided
    if (reviews !== undefined) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Delete existing reviews
        await tx.courseReview.deleteMany({
          where: { courseId: id },
        });

        // Recreate new reviews
        if (reviews && reviews.length > 0) {
          for (const r of reviews) {
            await tx.courseReview.create({
              data: {
                courseId: id,
                name: r.name,
                rating: r.rating,
                content: r.content,
                date: r.date,
              }
            });
          }
        }
      });
    }

    return this.findById(id);
  }

  async findStudentsByCourse(courseId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            admissions: {
              where: { status: 'approved' },
              select: {
                whatsapp: true,
                cnic: true,
                fatherName: true,
                dateOfBirth: true,
                postalAddress: true,
                gender: true,
                lastQualification: true,
                passingYear: true,
                institute: true,
              },
            },
          },
        },
      },
    });

    return enrollments.map((e: any) => ({
      enrollmentId: e.id,
      startDate: e.startDate,
      endDate: e.endDate,
      batchName: e.batchName,
      studentId: e.user.id,
      name: e.user.name,
      email: e.user.email,
      isActive: e.user.isActive,
      whatsapp: e.user.admissions[0]?.whatsapp || '',
      cnic: e.user.admissions[0]?.cnic || '',
      fatherName: e.user.admissions[0]?.fatherName || '',
      dateOfBirth: e.user.admissions[0]?.dateOfBirth || null,
      postalAddress: e.user.admissions[0]?.postalAddress || '',
      gender: e.user.admissions[0]?.gender || '',
      lastQualification: e.user.admissions[0]?.lastQualification || '',
      passingYear: e.user.admissions[0]?.passingYear || '',
      institute: e.user.admissions[0]?.institute || '',
    }));
  }

  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.course.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
