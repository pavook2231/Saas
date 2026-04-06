import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class PointsPeriodQueryDto {
  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @IsUUID('4')
  participantId?: string;
}
