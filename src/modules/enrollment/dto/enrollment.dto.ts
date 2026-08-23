import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdateEnrollmentBatchDto {
  @IsString()
  @IsNotEmpty()
  batchName: string;
}

export class GrantRevisionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;
}
