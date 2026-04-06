import { CurrencyCode } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
} from 'class-validator';

export class SetPointRateDto {
  @IsNumberString()
  pointValue!: string;

  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
