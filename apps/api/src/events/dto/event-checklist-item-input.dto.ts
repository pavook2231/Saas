import { IsBoolean, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

export class EventChecklistItemInputDto {
  @IsString()
  @Length(1, 160)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
