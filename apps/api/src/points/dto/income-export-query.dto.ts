import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum IncomeExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class IncomeExportQueryDto {
  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @IsUUID('4')
  participantId?: string;

  @IsOptional()
  @IsEnum(IncomeExportFormat)
  format?: IncomeExportFormat;
}
