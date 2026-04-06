import {
  EventAttendanceStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class EventParticipantInputDto {
  @IsUUID('4')
  participantId!: string;

  @IsOptional()
  @IsUUID('4')
  templateRoleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleName?: string;

  @IsOptional()
  @IsEnum(EventAttendanceStatus)
  attendanceStatus?: EventAttendanceStatus;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
