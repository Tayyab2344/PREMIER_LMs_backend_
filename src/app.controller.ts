import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      status: 'success',
      message: 'Premier LMS API is running successfully. Direct API queries to /api',
      timestamp: new Date().toISOString(),
    };
  }
}
