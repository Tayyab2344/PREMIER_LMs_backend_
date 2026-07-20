import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AdmissionService } from './admission.service';
import { CreateAdmissionDto, UpdateAdmissionStatusDto } from './dto/admission.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';

@Controller('admissions')
export class AdmissionController {
  constructor(private readonly admissionService: AdmissionService) {}

  // Public — submit application
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 3, ttl: 60000 } }) // 3 submissions per minute
  create(@Body() dto: CreateAdmissionDto) {
    return this.admissionService.create(dto);
  }

  // Admin — list all applications
  @Get()
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findAll(@Query('status') status?: string) {
    return this.admissionService.findAll(status);
  }

  // Admin — get stats
  @Get('stats')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  getStats() {
    return this.admissionService.getStats();
  }

  // Admin — single application detail
  @Get(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findById(@Param('id') id: string) {
    return this.admissionService.findById(id);
  }

  // Admin — approve/reject application
  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAdmissionStatusDto) {
    return this.admissionService.updateStatus(id, dto);
  }
}
