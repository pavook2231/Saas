import { EventStatus, EventType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { EventChecklistItemInputDto } from './event-checklist-item-input.dto';
import { EventParticipantInputDto } from './event-participant-input.dto';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  assemblyAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsUUID('4')
  templateId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  performanceCastNumber?: number | null;

  @IsOptional()
  @IsBoolean()
  useAutomaticPerformanceCast?: boolean;

  @IsOptional()
  @IsBoolean()
  ignoreConflicts?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => EventParticipantInputDto)
  participants?: EventParticipantInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EventChecklistItemInputDto)
  checklistItems?: EventChecklistItemInputDto[];
}
