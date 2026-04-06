import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListManualPointsQueryDto {
  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @IsUUID('4')
  participantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
