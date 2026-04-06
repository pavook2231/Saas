import { IsString, Length } from 'class-validator';

export class DeleteManualPointsDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}
