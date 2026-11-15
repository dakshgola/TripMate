import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ApplyVolunteerDto,
  FilterOpportunitiesDto,
  VolunteerApplicationStatus,
} from './volunteer.dto';

interface RawOpportunityRow {
  id: string;
  title: string;
  host_name: string;
  location: string;
  state: string;
  region: string;
  category: string;
  duration: string;
  stipend: string;
  perks: string;
  skills: string;
  hours_per_day: string;
  min_commitment: string;
  spots_left: number;
  rating: number;
  review_count: number;
  image_url: string;
  description: string;
  responsibilities: string;
  what_you_get: string;
  verified: number;
  created_at: string;
}

export interface VolunteerOpportunity {
  id: string;
  title: string;
  hostName: string;
  location: string;
  state: string;
  region: string;
  category: string;
  duration: string;
  stipend: string;
  perks: string[];
  skills: string[];
  hoursPerDay: string;
  minCommitment: string;
  spotsLeft: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  description: string;
  responsibilities: string[];
  whatYouGet: string[];
  verified: boolean;
}

export interface VolunteerApplicationRecord {
  id: number;
  opportunityId: string;
  userId: number | null;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  portfolioUrl?: string;
  applicantSkills?: string;
  applicantDates?: string;
  applicantMotivation: string;
  stipendSnapshot: string;
  status: VolunteerApplicationStatus;
  createdAt: string;
}

@Injectable()
export class VolunteerService {
  constructor(private readonly db: DatabaseService) {}

  private mapRow(row: RawOpportunityRow): VolunteerOpportunity {
    const parseJson = (val: string, fallback: string[] = []): string[] => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : fallback;
      } catch {
        return fallback;
      }
    };

    return {
      id: row.id,
      title: row.title,
      hostName: row.host_name,
      location: row.location,
      state: row.state,
      region: row.region,
      category: row.category,
      duration: row.duration,
      stipend: row.stipend,
      perks: parseJson(row.perks),
      skills: parseJson(row.skills),
      hoursPerDay: row.hours_per_day,
      minCommitment: row.min_commitment,
      spotsLeft: row.spots_left,
      rating: row.rating,
      reviewCount: row.review_count,
      imageUrl: row.image_url,
      description: row.description,
      responsibilities: parseJson(row.responsibilities),
      whatYouGet: parseJson(row.what_you_get),
      verified: Boolean(row.verified),
    };
  }

  getOpportunities(filters?: FilterOpportunitiesDto): VolunteerOpportunity[] {
    let sql = 'SELECT * FROM volunteer_opportunities WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.region && filters.region !== 'all') {
      sql += ' AND region = ?';
      params.push(filters.region);
    }

    if (filters?.category && filters.category !== 'all') {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters?.query && filters.query.trim()) {
      const q = `%${filters.query.trim()}%`;
      sql += ' AND (title LIKE ? OR location LIKE ? OR host_name LIKE ? OR skills LIKE ?)';
      params.push(q, q, q, q);
    }

    sql += ' ORDER BY rating DESC, created_at DESC';

    const rows = this.db.all<RawOpportunityRow>(sql, ...params);
    return rows.map((r) => this.mapRow(r));
  }

  getOpportunity(id: string): VolunteerOpportunity {
    const row = this.db.get<RawOpportunityRow>(
      'SELECT * FROM volunteer_opportunities WHERE id = ?',
      id,
    );
    if (!row) {
      throw new NotFoundException(`Volunteer opportunity '${id}' not found`);
    }
    return this.mapRow(row);
  }

  apply(
    dto: ApplyVolunteerDto,
    userId?: number,
  ): {
    success: boolean;
    applicationId: number;
    status: VolunteerApplicationStatus;
    stipendSnapshot: string;
    message: string;
  } {
    const opp = this.db.get<{ id: string; title: string; stipend: string }>(
      'SELECT id, title, stipend FROM volunteer_opportunities WHERE id = ?',
      dto.opportunityId,
    );
    if (!opp) {
      throw new BadRequestException(`Opportunity '${dto.opportunityId}' does not exist.`);
    }

    // Prevent duplicate active applications (PENDING or ACCEPTED)
    const existing = this.db.get<{ id: number; status: string }>(
      `SELECT id, status FROM volunteer_applications
       WHERE opportunity_id = ?
         AND (
           (? IS NOT NULL AND user_id = ?)
           OR applicant_email = ?
         )
         AND status IN ('PENDING', 'ACCEPTED')`,
      dto.opportunityId,
      userId ?? null,
      userId ?? null,
      dto.applicantEmail.trim(),
    );

    if (existing) {
      throw new BadRequestException(
        `You already have an active application (${existing.status}) for this opportunity.`,
      );
    }

    const stipendSnapshot = opp.stipend || 'Unspecified';
    const initialStatus: VolunteerApplicationStatus = 'PENDING';

    const res = this.db.run(
      `INSERT INTO volunteer_applications (
        opportunity_id, user_id, applicant_name, applicant_email, applicant_phone,
        portfolio_url, applicant_skills, applicant_dates, applicant_motivation,
        stipend_snapshot, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      dto.opportunityId,
      userId || null,
      dto.applicantName.trim(),
      dto.applicantEmail.trim(),
      dto.applicantPhone.trim(),
      dto.portfolioUrl?.trim() || null,
      dto.applicantSkills?.trim() || null,
      dto.applicantDates?.trim() || null,
      dto.applicantMotivation.trim(),
      stipendSnapshot,
      initialStatus,
    );

    return {
      success: true,
      applicationId: Number(res.lastInsertRowid),
      status: initialStatus,
      stipendSnapshot,
      message: `Application submitted successfully for ${opp.title}`,
    };
  }

  updateStatus(
    applicationId: number,
    newStatus: VolunteerApplicationStatus,
    actorUser?: { id: number; role?: string },
  ): { success: boolean; applicationId: number; status: VolunteerApplicationStatus } {
    const app = this.db.get<{ id: number; user_id: number | null; status: string }>(
      'SELECT id, user_id, status FROM volunteer_applications WHERE id = ?',
      applicationId,
    );
    if (!app) {
      throw new NotFoundException(`Application #${applicationId} not found.`);
    }

    // Access control: non-admin can only CANCEL their own application
    if (actorUser) {
      const isAdmin = actorUser.role === 'admin';
      const isOwner = app.user_id !== null && app.user_id === actorUser.id;

      if (!isAdmin) {
        if (!isOwner) {
          throw new ForbiddenException('You do not have permission to modify this application.');
        }
        if (newStatus !== 'CANCELLED') {
          throw new BadRequestException('Applicants can only cancel their pending application.');
        }
      }
    }

    this.db.run(
      'UPDATE volunteer_applications SET status = ? WHERE id = ?',
      newStatus,
      applicationId,
    );

    return {
      success: true,
      applicationId,
      status: newStatus,
    };
  }

  getMyApplications(userId?: number, email?: string): string[] {
    if (!userId && !email) return [];
    let rows: Array<{ opportunity_id: string }> = [];

    if (userId) {
      rows = this.db.all<{ opportunity_id: string }>(
        "SELECT DISTINCT opportunity_id FROM volunteer_applications WHERE user_id = ? AND status != 'CANCELLED'",
        userId,
      );
    } else if (email) {
      rows = this.db.all<{ opportunity_id: string }>(
        "SELECT DISTINCT opportunity_id FROM volunteer_applications WHERE applicant_email = ? AND status != 'CANCELLED'",
        email,
      );
    }

    return rows.map((r) => r.opportunity_id);
  }

  getFavorites(userId: number): string[] {
    if (!userId) return [];
    const rows = this.db.all<{ opportunity_id: string }>(
      'SELECT opportunity_id FROM volunteer_favorites WHERE user_id = ?',
      userId,
    );
    return rows.map((r) => r.opportunity_id);
  }

  toggleFavorite(userId: number, opportunityId: string): { isFavorite: boolean } {
    if (!userId) {
      throw new BadRequestException('User must be signed in to save favorites.');
    }

    const existing = this.db.get<{ id: number }>(
      'SELECT id FROM volunteer_favorites WHERE user_id = ? AND opportunity_id = ?',
      userId,
      opportunityId,
    );

    if (existing) {
      this.db.run(
        'DELETE FROM volunteer_favorites WHERE user_id = ? AND opportunity_id = ?',
        userId,
        opportunityId,
      );
      return { isFavorite: false };
    } else {
      this.db.run(
        'INSERT OR IGNORE INTO volunteer_favorites (user_id, opportunity_id) VALUES (?, ?)',
        userId,
        opportunityId,
      );
      return { isFavorite: true };
    }
  }
}
