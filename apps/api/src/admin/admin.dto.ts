import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs for the admin write routes.
 *
 * A global ValidationPipe ({ whitelist, forbidNonWhitelisted, transform }) uses
 * these to (a) strip/reject any property that isn't declared here — closing the
 * "extra keys land in the JSON store" gap — and (b) normalise the `x | x[]`
 * shapes the panel sends into arrays.
 *
 * Normalisation deliberately leaves an absent field `undefined` rather than
 * defaulting to `[]`: several handlers branch on truthiness (e.g. publish's
 * "nothing to publish" guard), and an empty array is truthy.
 */
const toArray = <T>(value: T | T[] | undefined): T[] | undefined => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
};

class ScheduledItemDto {
  @IsString()
  file!: string;

  // ISO-8601 instant. Kept as a string here; AdminService already rejects
  // unparseable dates, and storing the raw string is what scheduled.json holds.
  @IsString()
  time!: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  // Required: playback is YouTube-backed now, so a scheduled track needs its
  // link just as much as an instantly-published one does. Semantic validation
  // (does it actually parse to a video id) happens in AdminService via
  // isValidYoutubeUrl — this DTO only enforces "a string was sent".
  @IsString()
  youtubeUrl!: string;
}

/** One file + the YouTube link it plays through. 1:1, unlike category (which
 * is legitimately shared across a whole publish batch) — every file in a
 * publish call carries its own link. */
class PublishFileDto {
  @IsString()
  file!: string;

  @IsString()
  youtubeUrl!: string;
}

export class PublishDto {
  @IsOptional()
  @Transform(({ value }) => toArray<unknown>(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublishFileDto)
  files?: PublishFileDto[];

  @IsOptional()
  @Transform(({ value }) => toArray<unknown>(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduledItemDto)
  scheduled?: ScheduledItemDto[];

  @IsOptional()
  @IsString()
  category?: string | null;
}

export class DeleteDto {
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  filesToDelete?: string[];
}

export class ScheduledDeleteDto {
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  scheduledToDelete?: string[];
}

export class CancelPeaksDto {
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}

export class CreateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class RenameCategoryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class DeleteCategoriesDto {
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

export class AssignCategoryDto {
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  files?: string[];

  @IsOptional()
  @IsString()
  category?: string | null;
}

export class ReorderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}

export class UpdateYoutubeUrlDto {
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  files?: string[];

  @IsOptional()
  @IsString()
  youtubeUrl?: string;
}
