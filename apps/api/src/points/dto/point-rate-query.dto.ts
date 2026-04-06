import { IsDateString, IsOptional } from 'class-validator';

export class PointRateQueryDto {
  @IsOptional()
  @IsDateString()
  referenceDate?: string;
}
