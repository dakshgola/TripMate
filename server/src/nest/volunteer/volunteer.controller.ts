import { Controller, Get, Post, Patch, Body, Query, Param } from '@nestjs/common';
import { OptionalAuth } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '../../types';
import { VolunteerService } from './volunteer.service';
import {
  ApplyVolunteerDto,
  FilterOpportunitiesDto,
  UpdateApplicationStatusDto,
} from './volunteer.dto';

@OptionalAuth('Volunteer Yatra opportunities and applications endpoints')
@Controller('api/volunteer')
export class VolunteerController {
  constructor(private readonly volunteerService: VolunteerService) {}

  @Get('opportunities')
  getOpportunities(@Query() query: FilterOpportunitiesDto) {
    return this.volunteerService.getOpportunities(query);
  }

  @Get('opportunities/:id')
  getOpportunity(@Param('id') id: string) {
    return this.volunteerService.getOpportunity(id);
  }

  @Post('applications')
  apply(
    @Body() dto: ApplyVolunteerDto,
    @CurrentUser() user?: User,
  ) {
    return this.volunteerService.apply(dto, user?.id);
  }

  @Patch('applications/:id/status')
  updateApplicationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() user?: User,
  ) {
    return this.volunteerService.updateStatus(
      Number(id),
      dto.status,
      user ? { id: user.id, role: user.role } : undefined,
    );
  }

  @Get('applications/mine')
  getMyApplications(@CurrentUser() user?: User) {
    return this.volunteerService.getMyApplications(user?.id);
  }

  @Get('favorites')
  getFavorites(@CurrentUser() user?: User) {
    if (!user) return [];
    return this.volunteerService.getFavorites(user.id);
  }

  @Post('favorites/:id')
  toggleFavorite(
    @Param('id') id: string,
    @CurrentUser() user?: User,
  ) {
    if (!user) {
      return { isFavorite: false, guest: true };
    }
    return this.volunteerService.toggleFavorite(user.id, id);
  }
}
