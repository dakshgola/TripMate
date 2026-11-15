import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const volunteerStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
]);

export type VolunteerApplicationStatus = z.infer<typeof volunteerStatusEnum>;

export const applyVolunteerSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  applicantName: z.string().trim().min(2, 'Name must be at least 2 characters'),
  applicantEmail: z.string().trim().email('Please enter a valid email address'),
  applicantPhone: z.string().trim().min(10, 'Phone must be at least 10 characters'),
  portfolioUrl: z.string().trim().url('Please enter a valid URL').optional().or(z.literal('')),
  applicantSkills: z.string().optional().default(''),
  applicantDates: z.string().optional().default(''),
  applicantMotivation: z.string().trim().min(10, 'Motivation must be at least 10 characters'),
});

export class ApplyVolunteerDto extends createZodDto(applyVolunteerSchema) {}

export const filterOpportunitiesSchema = z.object({
  region: z.string().optional(),
  category: z.string().optional(),
  query: z.string().optional(),
});

export class FilterOpportunitiesDto extends createZodDto(filterOpportunitiesSchema) {}

export const updateApplicationStatusSchema = z.object({
  status: volunteerStatusEnum,
});

export class UpdateApplicationStatusDto extends createZodDto(updateApplicationStatusSchema) {}
