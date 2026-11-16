/**
 * Multi-user authentication, registration, admin recovery, and account isolation tests.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';

process.env.ADMIN_RECOVERY_SECRET = 'super-secret-recovery-token-xyz789';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: (placeId: number) => {
      const place: any = db.prepare(`
        SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM places p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?
      `).get(placeId);
      if (!place) return null;
      const tags = db.prepare(`SELECT t.* FROM tags t JOIN place_tags pt ON t.id = pt.tag_id WHERE pt.place_id = ?`).all(placeId);
      return { ...place, category: place.category_id ? { id: place.category_id, name: place.category_name, color: place.category_color, icon: place.category_icon } : null, tags };
    },
    canAccessTrip: (tripId: any, userId: number) =>
      db.prepare(`SELECT t.id, t.user_id FROM trips t LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)`).get(userId, tripId, userId),
    isOwner: (tripId: any, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
  };

  return { testDb: db, dbMock: mock };
});

vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-tripmate-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  ADMIN_RECOVERY_SECRET: 'super-secret-recovery-token-xyz789',
  updateJwtSecret: () => {},
  SESSION_DURATION: '24h',
  SESSION_DURATION_MS: 86400000,
  SESSION_DURATION_SECONDS: 86400,
  DEFAULT_LANGUAGE: 'en',
}));
vi.mock('../../src/websocket', () => ({ broadcast: vi.fn(), broadcastToUser: vi.fn() }));

import { buildApp } from '../../src/bootstrap';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb, resetRateLimits } from '../helpers/test-db';
import { createUser, createAdmin, createTrip } from '../helpers/factories';
import { authHeader } from '../helpers/auth';

let nestApp: INestApplication;
let app: Application;

beforeAll(async () => {
  createTables(testDb);
  runMigrations(testDb);
  nestApp = await buildApp();
  app = nestApp.getHttpAdapter().getInstance();
});

beforeEach(() => {
  resetTestDb(testDb);
  resetRateLimits(nestApp);
});

afterAll(async () => {
  await nestApp.close();
  testDb.close();
});

describe('Multi-User Registration & Authentication Flows', () => {
  it('1. Public Sign Up succeeds with Full Name, Email, Password, Confirm Password and returns USER role with session cookie', async () => {
    // Seed an existing admin so this is a standard public registration, not initial setup
    createAdmin(testDb, { email: 'firstadmin@example.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Jane Traveller',
        email: 'jane@example.com',
        password: 'Str0ng!Password2026',
        confirm_password: 'Str0ng!Password2026',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('jane@example.com');
    expect(res.body.user.display_name).toBe('Jane Traveller');
    expect(res.body.user.role).toBe('user');
    expect(res.body.token).toBeDefined();

    // Check database row
    const userRow = testDb.prepare('SELECT * FROM users WHERE email = ?').get('jane@example.com') as any;
    expect(userRow).toBeDefined();
    expect(userRow.role).toBe('user');
    expect(userRow.display_name).toBe('Jane Traveller');
    expect(bcrypt.compareSync('Str0ng!Password2026', userRow.password_hash)).toBe(true);
  });

  it('2. Registration rejects duplicate email addresses with 409 Conflict', async () => {
    createUser(testDb, { email: 'existing@example.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate User',
        email: 'EXISTING@example.com', // Case-insensitive duplicate check
        password: 'Str0ng!Password2026',
        confirm_password: 'Str0ng!Password2026',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered|already in use|Registration failed/i);
  });

  it('3. Registration rejects password mismatch with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Mismatch User',
        email: 'mismatch@example.com',
        password: 'Str0ng!Password2026',
        confirm_password: 'DifferentPassword2026',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/passwords do not match/i);
  });

  it('4. Registration never allows user to elevate themselves to admin', async () => {
    createAdmin(testDb, { email: 'existingadmin@example.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Hacker User',
        email: 'hacker@example.com',
        password: 'Str0ng!Password2026',
        confirm_password: 'Str0ng!Password2026',
        role: 'admin', // Malicious attempt to self-assign admin role
      } as any);

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');

    const dbUser = testDb.prepare('SELECT role FROM users WHERE email = ?').get('hacker@example.com') as any;
    expect(dbUser.role).toBe('user');
  });

  it('5. Regular registered user can sign in and receive token and session cookie', async () => {
    const { user, password } = createUser(testDb, { email: 'reguser@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'reguser@example.com',
        password,
      });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('reguser@example.com');
    expect(res.body.user.role).toBe('user');
    expect(res.body.token).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('tripmate_session'))).toBe(true);
  });

  it('6. Sign in with incorrect password returns 401', async () => {
    const { user } = createUser(testDb, { email: 'reguser2@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: user.email,
        password: 'WrongPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid email or password');
  });
});

describe('Admin Account Recovery via ADMIN_RECOVERY_SECRET', () => {
  it('7. Admin recovery rejects invalid recovery secret with 401', async () => {
    createAdmin(testDb, { email: 'admin@tripmate.local' });

    const res = await request(app)
      .post('/api/auth/admin-recovery')
      .send({
        recovery_secret: 'incorrect-secret-key',
        new_password: 'NewAdminSecretPass2026!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid recovery secret/i);
  });

  it('8. Admin recovery succeeds with valid recovery secret, updates password, and allows login', async () => {
    const { user: admin } = createAdmin(testDb, { email: 'admin@tripmate.local' });
    testDb.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(admin.id);

    const res = await request(app)
      .post('/api/auth/admin-recovery')
      .send({
        recovery_secret: 'super-secret-recovery-token-xyz789',
        new_password: 'NewAdminSecretPass2026!',
        email: 'admin@tripmate.local',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe('admin@tripmate.local');

    // Verify database state: must_change_password is cleared
    const updatedAdmin = testDb.prepare('SELECT * FROM users WHERE id = ?').get(admin.id) as any;
    expect(updatedAdmin.must_change_password).toBe(0);
    expect(bcrypt.compareSync('NewAdminSecretPass2026!', updatedAdmin.password_hash)).toBe(true);

    // Verify admin can now log in with the new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@tripmate.local',
        password: 'NewAdminSecretPass2026!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('admin');
  });

  it('9. Reusing an already-consumed admin recovery secret is rejected with 403', async () => {
    createAdmin(testDb, { email: 'admin@tripmate.local' });

    // First recovery attempt succeeds
    const firstRes = await request(app)
      .post('/api/auth/admin-recovery')
      .send({
        recovery_secret: 'super-secret-recovery-token-xyz789',
        new_password: 'NewAdminSecretPass2026!',
      });
    expect(firstRes.status).toBe(200);

    // Second recovery attempt with the same secret must be rejected
    const secondRes = await request(app)
      .post('/api/auth/admin-recovery')
      .send({
        recovery_secret: 'super-secret-recovery-token-xyz789',
        new_password: 'AnotherAdminSecretPass2026!',
      });

    expect(secondRes.status).toBe(403);
    expect(secondRes.body.error).toMatch(/already been used/i);
  });
});

describe('User Account Isolation & Authorization Enforcement', () => {
  it('10. User B cannot access User A\'s trips or resources (404 Not Found via TripAccessGuard)', async () => {
    const { user: userA } = createUser(testDb, { email: 'usera@example.com' });
    const { user: userB } = createUser(testDb, { email: 'userb@example.com' });

    // User A creates a trip
    const tripA = createTrip(testDb, userA.id, { title: "User A's Secret Trip" });

    // User B attempts to access User A's trip details
    const res = await request(app)
      .get(`/api/trips/${tripA.id}`)
      .set(authHeader(userB.id));

    expect(res.status).toBe(404);
  });

  it('11. Regular user cannot access admin functionality (403 Forbidden)', async () => {
    const { user: regularUser } = createUser(testDb, { email: 'regular@example.com' });

    const res = await request(app)
      .get('/api/admin/users')
      .set(authHeader(regularUser.id));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Admin access required|Forbidden/i);
  });
});
