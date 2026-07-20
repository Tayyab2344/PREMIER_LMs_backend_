import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';

@Controller('users')
@UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
@Roles('admin')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Query('role') role?: string) {
    return this.userService.findAll(role);
  }

  @Get('count/students')
  getStudentCount() {
    return this.userService.getStudentCount();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.userService.toggleActive(id);
  }

  @Post('student')
  createStudent(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password?: string,
    @Body('courseId') courseId?: string,
    @Body('batchId') batchId?: string,
  ) {
    return this.userService.createStudent({ name, email, password, courseId, batchId });
  }
}
