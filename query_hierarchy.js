const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.batch.findMany({
    include: {
      courses: {
        select: {
          id: true,
          name: true,
        },
      },
      enrollments: {
        select: {
          id: true,
        },
      },
      admissions: {
        select: {
          id: true,
        },
      },
      classes: {
        orderBy: { scheduledStart: 'asc' },
      },
    },
    orderBy: { startDate: 'desc' },
  });

  const hierarchy = batches.map((batch) => {
    // Group classes of this batch by course name
    const courseClassesMap = {};
    batch.courses.forEach((course) => {
      courseClassesMap[course.name] = [];
    });

    batch.classes.forEach((cls) => {
      if (courseClassesMap[cls.courseName]) {
        courseClassesMap[cls.courseName].push(cls);
      } else {
        courseClassesMap[cls.courseName] = [cls];
      }
    });

    return {
      id: batch.id,
      name: batch.name,
      courses: batch.courses.map((course) => ({
        id: course.id,
        name: course.name,
        classes: courseClassesMap[course.name] || [],
      })),
      classesFromBatchRelation: batch.classes,
    };
  });

  console.log('Hierarchy response:', JSON.stringify(hierarchy, null, 2));
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
