import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  batchName: string;

  @IsString()
  @IsNotEmpty()
  courseName: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  @IsOptional()
  @IsBoolean()
  allowStudentScreenshare?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentMic?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentCamera?: boolean;

  @IsOptional()
  @IsString()
  zoomMeetingId?: string;

  @IsOptional()
  @IsString()
  zoomPasscode?: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsString()
  status?: string; // 'scheduled' | 'live' | 'completed'

  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @IsOptional()
  @IsBoolean()
  recordingLive?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentScreenshare?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentMic?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentCamera?: boolean;

  @IsOptional()
  @IsString()
  zoomMeetingId?: string;

  @IsOptional()
  @IsString()
  zoomPasscode?: string;
}

export class CreateRecordedLectureDto {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  classNo?: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  recordingUrl: string;

  @IsInt()
  @Min(0)
  duration: number;

  @IsOptional()
  @IsBoolean()
  recordingLive?: boolean;
}

export class UpdateRecordedLectureDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  classNo?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsBoolean()
  recordingLive?: boolean;
}
