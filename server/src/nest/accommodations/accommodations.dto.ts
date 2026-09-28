import { createZodDto } from 'nestjs-zod';
import { accommodationCreateBodySchema, accommodationUpdateRequestSchema } from '@tripmate/shared';

export class AccommodationCreateDto extends createZodDto(accommodationCreateBodySchema) {}
export class AccommodationUpdateDto extends createZodDto(accommodationUpdateRequestSchema) {}
