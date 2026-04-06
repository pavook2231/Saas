import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CheckEventConflictsDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  participantIds!: string[];

  @IsOptional()
  @IsUUID('4')
  excludeEventId?: string;
}
