import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SingleSessionGuard } from '../../common/guards/single-session.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IapService } from './iap.service';
import { VerifyAppleIapDto } from './dto/verify-apple.dto';

@Controller('iap')
@UseGuards(AuthGuard('jwt'), SingleSessionGuard)
export class IapController {
  constructor(private readonly iapService: IapService) {}

  @Post('verify-apple')
  @HttpCode(HttpStatus.OK)
  async verifyApple(
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyAppleIapDto,
  ) {
    return this.iapService.verifyApplePurchase(userId, dto);
  }
}

