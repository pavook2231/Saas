import { CurrencyCode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdatePointsConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  periodStartDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  performanceLongMinutes?: number;

  @IsOptional()
  @IsNumberString()
  performanceLongPoints?: string;

  @IsOptional()
  @IsNumberString()
  performanceShortPoints?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  rehearsalMinutesPerPoint?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  autoLockDays?: number;

  @IsOptional()
  @IsNumberString()
  pointValue?: string;

  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;
}
