import { PointsLedgerType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateManualPointsDto {
  @IsUUID('4')
  participantId!: string;

  @IsNumberString()
  points!: string;

  @IsOptional()
  @IsEnum(PointsLedgerType)
  type?: PointsLedgerType;

  @IsString()
  @Length(3, 1000)
  reason!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsUUID('4')
  eventId?: string;
}
