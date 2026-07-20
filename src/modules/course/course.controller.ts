import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CourseService } from './course.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';

@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  // Public — used by admission form
  @Get()
  findAllActive() {
    return this.courseService.findAllActive();
  }

  // Admin only — includes inactive
  @Get('all')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findAll() {
    return this.courseService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.courseService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.courseService.softDelete(id);
  }

  @Get(':id/students')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findStudentsByCourse(@Param('id') id: string) {
    return this.courseService.findStudentsByCourse(id);
  }
}
