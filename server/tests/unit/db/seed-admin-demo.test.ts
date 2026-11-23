import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { seedAdminDemoData, shouldAutoSeedDemo } from '../../../src/db/seed-admin-demo';

describe('seedAdminDemoData', () => {
  let db: Database.Database;
  const originalEnv = process.env.SEED_ADMIN_DEMO;

  beforeEach(() => {
    delete process.env.SEED_ADMIN_DEMO;
    db = new Database(':memory:');
    createTables(db);
    runMigrations(db);

    // Insert categories for testing
    const cats = ['attraction', 'restaurant', 'activity', 'nature', 'shopping', 'beach', 'transport'];
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    for (const c of cats) {
      insertCat.run(c);
    }

    // Create a sample admin user
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (1, 'admin', 'admin@tripmate.local', 'hash', 'admin')
    `).run();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SEED_ADMIN_DEMO = originalEnv;
    } else {
      delete process.env.SEED_ADMIN_DEMO;
    }
  });

  it('detects that auto-seed is required when admin has 0 demo trips', () => {
    process.env.SEED_ADMIN_DEMO = 'true';
    const needed = shouldAutoSeedDemo(db);
    expect(needed).toBe(true);
  });

  it('respects SEED_ADMIN_DEMO=false', () => {
    process.env.SEED_ADMIN_DEMO = 'false';
    const needed = shouldAutoSeedDemo(db);
    expect(needed).toBe(false);
  });

  it('populates 6 trips, 2,450 points, and all related demo data idempotently', () => {
    const result1 = seedAdminDemoData(db, { log: () => {} });
    expect(result1.success).toBe(true);
    expect(result1.tripsInserted).toBe(6);
    expect(result1.pointsBalance).toBe(2450);

    // Verify trips in db
    const tripRows = db.prepare('SELECT id, title, description FROM trips WHERE user_id = 1').all() as any[];
    expect(tripRows.length).toBe(6);
    expect(tripRows[0].description).toContain('[DEMO_DATA]');

    // Verify points
    const pointsTotal = (db.prepare('SELECT SUM(points) as total FROM points_ledger WHERE user_id = 1').get() as any).total;
    expect(pointsTotal).toBe(2450);

    // Verify leaderboard travelers (9 demo users created)
    const demoUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE email LIKE '%@tripmate.demo'").get() as any;
    expect(demoUsers.count).toBe(9);

    // Verify volunteer opportunities & applications
    const opps = db.prepare("SELECT COUNT(*) as count FROM volunteer_opportunities WHERE id LIKE 'demo-opp-%'").get() as any;
    expect(opps.count).toBe(6);
    const apps = db.prepare('SELECT COUNT(*) as count FROM volunteer_applications WHERE user_id = 1').get() as any;
    expect(apps.count).toBe(3);

    // Verify place regions for Atlas
    const regions = db.prepare('SELECT COUNT(*) as count FROM place_regions').get() as any;
    expect(regions.count).toBeGreaterThan(10);

    // Second run must be idempotent: 0 inserted, 6 skipped
    const result2 = seedAdminDemoData(db, { log: () => {} });
    expect(result2.success).toBe(true);
    expect(result2.tripsInserted).toBe(0);
    expect(result2.tripsSkipped).toBe(6);
    expect(result2.pointsBalance).toBe(2450);
  });

  it('safely cleans demo records in clean mode without touching non-demo data', () => {
    seedAdminDemoData(db, { log: () => {} });

    // Insert a real user trip
    db.prepare(`
      INSERT INTO trips (user_id, title, description, start_date, end_date)
      VALUES (1, 'Real User Trip', 'Not demo data', '2026-12-01', '2026-12-02')
    `).run();

    // Clean demo data
    const cleanResult = seedAdminDemoData(db, { clean: true, log: () => {} });
    expect(cleanResult.success).toBe(true);

    // Real user trip must still exist
    const remainingTrips = db.prepare('SELECT id, title FROM trips WHERE user_id = 1').all() as any[];
    expect(remainingTrips.length).toBe(1);
    expect(remainingTrips[0].title).toBe('Real User Trip');

    // Demo points cleared
    const remainingPoints = (db.prepare('SELECT COALESCE(SUM(points), 0) as total FROM points_ledger WHERE user_id = 1').get() as any).total;
    expect(remainingPoints).toBe(0);
  });

  it('promotes target user dakshgola0905@gmail.com to admin and seeds demo data for them', () => {
    // Insert user with role 'user'
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (20, 'daksh.gola', 'dakshgola0905@gmail.com', 'hash', 'user')
    `).run();

    const result = seedAdminDemoData(db, { log: () => {} });
    expect(result.success).toBe(true);
    expect(result.adminEmail).toBe('dakshgola0905@gmail.com');
    expect(result.adminId).toBe(20);

    // Verify user is promoted to admin
    const user = db.prepare('SELECT role, must_change_password FROM users WHERE id = 20').get() as any;
    expect(user.role).toBe('admin');
    expect(user.must_change_password).toBe(0);

    // Verify demo trips belong to user 20
    const trips = db.prepare('SELECT id FROM trips WHERE user_id = 20').all();
    expect(trips.length).toBe(6);

    // Verify points belong to user 20
    const pointsTotal = (db.prepare('SELECT SUM(points) as total FROM points_ledger WHERE user_id = 20').get() as any).total;
    expect(pointsTotal).toBe(2450);
  });
});
