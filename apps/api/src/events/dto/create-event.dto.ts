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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { EventChecklistItemInputDto } from './event-checklist-item-input.dto';
import { EventParticipantInputDto } from './event-participant-input.dto';

export class CreateEventDto {
  @IsString()
  @Length(2, 200)
  title!: string;

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

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsDateString()
  assemblyAt?: string;

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
  templateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  performanceCastNumber?: number;

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
