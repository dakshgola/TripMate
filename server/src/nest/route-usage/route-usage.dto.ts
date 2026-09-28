import { createZodDto } from 'nestjs-zod';
import { routeUsageReportRequestSchema } from '@tripmate/shared';

/**
 * Zod-pipe wrapper for a batch of counters. Same pattern as every other write
 * endpoint: the contract lives in @tripmate/shared, the class exists so a controller
 * parameter can be typed with it.
 */
export class RouteUsageReportDto extends createZodDto(routeUsageReportRequestSchema) {}
