const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Querying latest classes...');
  const classes = await prisma.class.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      scheduledStart: true,
      scheduledEnd: true,
      zoomMeetingId: true,
      zoomPasscode: true,
      createdAt: true
    }
  });
  console.log(JSON.stringify(classes, null, 2));
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
