const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_gTvhOPyL1zW6@ep-gentle-sea-ad1e1wy5-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });

  await client.connect();
  console.log('Connected to database. Fetching last 5 classes...');
  
  const res = await client.query('SELECT id, title, "scheduledStart", "scheduledEnd", "zoomMeetingId", "zoomPasscode", "createdAt" FROM "Class" ORDER BY "createdAt" DESC LIMIT 5');
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(console.error);
