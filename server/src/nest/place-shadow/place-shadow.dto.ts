import { createZodDto } from 'nestjs-zod';
import { placeShadowPickRequestSchema } from '@tripmate/shared';

/**
 * Zod-pipe wrapper for the shadow log body. Same pattern as every other write
 * endpoint: the contract lives in @tripmate/shared, the class exists so a
 * controller parameter can be typed with it.
 */
export class PlaceShadowPickDto extends createZodDto(placeShadowPickRequestSchema) {}
