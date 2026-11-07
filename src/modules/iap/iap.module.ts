import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IapController } from './iap.controller';
import { IapService } from './iap.service';

@Module({
  imports: [PrismaModule],
  controllers: [IapController],
  providers: [IapService],
  exports: [IapService],
})
export class IapModule {}

