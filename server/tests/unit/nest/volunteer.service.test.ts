import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { VolunteerService } from '../../../src/nest/volunteer/volunteer.service';
import { createTables } from '../../../src/db/schema';
import { runSeeds } from '../../../src/db/seeds';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

describe('VolunteerService', () => {
  let dbConn: Database.Database;
  let dbService: DatabaseService;
  let service: VolunteerService;

  beforeEach(() => {
    dbConn = new Database(':memory:');
    createTables(dbConn);
    runSeeds(dbConn);
    dbService = new DatabaseService(dbConn);
    service = new VolunteerService(dbService);
  });

  describe('Opportunities retrieval & filtering', () => {
    it('retrieves all seeded volunteer opportunities with structured perks and skills', () => {
      const opps = service.getOpportunities();
      expect(opps.length).toBeGreaterThanOrEqual(7);
      expect(opps[0]).toHaveProperty('id');
      expect(opps[0]).toHaveProperty('title');
      expect(opps[0]).toHaveProperty('stipend');
      expect(Array.isArray(opps[0].perks)).toBe(true);
      expect(opps[0].perks.length).toBeGreaterThan(0);
      expect(Array.isArray(opps[0].skills)).toBe(true);
    });

    it('filters opportunities by region', () => {
      const uttarakhand = service.getOpportunities({ region: 'Uttarakhand' });
      expect(uttarakhand.length).toBeGreaterThanOrEqual(1);
      expect(uttarakhand.every((o) => o.region === 'Uttarakhand')).toBe(true);
    });

    it('filters opportunities by category', () => {
      const hostels = service.getOpportunities({ category: 'hostel' });
      expect(hostels.length).toBeGreaterThanOrEqual(1);
      expect(hostels.every((o) => o.category === 'hostel')).toBe(true);
    });

    it('filters opportunities by search query matching location, title, or skills', () => {
      const byCity = service.getOpportunities({ query: 'Rishikesh' });
      expect(byCity.length).toBeGreaterThanOrEqual(1);
      expect(byCity[0].location).toContain('Rishikesh');

      const bySkill = service.getOpportunities({ query: 'Yoga' });
      expect(bySkill.length).toBeGreaterThanOrEqual(1);
    });

    it('retrieves a single opportunity by id', () => {
      const opp = service.getOpportunity('rishikesh-content-nomad');
      expect(opp.id).toBe('rishikesh-content-nomad');
      expect(opp.hostName).toBe('Ganga Whispers Eco-Resort');
      expect(opp.verified).toBe(false);
    });

    it('throws NotFoundException for unknown opportunity id', () => {
      expect(() => service.getOpportunity('non-existent-opportunity')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('Applications persistence & validation', () => {
    it('submits a volunteer application into persistent storage with stipend snapshot & PENDING status', () => {
      const result = service.apply({
        opportunityId: 'rishikesh-content-nomad',
        applicantName: 'Daksh Gola',
        applicantEmail: 'daksh@example.com',
        applicantPhone: '+91 9876543210',
        portfolioUrl: 'https://instagram.com/dakshgola',
        applicantSkills: 'Video editing, drone photography',
        applicantDates: 'Next month',
        applicantMotivation: 'Passionate about content creation, eco-tourism, and river sports.',
      });

      expect(result.success).toBe(true);
      expect(result.applicationId).toBeGreaterThan(0);
      expect(result.status).toBe('PENDING');
      expect(result.stipendSnapshot).toContain('₹12,000');

      // Verify record exists in SQLite
      const row = dbConn
        .prepare('SELECT * FROM volunteer_applications WHERE id = ?')
        .get(result.applicationId) as Record<string, unknown>;

      expect(row).toBeDefined();
      expect(row.applicant_name).toBe('Daksh Gola');
      expect(row.applicant_email).toBe('daksh@example.com');
      expect(row.portfolio_url).toBe('https://instagram.com/dakshgola');
      expect(row.status).toBe('PENDING');
      expect(row.stipend_snapshot).toContain('₹12,000');
    });

    it('throws BadRequestException if opportunity does not exist', () => {
      expect(() =>
        service.apply({
          opportunityId: 'fake-id',
          applicantName: 'Daksh',
          applicantEmail: 'daksh@example.com',
          applicantPhone: '+91 9876543210',
          applicantMotivation: 'Eager to volunteer in remote areas.',
        }),
      ).toThrow(BadRequestException);
    });

    it('prevents duplicate active applications for the same opportunity', () => {
      service.apply({
        opportunityId: 'manali-hostel-host',
        applicantName: 'Alice',
        applicantEmail: 'alice@example.com',
        applicantPhone: '+91 9876543210',
        applicantMotivation: 'Love the mountain vibes and community hosting.',
      });

      // Second submission with same email & opportunity must fail
      expect(() =>
        service.apply({
          opportunityId: 'manali-hostel-host',
          applicantName: 'Alice',
          applicantEmail: 'alice@example.com',
          applicantPhone: '+91 9876543210',
          applicantMotivation: 'Trying to apply twice for same opportunity.',
        }),
      ).toThrow(BadRequestException);
    });

    it('allows re-application if the previous application was CANCELLED or REJECTED', () => {
      const app1 = service.apply({
        opportunityId: 'goa-sunset-yoga-wellness',
        applicantName: 'Bob',
        applicantEmail: 'bob@example.com',
        applicantPhone: '+91 9876543210',
        applicantMotivation: 'Certified yoga instructor ready to lead morning batches.',
      });

      // Cancel the first application
      service.updateStatus(app1.applicationId, 'CANCELLED', { id: 999, role: 'admin' });

      // Re-applying must succeed now
      const app2 = service.apply({
        opportunityId: 'goa-sunset-yoga-wellness',
        applicantName: 'Bob',
        applicantEmail: 'bob@example.com',
        applicantPhone: '+91 9876543210',
        applicantMotivation: 'Re-applying with updated availability dates.',
      });

      expect(app2.success).toBe(true);
      expect(app2.applicationId).toBeGreaterThan(app1.applicationId);
    });
  });

  describe('Application status transitions & access control', () => {
    it('allows admin to transition application statuses (PENDING -> ACCEPTED -> COMPLETED)', () => {
      const app = service.apply({
        opportunityId: 'kerala-organic-permaculture',
        applicantName: 'Charlie',
        applicantEmail: 'charlie@example.com',
        applicantPhone: '+91 9876543210',
        applicantMotivation: 'Permaculture enthusiast looking for organic farm experience.',
      });

      const accepted = service.updateStatus(app.applicationId, 'ACCEPTED', {
        id: 999,
        role: 'admin',
      });
      expect(accepted.status).toBe('ACCEPTED');

      const completed = service.updateStatus(app.applicationId, 'COMPLETED', {
        id: 999,
        role: 'admin',
      });
      expect(completed.status).toBe('COMPLETED');
    });

    it('allows applicant to cancel their own application', () => {
      dbConn
        .prepare(
          "INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (5, 'applicant5', 'app5@example.com', 'hash')",
        )
        .run();

      const app = service.apply(
        {
          opportunityId: 'rajasthan-haveli-music-events',
          applicantName: 'Dave',
          applicantEmail: 'app5@example.com',
          applicantPhone: '+91 9876543210',
          applicantMotivation: 'Acoustic guitarist passionate about Rajasthani folk music.',
        },
        5,
      );

      const res = service.updateStatus(app.applicationId, 'CANCELLED', { id: 5, role: 'user' });
      expect(res.status).toBe('CANCELLED');
    });

    it('forbids a regular user from accepting their own application or touching others', () => {
      dbConn
        .prepare(
          "INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (6, 'applicant6', 'app6@example.com', 'hash')",
        )
        .run();

      const app = service.apply(
        {
          opportunityId: 'rajasthan-haveli-music-events',
          applicantName: 'Eve',
          applicantEmail: 'app6@example.com',
          applicantPhone: '+91 9876543210',
          applicantMotivation: 'Passionate about cultural heritage and management.',
        },
        6,
      );

      // Applicant cannot accept their own application
      expect(() =>
        service.updateStatus(app.applicationId, 'ACCEPTED', { id: 6, role: 'user' }),
      ).toThrow(BadRequestException);

      // Another user cannot touch Eve's application
      expect(() =>
        service.updateStatus(app.applicationId, 'CANCELLED', { id: 7, role: 'user' }),
      ).toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when an unauthenticated actor attempts to change status', () => {
      const app = service.apply({
        opportunityId: 'kerala-organic-permaculture',
        applicantName: 'Guest Tester',
        applicantEmail: 'guest@example.com',
        applicantPhone: '+91 9876543210',
        applicantMotivation: 'Permaculture enthusiast.',
      });

      expect(() =>
        service.updateStatus(app.applicationId, 'CANCELLED'),
      ).toThrow(UnauthorizedException);
    });

    it('retrieves applied opportunity IDs only for authenticated user and ignores cancelled', () => {
      dbConn
        .prepare(
          "INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (10, 'user10', 'user10@example.com', 'hash')",
        )
        .run();

      service.apply(
        {
          opportunityId: 'kerala-organic-permaculture',
          applicantName: 'User 10',
          applicantEmail: 'user10@example.com',
          applicantPhone: '+91 9876543210',
          applicantMotivation: 'Permaculture enthusiast.',
        },
        10,
      );

      const mine = service.getMyApplications(10);
      expect(mine).toContain('kerala-organic-permaculture');

      const unauthenticated = service.getMyApplications(undefined);
      expect(unauthenticated).toEqual([]);
    });
  });

  describe('Favourites persistence', () => {
    it('toggles favorites for a user in persistent storage and prevents duplicates', () => {
      const userId = 1;
      dbConn
        .prepare(
          "INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (1, 'user1', 'user1@example.com', 'hash')",
        )
        .run();

      const addFav = service.toggleFavorite(userId, 'manali-hostel-host');
      expect(addFav.isFavorite).toBe(true);

      let favs = service.getFavorites(userId);
      expect(favs).toContain('manali-hostel-host');

      // Toggling again removes the favorite
      const removeFav = service.toggleFavorite(userId, 'manali-hostel-host');
      expect(removeFav.isFavorite).toBe(false);

      favs = service.getFavorites(userId);
      expect(favs).not.toContain('manali-hostel-host');
    });

    it('throws BadRequestException when unauthenticated user toggles backend favorites', () => {
      expect(() => service.toggleFavorite(0, 'manali-hostel-host')).toThrow(BadRequestException);
    });
  });
});
