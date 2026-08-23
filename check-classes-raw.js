const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
  });

  await client.connect();
  console.log('Connected to database. Fetching last 5 classes...');
  
  const res = await client.query('SELECT id, title, "scheduledStart", "scheduledEnd", "zoomMeetingId", "zoomPasscode", "createdAt" FROM "Class" ORDER BY "createdAt" DESC LIMIT 5');
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(console.error);

