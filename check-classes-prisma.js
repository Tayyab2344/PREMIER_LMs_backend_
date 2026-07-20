const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_gTvhOPyL1zW6@ep-gentle-sea-ad1e1wy5-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&connection_limit=1"
    }
  }
});

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
