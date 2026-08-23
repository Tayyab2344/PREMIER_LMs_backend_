import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZoomService } from './modules/class/zoom.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const zoomService = app.get(ZoomService);

  const token = await zoomService.getAccessToken();
  if (!token) {
    console.error('Failed to get access token');
    return;
  }

  // List active meetings for the teacher
  const teacherEmail = process.env.ZOOM_TEACHER_EMAIL;
  if (!teacherEmail) {
    console.error('ZOOM_TEACHER_EMAIL environment variable is required.');
    return;
  }
  console.log(`Checking meetings for ${teacherEmail}...`);

  const response = await fetch(
    `https://api.zoom.us/v2/users/${encodeURIComponent(teacherEmail)}/meetings?type=live`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to list meetings: ${await response.text()}`);
    return;
  }

  const data = await response.json();
  const meetings = data.meetings || [];
  console.log(`Found ${meetings.length} live meetings:`);
  console.log(JSON.stringify(meetings, null, 2));

  // End all active meetings
  for (const meeting of meetings) {
    console.log(`Ending meeting ${meeting.id} (${meeting.topic})...`);
    await zoomService.endZoomMeeting(String(meeting.id));
  }

  await app.close();
}

main().catch(console.error);
