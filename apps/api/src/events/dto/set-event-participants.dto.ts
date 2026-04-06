import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, ValidateNested } from 'class-validator';

import { EventParticipantInputDto } from './event-participant-input.dto';

export class SetEventParticipantsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => EventParticipantInputDto)
  participants!: EventParticipantInputDto[];

  @IsOptional()
  @IsBoolean()
  ignoreConflicts?: boolean;
}
