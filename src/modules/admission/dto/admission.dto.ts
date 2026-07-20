import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateAdmissionDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsString()
  @IsNotEmpty()
  cnic: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty()
  gender: string;

  @IsString()
  @IsNotEmpty()
  whatsapp: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  postalAddress: string;

  @IsOptional()
  @IsString()
  lastQualification?: string;

  @IsOptional()
  @IsString()
  passingYear?: string;

  @IsOptional()
  @IsString()
  institute?: string;

  @IsOptional()
  @IsString()
  emergencyName?: string;

  @IsOptional()
  @IsString()
  emergencyRelation?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  cnicFile?: string;

  @IsOptional()
  @IsString()
  photoFile?: string;

  @IsOptional()
  @IsString()
  paymentProof?: string;

  @IsArray()
  @IsString({ each: true })
  selectedCourses: string[];

  @IsInt()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}

export class UpdateAdmissionStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string; // 'approved' | 'rejected'

  @IsOptional()
  @IsString()
  remarks?: string;
}
