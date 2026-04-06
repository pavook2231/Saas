import { PointsLedgerType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateManualPointsDto {
  @IsOptional()
  @IsNumberString()
  points?: string;

  @IsOptional()
  @IsEnum(PointsLedgerType)
  type?: PointsLedgerType;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}
