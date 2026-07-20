import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EnrollmentService } from './enrollment.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';

@Controller('enrollments')
@UseGuards(AuthGuard('jwt'), SingleSessionGuard)
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  // Student — get own enrollments
  @Get('my')
  findMyEnrollments(@CurrentUser('sub') userId: string) {
    return this.enrollmentService.findByUser(userId);
  }

  // Admin — get all enrollments
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  findAll() {
    return this.enrollmentService.findAll();
  }

  // Admin — assign batch to enrollment
  @Patch(':id/batch')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateBatch(@Param('id') id: string, @Body('batchName') batchName: string) {
    return this.enrollmentService.updateBatch(id, batchName);
  }
}
