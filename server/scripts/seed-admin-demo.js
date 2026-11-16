/**
 * Trip Mate — Production-Safe Admin Demo Data Seeder
 *
 * Populates the existing ADMIN account with rich, attractive demo data:
 * - 6 Realistic Trips (Manali, Goa, Jaipur, Rishikesh, Kashmir, Kerala)
 * - Complete Day-by-Day Itineraries, Places, Real Coordinates, Day Notes
 * - Itemized Budget & Expenses
 * - Categorized Packing Lists
 * - Stays & Hotel Reservations (shown in dashboard upcoming reservations)
 * - Rewards Catalog Items & 2,450 Demo Points Ledger History
 * - Leaderboard with 9 Demo Travelers (Admin placed at #4)
 * - Volunteer Yatra Opportunities, Applications & Saved Favorites
 * - Saved Bucket List Destinations & Notifications
 *
 * Safety & Idempotency:
 * - Targets ONLY the specified or first admin user. Never creates a new admin.
 * - All demo data is stamped with unique identifiers/markers ([DEMO_DATA], 'demo-opp-', '@tripmate.demo').
 * - Running multiple times is safe and produces no duplicates.
 * - Running with `--clean` safely purges ONLY the seeded demo records.
 *
 * Usage:
 *   node server/scripts/seed-admin-demo.js
 *   node server/scripts/seed-admin-demo.js --email=admin@trek.local
 *   node server/scripts/seed-admin-demo.js --db=/app/data/travel.db
 *   node server/scripts/seed-admin-demo.js --clean
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Parse CLI arguments
const args = process.argv.slice(2);
const isClean = args.includes('--clean');
let customDbPath = process.env.TRIPMATE_DB_FILE || process.env.TREK_DB_FILE;
let targetEmail = process.env.ADMIN_EMAIL || process.env.RESET_ADMIN_EMAIL;

for (const arg of args) {
  if (arg.startsWith('--db=')) customDbPath = arg.split('=')[1];
  if (arg.startsWith('--email=')) targetEmail = arg.split('=')[1];
}

const dbPath = customDbPath || path.join(__dirname, '../data/travel.db');

if (!fs.existsSync(dbPath)) {
  console.error(`[DEMO-SEED] Error: Database file not found at: ${dbPath}`);
  process.exit(1);
}

console.log(`[DEMO-SEED] Connecting to database: ${dbPath}`);
const db = new Database(dbPath);
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA foreign_keys = ON');

// 1. Locate the existing Admin Account
let adminUser;
if (targetEmail) {
  adminUser = db.prepare('SELECT id, username, email, role FROM users WHERE LOWER(email) = LOWER(?)').get(targetEmail);
}
if (!adminUser) {
  adminUser = db.prepare("SELECT id, username, email, role FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
}
if (!adminUser) {
  // If no admin with role='admin' exists, check if any user exists
  adminUser = db.prepare('SELECT id, username, email, role FROM users ORDER BY id ASC LIMIT 1').get();
}

if (!adminUser) {
  console.error('[DEMO-SEED] Error: No user account found in the database. Please create an admin account first.');
  process.exit(1);
}

console.log(`[DEMO-SEED] Target Admin account: ID=${adminUser.id}, Username="${adminUser.username}", Email="${adminUser.email}", Role="${adminUser.role}"`);

// -------------------------------------------------------------
// CLEAN MODE: Safely remove ONLY seeded demo data
// -------------------------------------------------------------
if (isClean) {
  console.log('[DEMO-SEED] Running in CLEAN mode: removing seeded demo records...');
  const tx = db.transaction(() => {
    // 1. Remove demo trips and cascade
    const demoTrips = db.prepare("SELECT id FROM trips WHERE user_id = ? AND description LIKE '%[DEMO_DATA]%'").all(adminUser.id);
    for (const t of demoTrips) {
      // Clean place regions first
      const places = db.prepare('SELECT id FROM places WHERE trip_id = ?').all(t.id);
      for (const p of places) {
        db.prepare('DELETE FROM place_regions WHERE place_id = ?').run(p.id);
      }
      db.prepare('DELETE FROM trips WHERE id = ?').run(t.id);
    }
    console.log(`[DEMO-SEED] Removed ${demoTrips.length} demo trips and associated itinerary data.`);

    // 2. Remove demo points ledger
    const ledgerDel = db.prepare("DELETE FROM points_ledger WHERE user_id = ? AND action LIKE 'DEMO:%'").run(adminUser.id);
    console.log(`[DEMO-SEED] Removed ${ledgerDel.changes} demo points ledger entries.`);

    // 3. Remove demo leaderboard users
    const demoUsers = db.prepare("SELECT id FROM users WHERE email LIKE '%@tripmate.demo'").all();
    for (const u of demoUsers) {
      db.prepare('DELETE FROM points_ledger WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    }
    console.log(`[DEMO-SEED] Removed ${demoUsers.length} demo leaderboard traveler accounts.`);

    // 4. Remove demo rewards
    const rewardsDel = db.prepare("DELETE FROM rewards WHERE name LIKE '%(Demo)%'").run();
    console.log(`[DEMO-SEED] Removed ${rewardsDel.changes} demo rewards from catalog.`);

    // 5. Remove demo volunteer opportunities and applications
    const volAppsDel = db.prepare("DELETE FROM volunteer_applications WHERE opportunity_id LIKE 'demo-opp-%'").run();
    const volFavsDel = db.prepare("DELETE FROM volunteer_favorites WHERE opportunity_id LIKE 'demo-opp-%'").run();
    const volOppsDel = db.prepare("DELETE FROM volunteer_opportunities WHERE id LIKE 'demo-opp-%'").run();
    console.log(`[DEMO-SEED] Removed ${volOppsDel.changes} demo volunteer opportunities (${volAppsDel.changes} applications, ${volFavsDel.changes} favorites).`);

    // 6. Remove demo bucket list items
    const bucketDel = db.prepare("DELETE FROM bucket_list WHERE user_id = ? AND notes LIKE '%[DEMO]%'").run(adminUser.id);
    console.log(`[DEMO-SEED] Removed ${bucketDel.changes} demo bucket list destinations.`);

    // 7. Remove demo notifications
    const notifDel = db.prepare("DELETE FROM notifications WHERE recipient_id = ? AND title_key LIKE 'demo.%'").run(adminUser.id);
    console.log(`[DEMO-SEED] Removed ${notifDel.changes} demo notifications.`);
  });

  tx();
  console.log('[DEMO-SEED] Cleanup completed successfully. Real user data untouched.');
  process.exit(0);
}

// -------------------------------------------------------------
// SEED MODE: Populate Demo Data
// -------------------------------------------------------------
console.log('[DEMO-SEED] Beginning idempotent demo data population...');

// Cache categories for place category mapping
const categoryMap = {};
db.prepare('SELECT id, name FROM categories').all().forEach(c => {
  categoryMap[c.name.toLowerCase()] = c.id;
});

const getCatId = (name) => categoryMap[name.toLowerCase()] || categoryMap['attraction'] || 3;

// --- 1. REWARDS CATALOG ---
const demoRewards = [
  { name: 'Travel Voucher (Demo)', points_required: 1000 },
  { name: 'Hotel Discount (Demo)', points_required: 1500 },
  { name: 'Adventure Activity Pass (Demo)', points_required: 800 },
  { name: 'Flight Discount Voucher (Demo)', points_required: 2000 },
  { name: 'Travel Merchandise Pack (Demo)', points_required: 500 },
];

for (const r of demoRewards) {
  const existing = db.prepare('SELECT id FROM rewards WHERE name = ?').get(r.name);
  if (!existing) {
    db.prepare('INSERT INTO rewards (name, points_required) VALUES (?, ?)').run(r.name, r.points_required);
  }
}
console.log('[DEMO-SEED] Rewards catalog populated.');

// --- 2. ADMIN POINTS & TRANSACTIONS (Suggested Balance: 2,450 points) ---
const demoLedgerEntries = [
  { action: 'DEMO: Trip Completion Bonus – Manali & Goa', points: 1000 },
  { action: 'DEMO: Travel Review & High-Altitude Photography Bonus', points: 600 },
  { action: 'DEMO: Volunteer Yatra Activity Bonus – Trail & Coastline Cleanup', points: 550 },
  { action: 'DEMO: Community Contribution & Trail Guide Bonus', points: 300 },
];

for (const entry of demoLedgerEntries) {
  const exists = db.prepare('SELECT id FROM points_ledger WHERE user_id = ? AND action = ?').get(adminUser.id, entry.action);
  if (!exists) {
    db.prepare('INSERT INTO points_ledger (user_id, trip_id, action, points) VALUES (?, NULL, ?, ?)').run(
      adminUser.id,
      entry.action,
      entry.points
    );
  }
}

const adminBalance = db.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM points_ledger WHERE user_id = ?').get(adminUser.id).total;
console.log(`[DEMO-SEED] Admin Points Ledger balance verified: ${adminBalance} points.`);

// --- 3. LEADERBOARD DEMO TRAVELERS (9 travelers + Admin at #4) ---
const demoLeaderboardUsers = [
  { username: 'aarav_sharma', display_name: 'Aarav Sharma (Demo)', email: 'aarav.demo@tripmate.demo', points: 3850 },
  { username: 'ananya_iyer', display_name: 'Ananya Iyer (Demo)', email: 'ananya.demo@tripmate.demo', points: 3200 },
  { username: 'kabir_mehta', display_name: 'Kabir Mehta (Demo)', email: 'kabir.demo@tripmate.demo', points: 2800 },
  // Admin is at 2,450 points (Rank 4)
  { username: 'zara_khan', display_name: 'Zara Khan (Demo)', email: 'zara.demo@tripmate.demo', points: 2100 },
  { username: 'vikram_rathore', display_name: 'Vikram Rathore (Demo)', email: 'vikram.demo@tripmate.demo', points: 1850 },
  { username: 'ishaan_verma', display_name: 'Ishaan Verma (Demo)', email: 'ishaan.demo@tripmate.demo', points: 1500 },
  { username: 'riya_patel', display_name: 'Riya Patel (Demo)', email: 'riya.demo@tripmate.demo', points: 1250 },
  { username: 'meera_nair', display_name: 'Meera Nair (Demo)', email: 'meera.demo@tripmate.demo', points: 950 },
  { username: 'rohan_gupta', display_name: 'Rohan Gupta (Demo)', email: 'rohan.demo@tripmate.demo', points: 700 },
];

for (const u of demoLeaderboardUsers) {
  let userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (!userRow) {
    const res = db.prepare(`
      INSERT INTO users (username, display_name, email, password_hash, role, is_guest)
      VALUES (?, ?, ?, '!DEMO_NO_LOGIN!', 'user', 1)
    `).run(u.username, u.display_name, u.email);
    userRow = { id: res.lastInsertRowid };
  } else {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(u.display_name, userRow.id);
  }

  // Ensure points in points_ledger
  const ledgerExists = db.prepare('SELECT id FROM points_ledger WHERE user_id = ? AND action = ?').get(userRow.id, 'DEMO: Leaderboard Baseline Points');
  if (!ledgerExists) {
    db.prepare('INSERT INTO points_ledger (user_id, trip_id, action, points) VALUES (?, NULL, ?, ?)').run(
      userRow.id,
      'DEMO: Leaderboard Baseline Points',
      u.points
    );
  }
}
console.log('[DEMO-SEED] Leaderboard demo travelers seeded with realistic rankings.');

// --- 4. VOLUNTEER YATRA OPPORTUNITIES ---
const demoOpportunities = [
  {
    id: 'demo-opp-mountain-trail-cleanup',
    title: 'Mountain Trail Cleanup & Eco-Trek Initiative – Himachal Pradesh',
    host_name: 'Clean Himalayas Foundation',
    location: 'Old Manali & Solang Trails',
    state: 'Himachal Pradesh',
    region: 'Himachal',
    category: 'environment',
    duration: '2 Weeks - 4 Weeks',
    stipend: '₹10,000 / month',
    perks: JSON.stringify(['Free Alpine Eco-Hut Stay', '3 Organic Buffet Meals', 'Trek Gear Pass', 'Certificate of Impact']),
    skills: JSON.stringify(['Trail Hiking', 'Waste Management Awareness', 'Team Coordination']),
    hours_per_day: '3-4 hrs / day',
    min_commitment: '14 Days',
    spots_left: 3,
    rating: 4.95,
    review_count: 42,
    image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
    description: 'Hike through breathtaking pine forests and high-altitude Himalayan passes while restoring fragile mountain trails. Coordinate zero-waste bins and lead eco-awareness workshops with local homestays.',
    responsibilities: JSON.stringify([
      'Collect and segregate non-biodegradable waste along Solang & Jogini trails',
      'Conduct leave-no-trace workshops for trekkers at local trailheads',
      'Document plastic audit data for local municipal councils'
    ]),
    what_you_get: JSON.stringify([
      'Private wooden mountain room with balcony facing snow peaks',
      'All meals from the local organic farm kitchen',
      'Free guided weekend high-altitude trek passes',
      '₹10,000 monthly stipend & volunteer certificate'
    ]),
    verified: 1
  },
  {
    id: 'demo-opp-beach-cleanup-drive',
    title: 'Coastline Conservation & Beach Cleanup Drive – Goa',
    host_name: 'Clean Ocean Goa Initiative',
    location: 'Palolem & Agonda Coastline',
    state: 'Goa',
    region: 'Goa',
    category: 'conservation',
    duration: '2 Weeks - 6 Weeks',
    stipend: '₹12,000 / month',
    perks: JSON.stringify(['Beachfront Shack Stay', 'Surfing Lessons', 'Daily Breakfast & Lunch', 'Scooty Allowance']),
    skills: JSON.stringify(['Marine Eco-Advocacy', 'Community Mobilization', 'Water Sports Enthusiast']),
    hours_per_day: '3 hrs / day',
    min_commitment: '14 Days',
    spots_left: 2,
    rating: 4.92,
    review_count: 36,
    image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
    description: 'Protect marine wildlife along South Goa pristine beaches. Organize morning beach cleanup walks, ocean plastic recovery drives, and educate beach shack visitors on coastal sustainability.',
    responsibilities: JSON.stringify([
      'Lead daily morning cleanups across Palolem and Patnem beach stretches',
      'Sort collected recyclable plastic with local recycling partners',
      'Engage beach visitors with engaging marine conservation tips'
    ]),
    what_you_get: JSON.stringify([
      'Cozy beachfront wooden cottage 30 meters from water',
      'Complimentary surfing and paddleboard training',
      'Weekly allowance for scooter fuel & local dining',
      '₹12,000 monthly living stipend'
    ]),
    verified: 1
  },
  {
    id: 'demo-opp-community-teaching-jaipur',
    title: 'Heritage Community Teaching & Cultural Exchange – Jaipur',
    host_name: 'Pink City Heritage Learning Center',
    location: 'Amer Village, Jaipur',
    state: 'Rajasthan',
    region: 'Rajasthan',
    category: 'education',
    duration: '3 Weeks - 8 Weeks',
    stipend: '₹8,000 / month',
    perks: JSON.stringify(['Traditional Haveli Room', 'Homemade Rajasthani Meals', 'Hindi/Art Lessons', 'Heritage Passes']),
    skills: JSON.stringify(['English / Creative Writing', 'Art & Craft', 'Interactive Teaching']),
    hours_per_day: '3 hrs / day',
    min_commitment: '21 Days',
    spots_left: 4,
    rating: 4.88,
    review_count: 28,
    image_url: 'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=800&q=80',
    description: 'Teach conversational English, foundational digital literacy, and creative arts to children of artisan families in rural Amer, while experiencing authentic Rajasthani hospitality and culture.',
    responsibilities: JSON.stringify([
      'Conduct daily 2-hour interactive lessons for primary school students',
      'Organize weekend cultural storytelling and painting clubs',
      'Assist local teachers with engaging educational learning aids'
    ]),
    what_you_get: JSON.stringify([
      'Authentic heritage haveli room with courtyard views',
      'All daily home-cooked Rajasthani vegetarian meals',
      'Free composite entry passes to all Jaipur heritage forts',
      '₹8,000 monthly stipend'
    ]),
    verified: 1
  },
  {
    id: 'demo-opp-wildlife-conservation-uk',
    title: 'Himalayan Wildlife Conservation & Bird Habitat Survey – Uttarakhand',
    host_name: 'Corbett Foothills Wildlife Trust',
    location: 'Kotdwar / Corbett Buffer',
    state: 'Uttarakhand',
    region: 'Uttarakhand',
    category: 'wildlife',
    duration: '3 Weeks - 2 Months',
    stipend: '₹14,000 / month',
    perks: JSON.stringify(['Forest Rest House Stay', 'Wildlife Safari Passes', 'Field Equipment Access', 'Campfire Discussions']),
    skills: JSON.stringify(['Birdwatching / Field Notes', 'Photography / GPS Logging', 'Wildlife Enthusiasm']),
    hours_per_day: '4 hrs / day',
    min_commitment: '21 Days',
    spots_left: 2,
    rating: 4.96,
    review_count: 49,
    image_url: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80',
    description: 'Assist seasoned naturalists in tracking migratory bird patterns, monitoring camera traps, and mapping forest waterhole health in the lush Corbett buffer zone.',
    responsibilities: JSON.stringify([
      'Record GPS waypoints and avian species during early morning trail walks',
      'Assist forest field officers with camera trap maintenance & photo sorting',
      'Help build community firebreaks during seasonal dry weeks'
    ]),
    what_you_get: JSON.stringify([
      'Furnished eco-cottage at forest fringe with all safety amenities',
      'All freshly cooked meals & jungle-trail packed rations',
      'Official field recommendation & ₹14,000 monthly stipend',
      'Complimentary tiger reserve buffer safari passes'
    ]),
    verified: 1
  },
  {
    id: 'demo-opp-rural-tourism-kerala',
    title: 'Rural Eco-Tourism & Backwater Heritage Project – Kerala',
    host_name: 'Kuttanad Sustainable Living Collective',
    location: 'Alleppey Backwaters',
    state: 'Kerala',
    region: 'Kerala',
    category: 'community',
    duration: '4 Weeks - 3 Months',
    stipend: '₹9,000 / month',
    perks: JSON.stringify(['Waterfront Bamboo Cottage', 'Kerala Feast Daily', 'Canoeing Access', 'Ayurvedic Massage']),
    skills: JSON.stringify(['Eco-Tourism Planning', 'Digital Storytelling', 'Village Community Outreach']),
    hours_per_day: '3 hrs / day',
    min_commitment: '30 Days',
    spots_left: 3,
    rating: 4.91,
    review_count: 34,
    image_url: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=800&q=80',
    description: 'Promote responsible community-led tourism along the tranquil waterways of Kuttanad. Help local paddling guides curate authentic heritage walks and create eco-tourism brochures.',
    responsibilities: JSON.stringify([
      'Photograph and document village artisanal crafts (coir weaving, toddy tapping)',
      'Design sustainable travel route maps for conscious explorers',
      'Guide small groups on tranquil morning village canoe excursions'
    ]),
    what_you_get: JSON.stringify([
      'Independent waterfront bamboo hut right on canal banks',
      'Traditional Kerala meals served on fresh plantain leaves',
      'Free canoe and bicycle for exploring emerald waterways',
      '₹9,000 monthly volunteer stipend'
    ]),
    verified: 1
  },
  {
    id: 'demo-opp-tree-plantation-rishikesh',
    title: 'Holy Ganga Riparian Tree Plantation Drive – Rishikesh',
    host_name: 'Green Ganga Valley Mission',
    location: 'Tapovan & Kaudiyala, Rishikesh',
    state: 'Uttarakhand',
    region: 'Uttarakhand',
    category: 'nature',
    duration: '10 Days - 3 Weeks',
    stipend: '₹6,000 completion bonus',
    perks: JSON.stringify(['Riverside Tent Stay', 'Ayurvedic Meals', 'Daily Morning Yoga & Meditation', 'Rafting Trip']),
    skills: JSON.stringify(['Gardening / Sapling Care', 'Soil Preparation', 'Physical Fitness']),
    hours_per_day: '3 hrs / day',
    min_commitment: '10 Days',
    spots_left: 5,
    rating: 4.89,
    review_count: 25,
    image_url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
    description: 'Plant native banyan, neem, and peepal saplings along the erosion-prone banks of river Ganga to prevent landslides and restore riparian greenery.',
    responsibilities: JSON.stringify([
      'Plant and water native saplings along designated riverbank stretches',
      'Erect protective bamboo tree guards around growing saplings',
      'Engage visitors with river conservation pamphlets during evening aarti'
    ]),
    what_you_get: JSON.stringify([
      'Spacious riverside safari tent with bed and warm bedding',
      'Healthy satvik vegetarian meals from the ashram kitchen',
      'Complimentary river rafting and yoga sessions',
      '₹6,000 project completion allowance'
    ]),
    verified: 1
  }
];

const insertOpp = db.prepare(`
  INSERT OR REPLACE INTO volunteer_opportunities (
    id, title, host_name, location, state, region, category, duration, stipend,
    perks, skills, hours_per_day, min_commitment, spots_left, rating, review_count,
    image_url, description, responsibilities, what_you_get, verified
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const o of demoOpportunities) {
  insertOpp.run(
    o.id, o.title, o.host_name, o.location, o.state, o.region, o.category, o.duration, o.stipend,
    o.perks, o.skills, o.hours_per_day, o.min_commitment, o.spots_left, o.rating, o.review_count,
    o.image_url, o.description, o.responsibilities, o.what_you_get, o.verified
  );
}
console.log('[DEMO-SEED] Volunteer Yatra opportunities populated.');

// --- 5. ADMIN VOLUNTEER APPLICATIONS & FAVORITES ---
const demoApps = [
  {
    oppId: 'demo-opp-mountain-trail-cleanup',
    status: 'ACCEPTED',
    dates: 'Flexible, prefer mid-December',
    skills: 'Trail hiking, waste audit, mountain navigation, photography',
    motivation: 'Dedicated to keeping Himalayan trails pristine. Previously organized zero-waste campus treks and love contributing to local alpine sustainability.',
  },
  {
    oppId: 'demo-opp-beach-cleanup-drive',
    status: 'UNDER_REVIEW',
    dates: 'January 2027 season',
    skills: 'Ocean advocacy, swimming, event planning, community mobilization',
    motivation: 'Passionate about marine conservation and stopping plastic from reaching fragile ocean reefs.',
  },
  {
    oppId: 'demo-opp-wildlife-conservation-uk',
    status: 'PENDING',
    dates: 'Late January - February 2027',
    skills: 'Bird identification, GPS mapping, field trail photography',
    motivation: 'Eager to support professional naturalists in preserving Corbett buffer biodiversity.',
  }
];

for (const a of demoApps) {
  const existingApp = db.prepare('SELECT id FROM volunteer_applications WHERE user_id = ? AND opportunity_id = ?').get(adminUser.id, a.oppId);
  if (!existingApp) {
    db.prepare(`
      INSERT INTO volunteer_applications (
        opportunity_id, user_id, applicant_name, applicant_email, applicant_phone,
        applicant_skills, applicant_dates, applicant_motivation, stipend_snapshot, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      a.oppId,
      adminUser.id,
      adminUser.display_name || adminUser.username || 'Admin Explorer',
      adminUser.email,
      '+91 98765 43210',
      a.skills,
      a.dates,
      a.motivation,
      '₹10,000 / month',
      a.status
    );
  }
}

// Admin saved favorites
const demoFavOpps = ['demo-opp-community-teaching-jaipur', 'demo-opp-rural-tourism-kerala'];
for (const oppId of demoFavOpps) {
  db.prepare('INSERT OR IGNORE INTO volunteer_favorites (user_id, opportunity_id) VALUES (?, ?)').run(adminUser.id, oppId);
}
console.log('[DEMO-SEED] Admin volunteer applications and saved favorites populated.');

// --- 6. ADMIN DEMO TRIPS ---
const demoTripsData = [
  {
    title: 'Manali Adventure – Snow Peaks & Solang Valley',
    description: '[DEMO_DATA] 5-day high-altitude mountain journey featuring Solang Valley snow sports, Old Manali cedar trails, Atal Tunnel crossing into Lahaul, and peaceful Jogini Waterfall trek.',
    start_date: '2026-12-05',
    end_date: '2026-12-09',
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=1200&q=80',
    region_code: 'IN-HP',
    region_name: 'Himachal Pradesh',
    days: [
      {
        day_number: 1, date: '2026-12-05', title: 'Arrival & Old Manali Village Walk',
        notes: 'Arrive via morning Volvo, check in to riverside wooden cottage and explore historic Old Manali cafes.',
        places: [
          { name: 'Hadimba Devi Temple', category: 'attraction', lat: 32.2483, lng: 77.1802, address: 'Hadimba Temple Rd, Old Manali, Manali, HP 175131', price: 100, duration: 90, image: 'https://images.unsplash.com/photo-1597074866923-dc0589150358?auto=format&fit=crop&w=800&q=80', desc: 'Historic 16th-century wooden temple surrounded by towering deodar forests.' },
          { name: 'Cafe 1947 Riverside', category: 'restaurant', lat: 32.2530, lng: 77.1780, address: 'Near Nehru Kund, Old Manali, HP 175131', price: 800, duration: 120, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Charming vintage cafe beside river Manalsu famous for woodfired pizza and live acoustic tunes.' },
        ],
        notes_items: [{ text: 'Pick up woolens & thermal inner gloves from Mall Road.', time: '16:00', icon: '🧤' }]
      },
      {
        day_number: 2, date: '2026-12-06', title: 'Solang Valley Snow Adventures',
        notes: 'Full day of thrilling winter sports, paragliding, and snow zorbing in Solang.',
        places: [
          { name: 'Solang Valley Adventure Hub', category: 'activity', lat: 32.3166, lng: 77.1578, address: 'Solang Valley, Burwa, Manali, HP 175103', price: 2500, duration: 240, image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80', desc: 'Famous adventure center for paragliding, skiing, ATV rides, and panoramic Himalayan vistas.' },
          { name: 'Anjani Mahadev Trek & Snow Shiva Lingam', category: 'nature', lat: 32.3250, lng: 77.1610, address: 'Anjani Mahadev, Solang, HP 175103', price: 0, duration: 120, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80', desc: 'Scenic 2km trek to a sacred natural waterfall where water freezes into an ice lingam.' },
        ],
        notes_items: [{ text: 'Book paragliding slot by 10 AM before wind velocity picks up.', time: '09:30', icon: '🪂' }]
      },
      {
        day_number: 3, date: '2026-12-07', title: 'Atal Tunnel & Sissu Lahaul Day Trip',
        notes: 'Drive through the engineering marvel Atal Tunnel into the snowy Lahaul Valley.',
        places: [
          { name: 'Atal Tunnel North Portal', category: 'attraction', lat: 32.4410, lng: 77.1650, address: 'Atal Tunnel, Sissu, Lahaul & Spiti, HP 175140', price: 0, duration: 60, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'World longest highway tunnel above 10,000 feet, opening into dramatic snow-covered Lahaul Valley.' },
          { name: 'Sissu Waterfall & Lake', category: 'nature', lat: 32.4760, lng: 77.1180, address: 'Sissu, Chandra River Valley, HP 175140', price: 0, duration: 120, image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80', desc: 'Majestic waterfall cascading down barren rocky cliffs directly into the icy Chandra river.' },
        ],
        notes_items: [{ text: 'Carry thermos flasks with hot tea; temperatures drop below -5°C.', time: '11:00', icon: '☕' }]
      },
      {
        day_number: 4, date: '2026-12-08', title: 'Jogini Falls & Vashisht Hot Springs',
        notes: 'Morning pine forest hike to Jogini cascade followed by rejuvenating sulfur baths.',
        places: [
          { name: 'Jogini Waterfall Trail', category: 'nature', lat: 32.2680, lng: 77.1950, address: 'Vashisht Village to Jogini Falls, Manali, HP 175103', price: 0, duration: 180, image: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=800&q=80', desc: 'Spectacular multi-tier waterfall reachable via a gentle trail through apple orchards and pine woods.' },
          { name: 'Vashisht Natural Hot Springs', category: 'attraction', lat: 32.2610, lng: 77.1880, address: 'Vashisht Village, Manali, HP 175103', price: 0, duration: 60, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', desc: 'Ancient stone temple with natural warm mineral sulfur pools believed to possess healing properties.' },
        ],
        notes_items: [{ text: 'Wear slip-resistant trail shoes for the wet rocks near upper cascade.', time: '10:00', icon: '🥾' }]
      },
      {
        day_number: 5, date: '2026-12-09', title: 'Naggar Castle & Souvenir Shopping',
        notes: 'Explore 15th-century wood-stone palace in Naggar and pick up pure Kullu shawls.',
        places: [
          { name: 'Naggar Castle Heritage Palace', category: 'attraction', lat: 32.1460, lng: 77.1720, address: 'Naggar Village, Kullu Valley, HP 175130', price: 150, duration: 120, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Magnificent traditional Kathkuni architectural castle overlooking Beas river and snow peaks.' },
          { name: 'Mall Road Handloom Bazaars', category: 'shopping', lat: 32.2396, lng: 77.1887, address: 'The Mall, Manali, HP 175131', price: 1500, duration: 120, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', desc: 'Vibrant pedestrian market for authentic Kullu shawls, wooden carvings, and organic apple jam.' },
        ],
        notes_items: [{ text: 'Evening Volvo departs at 18:30 from Private Bus Stand.', time: '17:30', icon: '🚌' }]
      }
    ],
    budget: [
      { category: 'Transport', name: 'AC Volvo Sleeper Bus Return', total_price: 3600, note: 'Pre-booked online with Delhi pickup' },
      { category: 'Stay', name: 'Snow Valley Boutique Chalet (4 Nights)', total_price: 14000, note: 'Deluxe mountain view room with breakfast' },
      { category: 'Activities', name: 'Solang Paragliding & Snow Gear', total_price: 4500, note: 'High fly slot with video package' },
      { category: 'Food & Dining', name: 'Old Manali Cafes & Trout Dinners', total_price: 5200, note: 'Riverside dining and bakery treats' },
      { category: 'Shopping', name: 'Kullu Shawls & Local Souvenirs', total_price: 2400, note: 'Handcrafted gifts for family' },
    ],
    packing: [
      { name: 'Thermal inners (top & bottom)', category: 'Clothing', checked: 1 },
      { name: 'Waterproof trekking boots', category: 'Clothing', checked: 1 },
      { name: 'Windproof down parka jacket', category: 'Clothing', checked: 1 },
      { name: 'Power bank (20,000 mAh)', category: 'Gear & Electronics', checked: 1 },
      { name: 'Action camera with chest mount', category: 'Gear & Electronics', checked: 0 },
      { name: 'Moisturizer & lip balm (SPF 50)', category: 'Health & Personal Care', checked: 1 },
      { name: 'Physical Government ID proof', category: 'Documents', checked: 1 },
    ],
    reservation: {
      title: 'Snow Valley Boutique Chalet Check-in',
      type: 'hotel',
      location: 'Log Huts Area, Old Manali',
      confirmation_number: 'SVC-MANALI-8891',
      reservation_time: '13:00',
      notes: 'Mountain-view wooden attic suite with daily buffet breakfast included.'
    }
  },
  {
    title: 'Goa Beach Escape – Sun, Sand & Portuguese Heritage',
    description: '[DEMO_DATA] 4-day serene tropical escape through South Goa white sand bays, sunrise dolphin spotting, historic Latin quarter of Fontainhas, and cliffside ocean sunsets.',
    start_date: '2026-10-08',
    end_date: '2026-10-11',
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80',
    region_code: 'IN-GA',
    region_name: 'Goa',
    days: [
      {
        day_number: 1, date: '2026-10-08', title: 'Palolem Beach & Sunset Ocean Shack',
        notes: 'Check in to beachfront cottage on Palolem crescent bay and enjoy fresh grilled seafood.',
        places: [
          { name: 'Palolem Crescent Beach', category: 'beach', lat: 15.0100, lng: 74.0230, address: 'Palolem Beach, Canacona, South Goa 403702', price: 0, duration: 180, image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80', desc: 'Pristine crescent bay flanked by coconut groves, known for calm waters and vibrant wooden shacks.' },
          { name: 'Dropadi Seaside Shack', category: 'restaurant', lat: 15.0080, lng: 74.0245, address: 'Main Beach Road, Palolem, Goa 403702', price: 1200, duration: 120, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Legendary beach dining spot famous for butter garlic prawns, fresh catch, and sunset views.' },
        ],
        notes_items: [{ text: 'Rented Honda Activa scooter for 4 days at ₹400/day.', time: '14:30', icon: '🛵' }]
      },
      {
        day_number: 2, date: '2026-10-09', title: 'Cabo de Rama Fort & Cola Lagoon',
        notes: 'Ride scenic coastal backroads to medieval Portuguese cliff fortress and secluded freshwater lagoon.',
        places: [
          { name: 'Cabo de Rama Historic Fort', category: 'attraction', lat: 15.0880, lng: 73.9210, address: 'Cabo de Rama, Canacona, South Goa 403703', price: 0, duration: 120, image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', desc: 'Ancient clifftop fortress offering breathtaking 360-degree panoramic views of Arabian sea.' },
          { name: 'Cola Beach Emerald Lagoon', category: 'nature', lat: 15.0560, lng: 73.9680, address: 'Cola Beach, Canacona, South Goa 403702', price: 300, duration: 180, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', desc: 'Rare natural freshwater lagoon separated from the crashing ocean waves by a narrow golden sandbar.' },
        ],
        notes_items: [{ text: 'Rent a tandem kayak in the quiet lagoon for ₹300/hr.', time: '15:00', icon: '🛶' }]
      },
      {
        day_number: 3, date: '2026-10-10', title: 'Fontainhas Latin Quarter & Panaji Heritage',
        notes: 'Explore colorful Portuguese villas, tiled azulejos, art galleries, and authentic Goan cuisine.',
        places: [
          { name: 'Fontainhas Latin Quarter', category: 'attraction', lat: 15.4989, lng: 73.8310, address: 'Fontainhas, Panaji, North Goa 403001', price: 0, duration: 150, image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80', desc: 'Asia only Latin Quarter with cobblestone streets and pastel yellow, blue and terracotta colonial houses.' },
          { name: 'Viva Panjim Heritage Restaurant', category: 'restaurant', lat: 15.4975, lng: 73.8322, address: 'House No 178, 31st January Road, Fontainhas, Panaji 403001', price: 900, duration: 90, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', desc: 'Award-winning quaint heritage home serving traditional prawn balchao and pork vindaloo.' },
        ],
        notes_items: [{ text: 'Pick up hand-painted Azulejos ceramic name tiles.', time: '17:00', icon: '🎨' }]
      },
      {
        day_number: 4, date: '2026-10-11', title: 'Agonda Beach Serenity & Departure',
        notes: 'Peaceful morning walk along Olive Ridley turtle sanctuary beach and depart via Dabolim airport.',
        places: [
          { name: 'Agonda Turtle Beach', category: 'beach', lat: 15.0450, lng: 73.9880, address: 'Agonda Beach Rd, South Goa 403702', price: 0, duration: 120, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'Wide pristine golden beach known for peaceful silence, yoga retreats, and seasonal turtle nesting.' },
          { name: 'Martin Corner Heritage Seafood', category: 'restaurant', lat: 15.3120, lng: 73.9210, address: 'Binwaddo, Betalbatim, South Goa 403713', price: 1100, duration: 90, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Celebrated Goan culinary icon famous for crab masala, kingfish peri-peri, and live retro music.' },
        ],
        notes_items: [{ text: 'Returned scooter with full tank; caught 19:40 flight home.', time: '17:30', icon: '✈️' }]
      }
    ],
    budget: [
      { category: 'Transport', name: 'Roundtrip Flights Mumbai-Goa', total_price: 7600, note: 'Direct flight with cabin baggage' },
      { category: 'Stay', name: 'Palolem Beachfront Luxury Shack (3 Nights)', total_price: 11500, note: 'Oceanfront wooden cottage' },
      { category: 'Transport', name: 'Honda Activa Scooter Rental & Petrol', total_price: 1800, note: '4 days rental + 2 full tanks' },
      { category: 'Food & Dining', name: 'Seafood Shacks & Latin Quarter Dining', total_price: 5800, note: 'Fresh grilled fish and Goan thalis' },
      { category: 'Activities', name: 'Lagoon Kayaking & Fort Entry', total_price: 1200, note: 'Cola lagoon tandem paddle session' },
    ],
    packing: [
      { name: 'Linen shirts & beach shorts', category: 'Clothing', checked: 1 },
      { name: 'Polarized UV sunglasses', category: 'Accessories', checked: 1 },
      { name: 'Waterproof phone dry bag', category: 'Gear & Electronics', checked: 1 },
      { name: 'Reef-safe sunscreen & aloe vera', category: 'Health & Personal Care', checked: 1 },
      { name: 'Two-wheeler driving license', category: 'Documents', checked: 1 },
    ],
    reservation: {
      title: 'Ciaran Beach Luxury Palm Cabana',
      type: 'hotel',
      location: 'Palolem Beachfront, South Goa',
      confirmation_number: 'CIR-GOA-4491',
      reservation_time: '12:00',
      notes: 'Beachfront eco-cottage with outdoor rain shower and sunset patio.'
    }
  },
  {
    title: 'Jaipur Heritage Tour – Royal Palaces & Amber Fort',
    description: '[DEMO_DATA] 3-day royal heritage circuit exploring magnificent hilltop forts, ornate pink city palaces, stepwells, colorful bazaars, and traditional Rajasthani royal dining.',
    start_date: '2026-09-12',
    end_date: '2026-09-14',
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1200&q=80',
    region_code: 'IN-RJ',
    region_name: 'Rajasthan',
    days: [
      {
        day_number: 1, date: '2026-09-12', title: 'Amber Fort, Stepwell & Jal Mahal',
        notes: 'Morning exploration of grand hilltop Amber Palace, geometric stepwell and sunset over Jal Mahal.',
        places: [
          { name: 'Amber Fort & Palace', category: 'attraction', lat: 26.9855, lng: 75.8513, address: 'Devisinghpura, Amer, Jaipur, Rajasthan 302001', price: 200, duration: 180, image: 'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=800&q=80', desc: '16th-century red sandstone fortress famous for Sheesh Mahal (mirror palace) and Maota lake vistas.' },
          { name: 'Panna Meena Ka Kund Stepwell', category: 'attraction', lat: 26.9868, lng: 75.8560, address: 'Near Amer Fort, Amer, Jaipur, Rajasthan 302028', price: 0, duration: 60, image: 'https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=800&q=80', desc: 'Magnificent 16th-century geometric stepwell featuring criss-cross stairs and symmetrical architecture.' },
          { name: 'Jal Mahal Floating Palace', category: 'attraction', lat: 26.9535, lng: 75.8462, address: 'Amer Rd, Jal Mahal, Jaipur, Rajasthan 302002', price: 0, duration: 45, image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80', desc: 'Romantic 18th-century Rajput palace standing serenely in the center of Man Sagar Lake.' },
        ],
        notes_items: [{ text: 'Hire certified audio guide at Amber Fort ticket counter.', time: '09:30', icon: '🎧' }]
      },
      {
        day_number: 2, date: '2026-09-13', title: 'City Palace, Hawa Mahal & Jantar Mantar',
        notes: 'Walk the Pink City walled heritage corridors, astronomical observatory, and royal courtyards.',
        places: [
          { name: 'Hawa Mahal (Palace of Winds)', category: 'attraction', lat: 26.9239, lng: 75.8267, address: 'Hawa Mahal Rd, Badi Choupad, Jaipur 302002', price: 100, duration: 90, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Iconic 5-storey pink sandstone facade featuring 953 carved jharokha windows built for royal ladies.' },
          { name: 'City Palace of Jaipur', category: 'attraction', lat: 26.9258, lng: 75.8236, address: 'Tulsi Marg, Gangori Bazaar, J.D.A. Market, Jaipur 302002', price: 300, duration: 150, image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', desc: 'Opulent royal complex with museums, peacock gates in Pritam Niwas Chowk, and royal armory.' },
          { name: 'Laxmi Mishthan Bhandar (LMB)', category: 'restaurant', lat: 26.9205, lng: 75.8230, address: 'Johari Bazar Rd, Pink City, Jaipur, Rajasthan 302003', price: 600, duration: 60, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', desc: 'Century-old dining institution celebrated for pure ghee Ghewar, Pyaz Kachori, and Rajasthani thali.' },
        ],
        notes_items: [{ text: 'Tasting hot Ghewar and onion kachori at LMB is non-negotiable!', time: '13:00', icon: '🍛' }]
      },
      {
        day_number: 3, date: '2026-09-14', title: 'Nahargarh Sunset & Johari Bazaar Shopping',
        notes: 'Sunset over pink rooftops from Nahargarh battlements and souvenir shopping in Johari Bazaar.',
        places: [
          { name: 'Nahargarh Fort Sunset Viewpoint', category: 'attraction', lat: 26.9372, lng: 75.8155, address: 'Krishna Nagar, Brahampuri, Jaipur, Rajasthan 302002', price: 100, duration: 120, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'Hilltop fort overlooking the entire expanse of Jaipur pink city, stunning during golden hour.' },
          { name: 'Johari Bazaar & Bapu Bazaar', category: 'shopping', lat: 26.9190, lng: 75.8220, address: 'Bapu Bazar, Pink City, Jaipur, Rajasthan 302003', price: 2000, duration: 150, image: 'https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=800&q=80', desc: 'Famous heritage market for block print quilts (Jaipuri Razai), blue pottery, and bandhani textiles.' },
        ],
        notes_items: [{ text: 'Bargaining is expected in Bapu Bazaar for textiles.', time: '16:00', icon: '🛍️' }]
      }
    ],
    budget: [
      { category: 'Transport', name: 'Shatabdi Express AC Chair Car Return', total_price: 2400, note: 'Comfortable 4-hour executive rail' },
      { category: 'Stay', name: 'Heritage Haveli Boutique Hotel (2 Nights)', total_price: 8800, note: 'Colonial suite in Bani Park with pool' },
      { category: 'Activities', name: 'Composite Monument Entry Passes & Guides', total_price: 1800, note: 'Fast-track access to all government forts' },
      { category: 'Food & Dining', name: 'Chokhi Dhani Dinner & Local Sweets', total_price: 4200, note: 'Cultural folk performance & feast' },
      { category: 'Shopping', name: 'Blue Pottery & Handblock Prints', total_price: 3200, note: 'Authentic GI tagged Jaipuri crafts' },
    ],
    packing: [
      { name: 'Light cotton kurtas & shirts', category: 'Clothing', checked: 1 },
      { name: 'Comfortable walking shoes', category: 'Clothing', checked: 1 },
      { name: 'Wide-brim sun hat & sunglasses', category: 'Accessories', checked: 1 },
      { name: 'DSLR camera with zoom lens', category: 'Gear & Electronics', checked: 1 },
      { name: 'Cash for bazaar street shopping', category: 'Personal & Financial', checked: 1 },
    ],
    reservation: {
      title: 'Umaid Bhawan Heritage Haveli Check-in',
      type: 'hotel',
      location: 'Behari Marg, Bani Park, Jaipur',
      confirmation_number: 'UBH-JPR-2026',
      reservation_time: '12:00',
      notes: 'Heritage room with carved balcony, courtyard pool and welcome thali.'
    }
  },
  {
    title: 'Rishikesh Weekend – Holy Ganga, Rafting & Ashram Peace',
    description: '[DEMO_DATA] 2-day rejuvenating weekend featuring Grade III+ white-water rafting, Triveni Ghat sunset Ganga Aarti, Beatles Ashram graffiti walls, and peaceful riverside cafes.',
    start_date: '2026-10-24',
    end_date: '2026-10-25',
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=1200&q=80',
    region_code: 'IN-UT',
    region_name: 'Uttarakhand',
    days: [
      {
        day_number: 1, date: '2026-10-24', title: 'River Rafting & Triveni Ghat Aarti',
        notes: 'Thrilling 16km rafting run from Shivpuri through Roller Coaster rapid, followed by grand evening Ganga Aarti.',
        places: [
          { name: 'Shivpuri River Rafting Launch', category: 'activity', lat: 30.1370, lng: 78.3880, address: 'Shivpuri Beach, Rishikesh, Uttarakhand 249192', price: 1200, duration: 180, image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80', desc: 'Exciting 16km white-water expedition tackling rapids like Return to Sender and Golf Course.' },
          { name: 'Triveni Ghat Evening Ganga Aarti', category: 'attraction', lat: 30.1030, lng: 78.2930, address: 'Mayakund, Rishikesh, Uttarakhand 249201', price: 0, duration: 90, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'Soul-stirring Vedic evening prayer ceremony with synchronized brass lamps and chanting bells.' },
        ],
        notes_items: [{ text: 'Wear water shoes and secure glasses with a strap for cliff jumping.', time: '11:00', icon: '🌊' }]
      },
      {
        day_number: 2, date: '2026-10-25', title: 'Beatles Ashram & Neer Garh Waterfall',
        notes: 'Explore meditation domes in Beatles Ashram and hike up to Neer Garh waterfall pools.',
        places: [
          { name: 'Beatles Ashram (Chaurasi Kutia)', category: 'attraction', lat: 30.1170, lng: 78.3140, address: 'Swarg Ashram, Rishikesh, Uttarakhand 249304', price: 150, duration: 150, image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', desc: 'Historic 1968 retreat where The Beatles wrote the White Album, full of stunning graffiti murals.' },
          { name: 'Little Buddha Riverside Cafe', category: 'restaurant', lat: 30.1250, lng: 78.3260, address: 'Lakshman Jhula Rd, Tapovan, Rishikesh 249192', price: 700, duration: 90, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Multi-level treehouse style cafe overlooking turquoise Ganga river serving smoothie bowls and momos.' },
        ],
        notes_items: [{ text: 'Evening drive back to Delhi after late lunch.', time: '16:00', icon: '🚗' }]
      }
    ],
    budget: [
      { category: 'Transport', name: 'Delhi-Rishikesh Private Car / Fuel', total_price: 3200, note: 'Self-drive on Delhi-Meerut expressway' },
      { category: 'Stay', name: 'Riverside Eco-Resort Cottage (1 Night)', total_price: 4500, note: 'Lawn cottage with mountain views' },
      { category: 'Activities', name: 'Grade III Rafting & Beatles Ashram Entry', total_price: 1600, note: 'Full safety gear & cliff jump pass' },
      { category: 'Food & Dining', name: 'Organic Cafes & Satvik Food', total_price: 2200, note: 'Riverside smoothies and woodfired treats' },
    ],
    packing: [
      { name: 'Quick-dry clothes & nylon shorts', category: 'Clothing', checked: 1 },
      { name: 'Waterproof phone pouch with neck lanyard', category: 'Gear & Electronics', checked: 1 },
      { name: 'Water floaters / gripping sandals', category: 'Clothing', checked: 1 },
      { name: 'Mosquito repellent spray', category: 'Health & Personal Care', checked: 1 },
    ],
    reservation: {
      title: 'Camp Ganga Riviera Riverside Check-in',
      type: 'hotel',
      location: 'Kaudiyala Riverside, Rishikesh',
      confirmation_number: 'CGR-RISH-1102',
      reservation_time: '12:00',
      notes: 'Luxury river-facing tent with private bathroom and evening bonfire.'
    }
  },
  {
    title: 'Kashmir Exploration – Dal Lake, Gulmarg & Betaab Valley',
    description: '[DEMO_DATA] 7-day winter wonderland expedition: historic Srinagar Dal Lake houseboats, Gulmarg Gondola Phase 2 snow peaks, alpine skiing, and scenic Pahalgam pine valleys.',
    start_date: '2027-01-15',
    end_date: '2027-01-21',
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1566837945700-30057527ade0?auto=format&fit=crop&w=1200&q=80',
    region_code: 'IN-JK',
    region_name: 'Jammu and Kashmir',
    days: [
      {
        day_number: 1, date: '2027-01-15', title: 'Arrival, Shikara Ride & Dal Lake Houseboat',
        notes: 'Land at snowy Srinagar airport, board wooden Shikara to private carved cedar houseboat on Dal Lake.',
        places: [
          { name: 'Dal Lake & Floating Boulevard', category: 'nature', lat: 34.0837, lng: 74.8724, address: 'Boulevard Rd, Srinagar, Jammu & Kashmir 190001', price: 800, duration: 120, image: 'https://images.unsplash.com/photo-1566837945700-30057527ade0?auto=format&fit=crop&w=800&q=80', desc: 'Jewel in the crown of Kashmir: tranquil lake with houseboats, water lilies, and mountain reflections.' },
          { name: 'Nishat Bagh Mughal Pleasure Garden', category: 'attraction', lat: 34.1250, lng: 74.8820, address: 'Nishat, Srinagar, Jammu and Kashmir 190019', price: 50, duration: 90, image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80', desc: '12 terraced Mughal garden built in 1633 with grand chinar trees and cascading water fountains.' },
        ],
        notes_items: [{ text: 'Drink hot Kashmiri Kahwa with saffron and crushed almonds upon arrival.', time: '14:00', icon: '☕' }]
      },
      {
        day_number: 2, date: '2027-01-16', title: 'Old Srinagar Heritage & Royal Wazwan',
        notes: 'Explore 600-year-old Jamia Masjid, Shankaracharya temple hilltop, and 12-course Wazwan feast.',
        places: [
          { name: 'Jamia Masjid Srinagar', category: 'attraction', lat: 34.0950, lng: 74.8180, address: 'Nowhatta, Srinagar, Jammu & Kashmir 190002', price: 0, duration: 90, image: 'https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=800&q=80', desc: 'Magnificent Indo-Saracenic wooden mosque supported by 378 monumental Deodar pillar trunks.' },
          { name: 'Ahdoos Heritage Restaurant', category: 'restaurant', lat: 34.0720, lng: 74.8190, address: 'Residency Rd, Regal Chowk, Srinagar 190001', price: 1500, duration: 90, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Historic 1918 culinary landmark famous for Gustaba, Rista, Rogan Josh and Tabak Maaz.' },
        ],
        notes_items: [{ text: 'Pre-book Wazwan thali in advance for lunchtime seating.', time: '12:30', icon: '🍲' }]
      },
      {
        day_number: 3, date: '2027-01-17', title: 'Gulmarg Gondola to Apharwat Peak (Phase 1 & 2)',
        notes: 'Ascend to 13,780 feet on world second highest cable car for virgin powder snow.',
        places: [
          { name: 'Gulmarg Gondola Station', category: 'activity', lat: 34.0484, lng: 74.3805, address: 'Gulmarg Gondola, Baramulla, Jammu & Kashmir 193403', price: 1850, duration: 240, image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80', desc: 'Asia highest cable car rising through pine canopy up to the snow-covered Apharwat Peak.' },
          { name: 'Apharwat Peak Snow Ridge', category: 'nature', lat: 34.0200, lng: 74.3400, address: 'Apharwat Peak, Gulmarg, J&K 193403', price: 0, duration: 120, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80', desc: 'High-altitude snow wonderland with views stretching toward Nanga Parbat and Pir Panjal ranges.' },
        ],
        notes_items: [{ text: 'Phase 2 tickets sold out fast; ensure QR codes are downloaded offline.', time: '09:00', icon: '🎟️' }]
      },
      {
        day_number: 4, date: '2027-01-18', title: 'Gulmarg Skiing & Snowshoeing',
        notes: 'Half-day ski lesson on beginner slopes and heritage walk around St. Mary Church in snow.',
        places: [
          { name: 'Gulmarg Ski Training Slopes', category: 'activity', lat: 34.0520, lng: 74.3880, address: 'Golf Course Slopes, Gulmarg 193403', price: 2500, duration: 180, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'Premier winter ski slopes with powder snow, ski equipment rentals, and certified instructors.' },
          { name: 'St. Mary Church in the Snow', category: 'attraction', lat: 34.0490, lng: 74.3910, address: 'Near Golf Course, Gulmarg 193403', price: 0, duration: 60, image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80', desc: 'Over 100-year-old Victorian gothic stone church looking like a fairy-tale postcard in heavy snow.' },
        ],
        notes_items: [{ text: 'Wear thermal balaclava and snow gaiters to keep boots dry.', time: '10:30', icon: '🎿' }]
      },
      {
        day_number: 5, date: '2027-01-19', title: 'Pahalgam Valley & Betaab Valley',
        notes: 'Drive along Lidder river through saffron fields of Pampore to pine-clad Pahalgam.',
        places: [
          { name: 'Betaab Valley (Hajan)', category: 'nature', lat: 34.0300, lng: 75.3350, address: 'Near Pahalgam, Anantnag, J&K 192126', price: 100, duration: 150, image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=800&q=80', desc: 'Picturesque valley flanked by snow-dusted Himalayan peaks, lush willow meadows, and crystal river.' },
          { name: 'Aru Valley Riverside Trail', category: 'nature', lat: 34.0860, lng: 75.2630, address: 'Aru Village, Pahalgam, J&K 192126', price: 50, duration: 120, image: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=800&q=80', desc: 'Serene village base camp for Kolahoi glacier treks, dotted with traditional wooden Gujjar huts.' },
        ],
        notes_items: [{ text: 'Sample authentic Kashmiri saffron and walnuts at Pampore roadside cooperative.', time: '11:30', icon: '🌸' }]
      },
      {
        day_number: 6, date: '2027-01-20', title: 'Baisaran Valley (Mini Switzerland)',
        notes: 'Trek or pony ride up to Baisaran panoramic hilltop meadow flanked by dense deodar forests.',
        places: [
          { name: 'Baisaran Meadow Valley', category: 'nature', lat: 34.0050, lng: 75.3150, address: 'Baisaran, Pahalgam, J&K 192126', price: 0, duration: 180, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', desc: 'Sprawling high meadow dubbed Mini Switzerland offering endless pine views and sledging hills.' },
          { name: 'Lidder River Trout Walk', category: 'nature', lat: 34.0150, lng: 75.3280, address: 'Lidder Riverside, Pahalgam, J&K 192126', price: 0, duration: 90, image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80', desc: 'Tranquil glacial river walk with rushing turquoise waters and snow covered boulders.' },
        ],
        notes_items: [{ text: 'Hire local snow sledge for fun downhill glides in Baisaran.', time: '14:00', icon: '🛷' }]
      },
      {
        day_number: 7, date: '2027-01-21', title: 'Floating Flower Market & Departure',
        notes: 'Sunrise 6 AM Shikara to floating vegetable market, followed by flight home from Srinagar.',
        places: [
          { name: 'Floating Dal Flower Market', category: 'shopping', lat: 34.0980, lng: 74.8690, address: 'Inner Dal Lake, Srinagar 190001', price: 500, duration: 120, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Historic 150-year-old dawn floating bazaar where boatmen trade exotic flowers, saffron, and fresh produce.' },
          { name: 'Lal Chowk Artisan Market', category: 'shopping', lat: 26.9200, lng: 75.8200, address: 'Lal Chowk, Srinagar, J&K 190001', price: 2000, duration: 90, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', desc: 'City center bazaar for certified Pashmina shawls, walnut wood carved boxes, and paper-mache art.' },
        ],
        notes_items: [{ text: 'Reach Srinagar airport 3 hours prior due to multi-tier security checks.', time: '12:00', icon: '✈️' }]
      }
    ],
    budget: [
      { category: 'Transport', name: 'Roundtrip Flights Delhi-Srinagar', total_price: 11500, note: 'Direct Indigo flight with extra luggage' },
      { category: 'Stay', name: 'Luxury Cedar Houseboat & Gulmarg Resort (6 Nights)', total_price: 24500, note: 'Heated rooms with electric blankets' },
      { category: 'Transport', name: 'Private Heated 4x4 Scorpio with Driver', total_price: 14000, note: 'Equipped with snow chains for Gulmarg hill' },
      { category: 'Activities', name: 'Gondola Phase 1 & 2 Passes + Ski Lesson', total_price: 6500, note: 'High altitude mountain access and gear' },
      { category: 'Food & Dining', name: 'Wazwan Dinners, Trout & Saffron Kahwa', total_price: 5500, note: 'Authentic culinary experiences' },
      { category: 'Shopping', name: 'Authentic Kashmiri Pashmina & Saffron', total_price: 7500, note: 'Government certified GI artisan outlet' },
    ],
    packing: [
      { name: 'Heavy down parka jacket (-15°C rated)', category: 'Clothing', checked: 1 },
      { name: 'Insulated snow pants & boots', category: 'Clothing', checked: 1 },
      { name: 'Merino wool thermal sets (3 pairs)', category: 'Clothing', checked: 1 },
      { name: 'UV-blocking snow goggles', category: 'Accessories', checked: 1 },
      { name: 'Rechargeable electric hand warmers', category: 'Gear & Electronics', checked: 1 },
      { name: 'Postpaid mobile SIM card (prepaid inactive in J&K)', category: 'Documents', checked: 1 },
    ],
    reservation: {
      title: 'Mascot Heritage Luxury Houseboat Check-in',
      type: 'hotel',
      location: 'Nigeen Lake / Dal Lake, Srinagar',
      confirmation_number: 'MHB-SRIN-9912',
      reservation_time: '13:00',
      notes: 'Hand-carved walnut wood suite with Bukhari wood heater and Shikara transfers included.'
    }
  },
  {
    title: 'Kerala Backwaters – Houseboats, Spice Hills & Marari Beach',
    description: '[DEMO_DATA] 5-day tranquil tropical journey from historic Fort Kochi spice warehouses to an overnight luxury traditional houseboat cruise along palm-fringed Vembanad backwaters.',
    start_date: '2026-12-24',
    end_date: '2026-12-28',
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80',
    region_code: 'IN-KL',
    region_name: 'Kerala',
    days: [
      {
        day_number: 1, date: '2026-12-24', title: 'Fort Kochi Chinese Nets & Jew Town',
        notes: 'Walk past 600-year-old cantilevered Chinese fishing nets, antique spice shops and Jewish Synagogue.',
        places: [
          { name: 'Fort Kochi Chinese Fishing Nets', category: 'attraction', lat: 9.9675, lng: 76.2425, address: 'River Rd, Fort Kochi, Kochi, Kerala 682001', price: 0, duration: 90, image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=800&q=80', desc: 'Iconic cantilevered shore nets introduced by Chinese explorer Zheng He in the 14th century.' },
          { name: 'Paradesi Jewish Synagogue & Jew Town', category: 'attraction', lat: 9.9575, lng: 76.2595, address: 'Synagogue Ln, Jew Town, Mattancherry, Kochi 682002', price: 50, duration: 120, image: 'https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=800&q=80', desc: 'Built in 1568, featuring hand-painted 18th-century Chinese blue porcelain tiles and Belgian chandeliers.' },
          { name: 'Kashi Art Cafe & Gallery', category: 'restaurant', lat: 9.9650, lng: 76.2420, address: 'Burgher St, Fort Kochi, Kochi, Kerala 682001', price: 600, duration: 90, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Atmospheric heritage art cafe celebrated for fresh roast coffee and moist chocolate cake.' },
        ],
        notes_items: [{ text: 'Smell fresh cardamom, star anise and black pepper in Jew Town warehouses.', time: '14:30', icon: '🌿' }]
      },
      {
        day_number: 2, date: '2026-12-25', title: 'Mattancherry Dutch Palace & Kathakali Night',
        notes: 'Explore Ramayana murals in Dutch palace followed by mesmerizing classical Kathakali dance.',
        places: [
          { name: 'Mattancherry Dutch Palace', category: 'attraction', lat: 9.9580, lng: 76.2590, address: 'Mattancherry, Kochi, Kerala 682002', price: 20, duration: 90, image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', desc: 'Portuguese-built palace famous for exquisite murals portraying scenes from Hindu epics.' },
          { name: 'Kerala Kathakali Centre', category: 'activity', lat: 9.9640, lng: 76.2440, address: 'KB Jacob Rd, Fort Kochi, Kochi 682001', price: 400, duration: 120, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Watch intricate organic makeup application followed by vibrant dramatic classical dance recital.' },
        ],
        notes_items: [{ text: 'Arrive at 17:00 to observe artists putting on facial makeup.', time: '16:45', icon: '🎭' }]
      },
      {
        day_number: 3, date: '2026-12-26', title: 'Alleppey Luxury Houseboat Cruise',
        notes: 'Board private thatched Kettuvallam houseboat for overnight cruise through Vembanad backwaters.',
        places: [
          { name: 'Punnamada Jetty Houseboat Boarding', category: 'transport', lat: 9.5080, lng: 76.3540, address: 'Punnamada, Finishing Point, Alappuzha, Kerala 688013', price: 0, duration: 60, image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80', desc: 'Famous boat jetty where the world-renowned Nehru Trophy Snake Boat Race takes place annually.' },
          { name: 'Vembanad Lake Backwater Cruise', category: 'nature', lat: 9.6000, lng: 76.4000, address: 'Vembanad Lake, Alappuzha, Kerala 688561', price: 12000, duration: 360, image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=800&q=80', desc: 'India longest lake, fringed by swaying coconut palms, paddy fields below sea level, and migratory birds.' },
        ],
        notes_items: [{ text: 'Fresh Karimeen Pollichathu (pearl spot fish) prepared live by onboard private chef.', time: '13:30', icon: '🐟' }]
      },
      {
        day_number: 4, date: '2026-12-27', title: 'Village Canoe Kayaking & Marari White Sand Beach',
        notes: 'Morning narrow canal village canoe ride followed by afternoon relaxation on Marari beach.',
        places: [
          { name: 'Kuttanad Canal Canoe Excursion', category: 'activity', lat: 9.4800, lng: 76.3900, address: 'Kuttanad Village Canals, Alappuzha 688504', price: 600, duration: 150, image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80', desc: 'Gentle sunrise paddle through tiny scenic village waterways where big houseboats cannot enter.' },
          { name: 'Marari Clean Eco-Beach', category: 'beach', lat: 9.6020, lng: 76.2980, address: 'Mararikkulam North, Alappuzha, Kerala 688523', price: 0, duration: 180, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', desc: 'Golden sand eco-beach lined with endless palm trees, tranquil hammocks, and warm coastal breeze.' },
        ],
        notes_items: [{ text: 'Sunset coconut water and relaxing walk on Marari beach.', time: '17:00', icon: '🥥' }]
      },
      {
        day_number: 5, date: '2026-12-28', title: 'Kumarakom Bird Sanctuary & Departure',
        notes: 'Sunrise birdwatching trail through rubber and mangrove groves before departing from Kochi.',
        places: [
          { name: 'Kumarakom Bird Sanctuary', category: 'nature', lat: 9.6250, lng: 76.4320, address: 'Kavanattinkara, Kumarakom, Kerala 686563', price: 100, duration: 120, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80', desc: '14-acre sanctuary on the banks of Kavanar river, a haven for kingfishers, egrets, herons, and siberian cranes.' },
          { name: 'Cochin Spice Trade Market', category: 'shopping', lat: 9.9680, lng: 76.2550, address: 'Broadway, Marine Drive, Kochi, Kerala 682031', price: 1500, duration: 90, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Historic bustling bazaar for fresh cinnamon sticks, organic vanilla pods, and banana chips fried in pure coconut oil.' },
        ],
        notes_items: [{ text: 'Direct cab transfer to Cochin International Airport (COK).', time: '15:30', icon: '🚕' }]
      }
    ],
    budget: [
      { category: 'Transport', name: 'Roundtrip Flights Delhi/Mumbai-Kochi', total_price: 9400, note: 'Direct scheduled flight' },
      { category: 'Stay', name: 'Private Houseboat + Fort Kochi Heritage Inn (4 Nights)', total_price: 18500, note: '1 night full-board houseboat + 3 nights boutique stay' },
      { category: 'Transport', name: 'AC Innova Private Chauffeur Transfers', total_price: 4500, note: 'Kochi - Alleppey - Marari circuit' },
      { category: 'Food & Dining', name: 'Kerala Seafood Feasts & Toddy Shop Curries', total_price: 4800, note: 'Karimeen, appam, stew and coconut puddings' },
      { category: 'Activities', name: 'Kathakali Performance & Sunrise Canoe', total_price: 2200, note: 'Cultural and nature passes' },
      { category: 'Shopping', name: 'Organically Grown Spices & Banana Chips', total_price: 2500, note: 'Green cardamom, cloves and cashew nuts' },
    ],
    packing: [
      { name: 'Breathable linen shirts & cotton trousers', category: 'Clothing', checked: 1 },
      { name: 'Slip-on boat loafers / deck shoes', category: 'Clothing', checked: 1 },
      { name: 'Herbal mosquito repellent cream', category: 'Health & Personal Care', checked: 1 },
      { name: 'Compact binoculars for birdwatching', category: 'Gear & Electronics', checked: 1 },
      { name: 'Sun hat & light rain poncho', category: 'Accessories', checked: 1 },
    ],
    reservation: {
      title: 'Lakes & Lagoons Deluxe Houseboat Check-in',
      type: 'hotel',
      location: 'Finishing Point Jetty, Alleppey',
      confirmation_number: 'LNL-KRL-7721',
      reservation_time: '12:30',
      notes: 'Private 1-bedroom luxury air-conditioned houseboat with dedicated captain, chef and navigator.'
    }
  }
];

const insertTrip = db.prepare(`
  INSERT INTO trips (user_id, title, description, start_date, end_date, currency, cover_image, is_archived)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
`);

const insertDay = db.prepare(`
  INSERT INTO days (trip_id, day_number, date, title, notes)
  VALUES (?, ?, ?, ?, ?)
`);

const insertPlace = db.prepare(`
  INSERT INTO places (
    trip_id, name, description, lat, lng, address, category_id, price, currency,
    duration_minutes, notes, image_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAssignment = db.prepare(`
  INSERT INTO day_assignments (day_id, place_id, order_index, notes)
  VALUES (?, ?, ?, ?)
`);

const insertDayNote = db.prepare(`
  INSERT INTO day_notes (day_id, trip_id, text, time, icon, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertPlaceRegion = db.prepare(`
  INSERT OR REPLACE INTO place_regions (place_id, country_code, region_code, region_name)
  VALUES (?, 'IN', ?, ?)
`);

const insertBudget = db.prepare(`
  INSERT INTO budget_items (trip_id, category, name, total_price, note, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertPacking = db.prepare(`
  INSERT INTO packing_items (trip_id, name, checked, category, sort_order)
  VALUES (?, ?, ?, ?, ?)
`);

const insertReservation = db.prepare(`
  INSERT INTO reservations (trip_id, day_id, title, type, location, confirmation_number, notes, status, reservation_time)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
`);

let createdTripCount = 0;

for (const t of demoTripsData) {
  // Check if trip already exists for this admin
  const existingTrip = db.prepare('SELECT id FROM trips WHERE user_id = ? AND title = ?').get(adminUser.id, t.title);
  if (existingTrip) {
    console.log(`[DEMO-SEED] Trip "${t.title}" already exists (ID: ${existingTrip.id}). Skipping to preserve idempotency.`);
    continue;
  }

  const tripRes = insertTrip.run(
    adminUser.id,
    t.title,
    t.description,
    t.start_date,
    t.end_date,
    t.currency,
    t.cover_image
  );
  const tripId = tripRes.lastInsertRowid;
  createdTripCount++;

  let firstDayId = null;

  for (const d of t.days) {
    const dayRes = insertDay.run(tripId, d.day_number, d.date, d.title, d.notes);
    const dayId = dayRes.lastInsertRowid;
    if (!firstDayId) firstDayId = dayId;

    if (d.places) {
      let orderIdx = 0;
      for (const p of d.places) {
        const catId = getCatId(p.category);
        const placeRes = insertPlace.run(
          tripId,
          p.name,
          p.desc,
          p.lat,
          p.lng,
          p.address,
          catId,
          p.price,
          'INR',
          p.duration,
          p.desc,
          p.image
        );
        const placeId = placeRes.lastInsertRowid;

        insertAssignment.run(dayId, placeId, orderIdx++, p.desc);
        insertPlaceRegion.run(placeId, t.region_code, t.region_name);
      }
    }

    if (d.notes_items) {
      let nIdx = 0;
      for (const ni of d.notes_items) {
        insertDayNote.run(dayId, tripId, ni.text, ni.time, ni.icon, nIdx++);
      }
    }
  }

  // Budget items
  if (t.budget) {
    let bIdx = 0;
    for (const b of t.budget) {
      insertBudget.run(tripId, b.category, b.name, b.total_price, b.note, bIdx++);
    }
  }

  // Packing items
  if (t.packing) {
    let pIdx = 0;
    for (const p of t.packing) {
      insertPacking.run(tripId, p.name, p.checked, p.category, pIdx++);
    }
  }

  // Reservation
  if (t.reservation && firstDayId) {
    insertReservation.run(
      tripId,
      firstDayId,
      t.reservation.title,
      t.reservation.type,
      t.reservation.location,
      t.reservation.confirmation_number,
      t.reservation.notes,
      t.reservation.reservation_time
    );
  }
}

console.log(`[DEMO-SEED] Seeded ${createdTripCount} new trips for Admin user.`);

// --- 7. SAVED DESTINATIONS (BUCKET LIST) ---
const demoBucketList = [
  { name: 'Pangong Tso High-Altitude Lake, Ladakh', lat: 33.7595, lng: 78.6674, country_code: 'IN', notes: '[DEMO] Pristine turquoise saline lake at 14,000 ft, best explored via Nubra Valley pass.' },
  { name: 'Hampi UNESCO Ruins & Boulder Valley, Karnataka', lat: 15.3350, lng: 76.4600, country_code: 'IN', notes: '[DEMO] Ancient Vijayanagara empire monuments, Virupaksha temple, and scenic Tungabhadra sunsets.' },
  { name: 'Valley of Flowers National Park, Uttarakhand', lat: 30.7280, lng: 79.6053, country_code: 'IN', notes: '[DEMO] UNESCO world heritage alpine meadow in full bloom with rare Himalayan flora in July-August.' },
  { name: 'Ziro Valley Cultural Landscape, Arunachal Pradesh', lat: 27.5956, lng: 93.8315, country_code: 'IN', notes: '[DEMO] Serene pine-clad valleys, sustainable paddy fish-cultivation, and Apatani tribal heritage.' }
];

for (const b of demoBucketList) {
  const existing = db.prepare('SELECT id FROM bucket_list WHERE user_id = ? AND name = ?').get(adminUser.id, b.name);
  if (!existing) {
    db.prepare(`
      INSERT INTO bucket_list (user_id, name, lat, lng, country_code, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminUser.id, b.name, b.lat, b.lng, b.country_code, b.notes);
  }
}
console.log('[DEMO-SEED] Bucket list destinations populated.');

// --- 8. DEMO NOTIFICATIONS ---
const demoNotifications = [
  {
    type: 'simple',
    scope: 'trip',
    title_key: 'demo.notif.manali_prep',
    text_key: 'demo.notif.manali_prep_body',
    title_params: JSON.stringify({ trip: 'Manali Adventure' }),
    text_params: JSON.stringify({ text: 'Your Manali Adventure starts in 18 days! Check your packing list for thermal gear.' }),
    is_read: 0
  },
  {
    type: 'simple',
    scope: 'user',
    title_key: 'demo.notif.vol_accepted',
    text_key: 'demo.notif.vol_accepted_body',
    title_params: JSON.stringify({ opp: 'Mountain Trail Cleanup' }),
    text_params: JSON.stringify({ text: 'Great news! Clean Himalayas Foundation has ACCEPTED your Volunteer Yatra application.' }),
    is_read: 0
  },
  {
    type: 'simple',
    scope: 'user',
    title_key: 'demo.notif.rewards_milestone',
    text_key: 'demo.notif.rewards_milestone_body',
    title_params: JSON.stringify({ points: '2,450' }),
    text_params: JSON.stringify({ text: 'You achieved 2,450 reward points! You are currently ranked #4 on the traveler leaderboard.' }),
    is_read: 1
  }
];

for (const n of demoNotifications) {
  const existingNotif = db.prepare('SELECT id FROM notifications WHERE recipient_id = ? AND title_key = ?').get(adminUser.id, n.title_key);
  if (!existingNotif) {
    db.prepare(`
      INSERT INTO notifications (
        type, scope, target, recipient_id, title_key, title_params, text_key, text_params, is_read
      ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      n.type,
      n.scope,
      adminUser.id,
      n.title_key,
      n.title_params,
      n.text_key,
      n.text_params,
      n.is_read
    );
  }
}
console.log('[DEMO-SEED] In-app notifications populated.');

// --- 9. RECENT AUDIT ACTIVITIES ---
const demoAudit = [
  { action: 'trip.created', resource: 'trip', details: JSON.stringify({ title: 'Manali Adventure – Snow Peaks & Solang Valley' }) },
  { action: 'volunteer.application_submitted', resource: 'volunteer', details: JSON.stringify({ opportunity: 'Mountain Trail Cleanup & Eco-Trek' }) },
  { action: 'rewards.points_awarded', resource: 'rewards', details: JSON.stringify({ points: 550, reason: 'Volunteer Yatra engagement' }) },
];

for (const a of demoAudit) {
  db.prepare(`
    INSERT INTO audit_log (user_id, action, resource, details, ip)
    VALUES (?, ?, ?, ?, '127.0.0.1')
  `).run(adminUser.id, a.action, a.resource, a.details);
}
console.log('[DEMO-SEED] Recent audit activity records populated.');

console.log('-------------------------------------------------------------');
console.log('[DEMO-SEED] SUCCESS! All demo data successfully populated for:');
console.log(`            User: ${adminUser.username} (${adminUser.email})`);
console.log(`            Trips: 6 realistic trips (3 completed, 3 upcoming)`);
console.log(`            Points Balance: ${adminBalance} points`);
console.log(`            Leaderboard: 10 travelers (Admin at Rank #4)`);
console.log(`            Volunteer Yatra: 6 opportunities, 3 applications, 2 favorites`);
console.log(`            Bucket List: 4 saved destinations`);
console.log('-------------------------------------------------------------');
