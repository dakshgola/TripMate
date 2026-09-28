import { createZodDto } from 'nestjs-zod';
import { mapsPlaceEnrichmentRequestSchema } from '@tripmate/shared';

/**
 * Server-side createZodDto wrapper over the @tripmate/shared enrichment contract.
 * The global ZodValidationPipe validates the body by metatype — the Zod schema
 * in shared/ stays the single source of truth for the wire contract.
 */
export class PlaceEnrichmentDto extends createZodDto(mapsPlaceEnrichmentRequestSchema) {}
