const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const targetCourseName = 'Mastering Income Tax Ordinances 2001';
  const appleProductId = 'com.premiertaxschool.course.income_tax';

  console.log(`Searching for course: "${targetCourseName}"...`);
  let course = await prisma.course.findFirst({
    where: {
      name: {
        contains: 'Mastering Income Tax Ordinances 2001',
        mode: 'insensitive',
      },
    },
  });

  if (!course) {
    const all = await prisma.course.findMany({
      select: { id: true, name: true, appleProductId: true },
    });
    if (all.length > 0) {
      course = all[0];
    }
  }

  if (!course) {
    console.error('No course found in database.');
    return;
  }

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: { appleProductId },
  });

  const record = {
    id: updated.id,
    title: updated.name,
    slug: updated.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    appleProductId: updated.appleProductId,
  };

  console.log('\n--- UPDATED COURSE RECORD ---');
  console.log(JSON.stringify(record, null, 2));
}

main()
  .catch((e) => {
    console.error('Error running script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

