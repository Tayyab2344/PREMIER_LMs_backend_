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
import { BatchService } from './batch.service';
import { CreateBatchDto, UpdateBatchDto } from './dto/batch.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';

@Controller('batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateBatchDto) {
    return this.batchService.create(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  findAll() {
    return this.batchService.findAll();
  }

  @Get('public')
  findPublic() {
    return this.batchService.findPublic();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard)
  findOne(@Param('id') id: string) {
    return this.batchService.findById(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.batchService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), SingleSessionGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.batchService.remove(id);
  }
}
