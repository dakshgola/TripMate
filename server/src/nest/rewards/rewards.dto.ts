import { createZodDto } from 'nestjs-zod';
import { rewardRedeemRequestSchema } from '@tripmate/shared';

export class RewardRedeemDto extends createZodDto(rewardRedeemRequestSchema) {}
