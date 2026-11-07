import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VerifyAppleIapDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsString()
  @IsNotEmpty()
  receiptData: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}

