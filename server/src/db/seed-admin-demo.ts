import type Database from 'better-sqlite3';
import { readEnv } from '../app-config';

export interface SeedAdminDemoResult {
  success: boolean;
  adminId?: number;
  adminEmail?: string;
  adminUsername?: string;
  tripsInserted: number;
  tripsSkipped: number;
  pointsBalance: number;
  leaderboardCount: number;
  opportunitiesCount: number;
  message: string;
}

export function shouldAutoSeedDemo(db: Database.Database): boolean {
  if (process.env.SEED_ADMIN_DEMO === 'true' || process.env.SEED_DEMO_DATA === 'true') {
    return true;
  }
  if (process.env.SEED_ADMIN_DEMO === 'false') {
    return false;
  }
  // If in test mode, do not auto-seed unless explicitly demanded
  if (readEnv().app.isTest) {
    return false;
  }
  // Locate admin
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
  if (!admin) return false;

  // Check if admin already has demo trips
  const demoTripCount = (
    db.prepare("SELECT COUNT(*) as count FROM trips WHERE user_id = ? AND description LIKE '%[DEMO_DATA]%'").get(admin.id) as { count: number }
  ).count;
  return demoTripCount === 0;
}

export function seedAdminDemoData(
  db: Database.Database,
  options?: {
    clean?: boolean;
    targetEmail?: string;
    log?: (msg: string) => void;
  }
): SeedAdminDemoResult {
  const logger = options?.log || ((msg: string) => console.log(`[DEMO-SEED] ${msg}`));
  const isClean = !!options?.clean;

  // 1. Locate Admin User
  let adminUser: { id: number; username: string; email: string; role: string; display_name?: string } | undefined;
  const targetEmail = options?.targetEmail || process.env.ADMIN_EMAIL || process.env.RESET_ADMIN_EMAIL;

  if (targetEmail) {
    adminUser = db.prepare('SELECT id, username, email, role, display_name FROM users WHERE LOWER(email) = LOWER(?)').get(targetEmail.trim()) as any;
  }
  if (!adminUser) {
    adminUser = db.prepare("SELECT id, username, email, role, display_name FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get() as any;
  }
  if (!adminUser) {
    adminUser = db.prepare('SELECT id, username, email, role, display_name FROM users ORDER BY id ASC LIMIT 1').get() as any;
  }

  if (!adminUser) {
    logger('No user account found in database. Skipping demo seeding.');
    return {
      success: false,
      tripsInserted: 0,
      tripsSkipped: 0,
      pointsBalance: 0,
      leaderboardCount: 0,
      opportunitiesCount: 0,
      message: 'No user account found in database.',
    };
  }

  logger(`Target Admin account: ID=${adminUser.id}, Username="${adminUser.username}", Email="${adminUser.email}", Role="${adminUser.role}"`);

  // --- CLEAN MODE ---
  if (isClean) {
    logger('Running in CLEAN mode: removing seeded demo records...');
    const tx = db.transaction(() => {
      const demoTrips = db.prepare("SELECT id FROM trips WHERE user_id = ? AND description LIKE '%[DEMO_DATA]%'").all(adminUser!.id) as { id: number }[];
      for (const t of demoTrips) {
        const places = db.prepare('SELECT id FROM places WHERE trip_id = ?').all(t.id) as { id: number }[];
        for (const p of places) {
          db.prepare('DELETE FROM place_regions WHERE place_id = ?').run(p.id);
        }
        db.prepare('DELETE FROM trips WHERE id = ?').run(t.id);
      }
      db.prepare("DELETE FROM points_ledger WHERE user_id = ? AND action LIKE 'DEMO:%'").run(adminUser!.id);
      db.prepare("DELETE FROM users WHERE email LIKE '%@tripmate.demo'").run();
      db.prepare("DELETE FROM volunteer_applications WHERE user_id = ? AND opportunity_id LIKE 'demo-opp-%'").run(adminUser!.id);
      db.prepare("DELETE FROM volunteer_favorites WHERE user_id = ? AND opportunity_id LIKE 'demo-opp-%'").run(adminUser!.id);
      db.prepare("DELETE FROM volunteer_opportunities WHERE id LIKE 'demo-opp-%'").run();
      db.prepare("DELETE FROM bucket_list WHERE user_id = ? AND notes LIKE '%[DEMO]%'").run(adminUser!.id);
      db.prepare("DELETE FROM notifications WHERE recipient_id = ? AND title_key LIKE 'demo.notif.%'").run(adminUser!.id);
    });
    tx();
    logger('Clean completed.');
    return {
      success: true,
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      adminUsername: adminUser.username,
      tripsInserted: 0,
      tripsSkipped: 0,
      pointsBalance: 0,
      leaderboardCount: 0,
      opportunitiesCount: 0,
      message: 'Demo records cleaned successfully.',
    };
  }

  // --- POPULATE MODE ---
  logger('Beginning idempotent demo data population...');

  // 1. Rewards Catalog
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

  // 2. Admin Points Ledger (Target: 2,450 points)
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

  const adminBalance = (db.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM points_ledger WHERE user_id = ?').get(adminUser.id) as { total: number }).total;

  // 3. Leaderboard Demo Travelers (9 Demo + Admin at Rank #4)
  const demoLeaderboardUsers = [
    { username: 'aarav_sharma', display_name: 'Aarav Sharma (Demo)', email: 'aarav.demo@tripmate.demo', points: 3850 },
    { username: 'ananya_iyer', display_name: 'Ananya Iyer (Demo)', email: 'ananya.demo@tripmate.demo', points: 3200 },
    { username: 'kabir_mehta', display_name: 'Kabir Mehta (Demo)', email: 'kabir.demo@tripmate.demo', points: 2800 },
    { username: 'zara_khan', display_name: 'Zara Khan (Demo)', email: 'zara.demo@tripmate.demo', points: 2100 },
    { username: 'vikram_rathore', display_name: 'Vikram Rathore (Demo)', email: 'vikram.demo@tripmate.demo', points: 1850 },
    { username: 'ishaan_verma', display_name: 'Ishaan Verma (Demo)', email: 'ishaan.demo@tripmate.demo', points: 1500 },
    { username: 'riya_patel', display_name: 'Riya Patel (Demo)', email: 'riya.demo@tripmate.demo', points: 1250 },
    { username: 'meera_nair', display_name: 'Meera Nair (Demo)', email: 'meera.demo@tripmate.demo', points: 950 },
    { username: 'rohan_gupta', display_name: 'Rohan Gupta (Demo)', email: 'rohan.demo@tripmate.demo', points: 700 },
  ];

  for (const u of demoLeaderboardUsers) {
    let userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email) as { id: number } | undefined;
    if (!userRow) {
      const res = db.prepare(`
        INSERT INTO users (username, display_name, email, password_hash, role, is_guest)
        VALUES (?, ?, ?, '!DEMO_NO_LOGIN!', 'user', 1)
      `).run(u.username, u.display_name, u.email);
      userRow = { id: Number(res.lastInsertRowid) };
    } else {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(u.display_name, userRow.id);
    }

    const ledgerExists = db.prepare('SELECT id FROM points_ledger WHERE user_id = ? AND action = ?').get(userRow.id, 'DEMO: Leaderboard Baseline Points');
    if (!ledgerExists) {
      db.prepare('INSERT INTO points_ledger (user_id, trip_id, action, points) VALUES (?, NULL, ?, ?)').run(
        userRow.id,
        'DEMO: Leaderboard Baseline Points',
        u.points
      );
    }
  }

  // 4. Volunteer Yatra Opportunities
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
        'Document plastic audit data for local municipal councils',
      ]),
      what_you_get: JSON.stringify([
        'Private wooden mountain room with balcony facing snow peaks',
        'All meals from the local organic farm kitchen',
        'Free guided weekend high-altitude trek passes',
        '₹10,000 monthly stipend & volunteer certificate',
      ]),
      verified: 1,
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
        'Engage beach visitors with engaging marine conservation tips',
      ]),
      what_you_get: JSON.stringify([
        'Cozy beachfront wooden cottage 30 meters from water',
        'Complimentary surfing and paddleboard training',
        'Weekly allowance for scooter fuel & local dining',
        '₹12,000 monthly living stipend',
      ]),
      verified: 1,
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
        'Assist local teachers with engaging educational learning aids',
      ]),
      what_you_get: JSON.stringify([
        'Authentic heritage haveli room with courtyard views',
        'All daily home-cooked Rajasthani vegetarian meals',
        'Free composite entry passes to all Jaipur heritage forts',
        '₹8,000 monthly stipend',
      ]),
      verified: 1,
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
        'Help build community firebreaks during seasonal dry weeks',
      ]),
      what_you_get: JSON.stringify([
        'Furnished eco-cottage at forest fringe with all safety amenities',
        'All freshly cooked meals & jungle-trail packed rations',
        'Official field recommendation & ₹14,000 monthly stipend',
        'Complimentary tiger reserve buffer safari passes',
      ]),
      verified: 1,
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
        'Guide small groups on tranquil morning village canoe excursions',
      ]),
      what_you_get: JSON.stringify([
        'Independent waterfront bamboo hut right on canal banks',
        'Traditional Kerala meals served on fresh plantain leaves',
        'Free canoe and bicycle for exploring emerald waterways',
        '₹9,000 monthly volunteer stipend',
      ]),
      verified: 1,
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
        'Engage visitors with river conservation pamphlets during evening aarti',
      ]),
      what_you_get: JSON.stringify([
        'Spacious riverside safari tent with bed and warm bedding',
        'Healthy satvik vegetarian meals from the ashram kitchen',
        'Complimentary river rafting and yoga sessions',
        '₹6,000 project completion allowance',
      ]),
      verified: 1,
    },
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

  // 5. Admin Volunteer Applications & Favorites
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
    },
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

  const demoFavOpps = ['demo-opp-community-teaching-jaipur', 'demo-opp-rural-tourism-kerala'];
  for (const oppId of demoFavOpps) {
    db.prepare('INSERT OR IGNORE INTO volunteer_favorites (user_id, opportunity_id) VALUES (?, ?)').run(adminUser.id, oppId);
  }

  // Category mapping helper
  const categoryMap: Record<string, number> = {};
  (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).forEach(c => {
    categoryMap[c.name.toLowerCase()] = c.id;
  });
  const getCatId = (name: string) => categoryMap[name.toLowerCase()] || categoryMap['attraction'] || 3;

  // 6. Admin Demo Trips
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
            { name: 'Fontainhas Latin Heritage Walk', category: 'attraction', lat: 15.4989, lng: 73.8315, address: 'Fontainhas, Panaji, Goa 403001', price: 0, duration: 120, image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80', desc: 'Asia oldest surviving Latin quarter adorned with pastel yellow, blue, and terracotta houses.' },
            { name: 'Viva Panjim Heritage Restaurant', category: 'restaurant', lat: 15.4980, lng: 73.8320, address: 'House No. 178, 31st January Rd, Fontainhas, Panaji 403001', price: 900, duration: 90, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Award-winning quaint heritage home serving authentic Goan prawn curry, pork vindaloo, and bebinca.' },
          ],
          notes_items: [{ text: 'Buy authentic handmade painted ceramic tiles from local artist studio.', time: '16:30', icon: '🎨' }]
        },
        {
          day_number: 4, date: '2026-10-11', title: 'Agonda Dolphin Boat & Return',
          notes: 'Sunrise open-ocean dolphin cruise and chilled beach brunch before flying home from Dabolim.',
          places: [
            { name: 'Agonda Quiet Beach', category: 'beach', lat: 15.0450, lng: 73.9870, address: 'Agonda Beach Rd, Canacona, South Goa 403702', price: 0, duration: 150, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', desc: 'Peaceful nesting sanctuary for Olive Ridley sea turtles with wide soft sands and rolling waves.' },
            { name: 'Simrose Beachside Lounge', category: 'restaurant', lat: 15.0430, lng: 73.9890, address: 'Agonda Beach, Canacona, South Goa 403702', price: 800, duration: 90, image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80', desc: 'Idyllic open-air beachfront spot serving smoothie bowls, fresh passion fruit juice, and breakfast.' },
          ],
          notes_items: [{ text: 'Prepaid airport taxi booked for 16:00 to Dabolim Airport (GOI).', time: '15:30', icon: '✈️' }]
        }
      ],
      budget: [
        { category: 'Transport', name: 'Roundtrip Flights Delhi-Goa', total_price: 8200, note: 'Direct scheduled flight' },
        { category: 'Stay', name: 'Palolem Beachfront Wooden Hut (3 Nights)', total_price: 9000, note: 'Sea-facing cottage with private hammock' },
        { category: 'Transport', name: 'Honda Activa Rental & Fuel', total_price: 2100, note: 'Convenient coastal exploration' },
        { category: 'Food & Dining', name: 'Goan Fish Curries & Beach Shacks', total_price: 4500, note: 'Seafood, poee bread and tropical juices' },
        { category: 'Activities', name: 'Sunrise Dolphin Cruise & Kayaking', total_price: 1800, note: 'Local fishermen open boat tour' },
      ],
      packing: [
        { name: 'Quick-dry swim shorts & linen shirts', category: 'Clothing', checked: 1 },
        { name: 'Waterproof phone dry bag pouch', category: 'Gear & Electronics', checked: 1 },
        { name: 'Polarized sunglasses & sun hat', category: 'Accessories', checked: 1 },
        { name: 'Reef-safe sunscreen (SPF 50+)', category: 'Health & Personal Care', checked: 1 },
        { name: 'Sandals / flip-flops', category: 'Clothing', checked: 1 },
      ],
      reservation: {
        title: 'Ciaran Beachside Cottages Check-in',
        type: 'hotel',
        location: 'Palolem Beach, South Goa',
        confirmation_number: 'CBC-GOA-4432',
        reservation_time: '14:00',
        notes: 'Ocean-facing luxury bamboo cottage with garden hammock and complimentary breakfast.'
      }
    },
    {
      title: 'Jaipur Heritage Tour – Royal Palaces, Forts & Bazaars',
      description: '[DEMO_DATA] 3-day royal exploration of the Pink City featuring Amber Fort mirror palace, Hawa Mahal photography, astronomical wonder Jantar Mantar, and authentic Rajasthani thali dining.',
      start_date: '2026-11-14',
      end_date: '2026-11-16',
      currency: 'INR',
      cover_image: 'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1200&q=80',
      region_code: 'IN-RJ',
      region_name: 'Rajasthan',
      days: [
        {
          day_number: 1, date: '2026-11-14', title: 'Pink City Walled City & City Palace',
          notes: 'Explore the heart of royal Jaipur, Hawa Mahal façade and the vibrant courtyard museum.',
          places: [
            { name: 'Hawa Mahal (Palace of Winds)', category: 'attraction', lat: 26.9239, lng: 75.8267, address: 'Hawa Mahal Rd, Badi Choupad, J.D.A. Market, Jaipur, RJ 302002', price: 200, duration: 90, image: 'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=800&q=80', desc: 'Iconic 1799 pink sandstone palace with 953 honeycomb jharokhas built for royal women to observe street life.' },
            { name: 'City Palace & Chandra Mahal', category: 'attraction', lat: 26.9258, lng: 75.8236, address: 'Tulsi Marg, Gangori Bazar, J.D.A. Market, Jaipur, RJ 302002', price: 700, duration: 150, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Opulent blend of Rajasthani and Mughal architecture, housing royal costumes, armory, and Peacock courtyard.' },
            { name: 'Laxmi Mishthan Bhandar (LMB)', category: 'restaurant', lat: 26.9210, lng: 75.8240, address: 'Johari Bazar, Jaipur, Rajasthan 302003', price: 650, duration: 60, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Famous heritage sweetshop established in 1727, legendary for Ghewar, Pyaaz Kachori, and royal thali.' },
          ],
          notes_items: [{ text: 'Visit Tattoo Cafe opposite Hawa Mahal for sunrise rooftop photography.', time: '08:00', icon: '📸' }]
        },
        {
          day_number: 2, date: '2026-11-15', title: 'Amber Fort, Sheesh Mahal & Jal Mahal',
          notes: 'Climb the majestic ramparts of Amber Fort, marvel at the glittering mirror palace and view water palace.',
          places: [
            { name: 'Amber Palace & Sheesh Mahal', category: 'attraction', lat: 26.9855, lng: 75.8513, address: 'Devisinghpura, Amer, Jaipur, Rajasthan 302001', price: 500, duration: 210, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', desc: '16th-century clifftop fortress with ornate mirror palace that reflects single candle beam across hall.' },
            { name: 'Jal Mahal (Water Palace)', category: 'attraction', lat: 26.9534, lng: 75.8462, address: 'Amer Rd, Jal Mahal, Amber, Jaipur, Rajasthan 302002', price: 0, duration: 45, image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', desc: 'Submerged five-story red sandstone palace in Man Sagar lake, four stories submerged below waterline.' },
            { name: '1135 AD Amber Fort Fine Dining', category: 'restaurant', lat: 26.9860, lng: 75.8520, address: 'Amber Fort, Amer, Jaipur, Rajasthan 302001', price: 2200, duration: 120, image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80', desc: 'Exquisite royal heritage restaurant inside fort serving authentic Rajput recipes with live sitar music.' },
          ],
          notes_items: [{ text: 'Take an audio guide or licensed tourism guide at fort entrance.', time: '09:30', icon: '🎧' }]
        },
        {
          day_number: 3, date: '2026-11-16', title: 'Nahargarh Sunset & Johari Block Prints',
          notes: 'Watch sun set over entire pink skyline from Nahargarh ramparts and shop block print textiles.',
          places: [
            { name: 'Nahargarh Fort Clifftop Ramparts', category: 'attraction', lat: 26.9370, lng: 75.8155, address: 'Krishna Nagar, Brahampuri, Jaipur, Rajasthan 302002', price: 200, duration: 150, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'Stands on the edge of the Aravalli hills, offering the most dramatic panoramic sunset vistas of Jaipur.' },
            { name: 'Johari & Bapu Bazaar Textile Hub', category: 'shopping', lat: 26.9205, lng: 75.8230, address: 'Bapu Bazaar, Pink City, Jaipur, Rajasthan 302003', price: 2500, duration: 120, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', desc: 'Renowned traditional market for Sanganeri hand block printed quilts, bedspreads, and silver jewelry.' },
          ],
          notes_items: [{ text: 'Evening Vande Bharat train departs Jaipur Junction at 18:00.', time: '17:15', icon: '🚆' }]
        }
      ],
      budget: [
        { category: 'Transport', name: 'Vande Bharat Express AC Chair Car Return', total_price: 2400, note: 'Delhi to Jaipur fast connection' },
        { category: 'Stay', name: 'Alsisar Haveli Heritage Hotel (2 Nights)', total_price: 11000, note: 'Traditional royal room with pool & courtyards' },
        { category: 'Transport', name: 'Private AC Cab for Sightseeing (3 Days)', total_price: 4500, note: 'Includes Amber & Nahargarh hill climbs' },
        { category: 'Food & Dining', name: 'Royal Rajput Thalis & Heritage Dining', total_price: 3800, note: 'Dal Baati Churma, Ker Sangri, and sweets' },
        { category: 'Shopping', name: 'Jaipuri Razai (Quilts) & Block Print Linen', total_price: 4200, note: 'Authentic artisan cooperative purchase' },
      ],
      packing: [
        { name: 'Comfortable walking sneakers for stone forts', category: 'Clothing', checked: 1 },
        { name: 'Cotton scarves & sunscreen for midday sun', category: 'Accessories', checked: 1 },
        { name: 'Mirrorless camera with wide-angle lens', category: 'Gear & Electronics', checked: 1 },
        { name: 'Compact daypack for water bottle & guidebook', category: 'Gear & Electronics', checked: 1 },
      ],
      reservation: {
        title: 'Alsisar Haveli Heritage Hotel Check-in',
        type: 'hotel',
        location: 'Sansar Chandra Rd, Pink City, Jaipur',
        confirmation_number: 'AH-JAIPUR-2026',
        reservation_time: '12:00',
        notes: 'Restored 18th-century Rajput palace room overlooking the manicured garden courtyard.'
      }
    },
    {
      title: 'Rishikesh Weekend – White Water Rafting & Ganga Aarti',
      description: '[DEMO_DATA] 2-day rejuvenating spiritual and adventure weekend in the foothills of the Himalayas: 16km Ganga rafting, cliff jumping, Beatles Ashram graffiti walk, and divine Parmarth Niketan sunset aarti.',
      start_date: '2026-11-28',
      end_date: '2026-11-29',
      currency: 'INR',
      cover_image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=1200&q=80',
      region_code: 'IN-UT',
      region_name: 'Uttarakhand',
      days: [
        {
          day_number: 1, date: '2026-11-28', title: 'White Water Rafting & Parmarth Niketan Aarti',
          notes: 'Conquer thrilling Grade III rapids on holy Ganga, followed by world-famous sunset river aarti.',
          places: [
            { name: 'Shivpuri Rafting Launch Point', category: 'activity', lat: 30.1340, lng: 78.3880, address: 'Shivpuri, Rishikesh, Uttarakhand 249192', price: 1200, duration: 180, image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80', desc: '16km exhilarating white water run through famous rapids: Roller Coaster, Golf Course, and Clubhouse.' },
            { name: 'Parmarth Niketan Ganga Aarti', category: 'attraction', lat: 30.1190, lng: 78.3120, address: 'Parmarth Niketan Ashram, Swargashram, Rishikesh, UK 249304', price: 0, duration: 90, image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80', desc: 'Mesmerizing evening prayer ritual with floating earthen diyas, Vedic chants, and sacred river reflections.' },
            { name: 'Chotiwala Heritage Restaurant', category: 'restaurant', lat: 30.1200, lng: 78.3140, address: 'Swargashram, Ram Jhula, Rishikesh, Uttarakhand 249304', price: 500, duration: 60, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Iconic satvik vegetarian restaurant operating since 1958, famous for authentic Garhwali thali and lassi.' },
          ],
          notes_items: [{ text: 'Wear nylon/dry-fit clothing for rafting; no cotton clothes permitted.', time: '09:00', icon: '🚣' }]
        },
        {
          day_number: 2, date: '2026-11-29', title: 'The Beatles Ashram & Neer Garh Waterfall',
          notes: 'Visit historic Chaurasi Kutia ashram where the Beatles stayed in 1968, and short hike to turquoise cascade.',
          places: [
            { name: 'The Beatles Ashram (Chaurasi Kutia)', category: 'attraction', lat: 30.1130, lng: 78.3160, address: 'Rajaji Tiger Reserve, Swargashram, Rishikesh 249304', price: 150, duration: 120, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80', desc: 'Forest hermitage with 84 stone meditation domes covered in psychedelic murals and Beatles quotes.' },
            { name: 'Neer Garh Natural Waterfall', category: 'nature', lat: 30.1420, lng: 78.3320, address: 'Neergarh Waterfall Trail, Rishikesh, Uttarakhand 249137', price: 50, duration: 120, image: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=800&q=80', desc: 'Series of 3 pristine natural forest waterfalls with cold mountain plunge pools.' },
          ],
          notes_items: [{ text: 'Afternoon self-drive departure via Haridwar bypass.', time: '16:00', icon: '🚗' }]
        }
      ],
      budget: [
        { category: 'Transport', name: 'Private Self-Drive Fuel & Tolls', total_price: 2800, note: 'Delhi - Meerut Expressway - Rishikesh' },
        { category: 'Stay', name: 'Riverside Glamping Resort Camp (1 Night)', total_price: 5500, note: 'AC luxury safari tent with all 3 meals included' },
        { category: 'Activities', name: '16km Shivpuri Rafting & Cliff Jump', total_price: 2400, note: 'Includes life jackets, guide, and GoPro video' },
        { category: 'Food & Dining', name: 'Organic Cafes in Tapovan', total_price: 1600, note: 'Ayurvedic smoothies, pizza, and herbal teas' },
      ],
      packing: [
        { name: 'Dry-fit t-shirt and quick-dry boardshorts', category: 'Clothing', checked: 1 },
        { name: 'Water shoes or strapped floaters', category: 'Clothing', checked: 1 },
        { name: 'Waterproof phone neck pouch', category: 'Gear & Electronics', checked: 1 },
        { name: 'Warm fleece hoodie for crisp river mornings', category: 'Clothing', checked: 1 },
      ],
      reservation: {
        title: 'Camp River Rock Luxury Glamping Check-in',
        type: 'hotel',
        location: 'Kaudiyala Riverside, Rishikesh',
        confirmation_number: 'CRR-RISH-1102',
        reservation_time: '12:00',
        notes: 'Riverside luxury dome tent with bonfire, buffet dinner and morning yoga included.'
      }
    },
    {
      title: 'Kashmir Exploration – Gulmarg Snows & Dal Lake Shikarar',
      description: '[DEMO_DATA] 7-day winter fairytale in paradise: handcrafted luxury cedar houseboat stay, world second highest gondola in Gulmarg, snow meadows of Baisaran, and saffron fields of Pampore.',
      start_date: '2027-01-15',
      end_date: '2027-01-21',
      currency: 'INR',
      cover_image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      region_code: 'IN-JK',
      region_name: 'Jammu & Kashmir',
      days: [
        {
          day_number: 1, date: '2027-01-15', title: 'Arrival Srinagar & Heritage Houseboat Check-in',
          notes: 'Fly into snow-covered Srinagar, Shikara ride to luxury carved houseboat on Dal Lake and hot Kahwa.',
          places: [
            { name: 'Dal Lake Shikara Cruise & Floating Market', category: 'activity', lat: 34.0837, lng: 74.8370, address: 'Boulevard Rd, Dal Lake, Srinagar, J&K 190001', price: 1000, duration: 120, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', desc: 'Glide across mirrored waters past wooden lotus gardens and snow covered Pir Panjal mountains.' },
            { name: 'Ahdoos Traditional Wazwan', category: 'restaurant', lat: 34.0720, lng: 74.8110, address: 'Residency Rd, Regal Chowk, Srinagar, J&K 190001', price: 1400, duration: 90, image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', desc: 'Legendary restaurant established in 1918, celebrated for authentic Rogan Josh, Rista, and Gushtaba.' },
          ],
          notes_items: [{ text: 'Drink warm Kashmiri Kahwa with crushed almonds on arrival.', time: '15:00', icon: '☕' }]
        },
        {
          day_number: 2, date: '2027-01-16', title: 'Mughal Gardens – Nishat & Shalimar Bagh',
          notes: 'Walk through royal terraced gardens designed by Mughal emperors with stone water fountains and Chinar trees.',
          places: [
            { name: 'Nishat Bagh (Garden of Bliss)', category: 'attraction', lat: 34.1250, lng: 74.8810, address: 'Nishat, Srinagar, Jammu and Kashmir 190019', price: 50, duration: 90, image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', desc: '12-terraced garden built in 1633, rising dramatically against the backdrop of Zabarwan mountains.' },
            { name: 'Shalimar Bagh (Crown of Srinagar)', category: 'attraction', lat: 34.1480, lng: 74.8720, address: 'Shalimar, Srinagar, Jammu and Kashmir 190025', price: 50, duration: 90, image: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80', desc: 'Built by Emperor Jahangir for Empress Nur Jahan, linked to Dal lake by a 1.6km long canal.' },
          ],
          notes_items: [{ text: 'Photography session in traditional Kashmiri Pheran costume.', time: '11:00', icon: '📸' }]
        },
        {
          day_number: 3, date: '2027-01-17', title: 'Gulmarg Gondola Ride to Apharwat Peak',
          notes: 'Drive through pine country to Gulmarg and board world second-highest cable car to 13,780 feet.',
          places: [
            { name: 'Gulmarg Gondola Cable Car (Phase 1 & 2)', category: 'activity', lat: 34.0530, lng: 74.3820, address: 'Gulmarg Gondola Station, Baramulla, J&K 193403', price: 2000, duration: 240, image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80', desc: 'High-altitude cable car whisking visitors through pine clouds directly onto powder ski slopes of Apharwat peak.' },
            { name: 'Highlands Park Vintage Lounge', category: 'restaurant', lat: 34.0510, lng: 74.3850, address: 'Near Church, Gulmarg, Jammu and Kashmir 193403', price: 1600, duration: 90, image: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&w=800&q=80', desc: 'Historic alpine hotel lounge famous for its log fires, vintage skiing memorabilia, and hot toddies.' },
          ],
          notes_items: [{ text: 'Book Phase 2 tickets 1 month prior online; identity proof mandatory.', time: '09:00', icon: '🚡' }]
        },
        {
          day_number: 4, date: '2027-01-18', title: 'Gulmarg Powder Skiing & Snowshoeing',
          notes: 'Beginner ski lesson on gentle slopes with certified instructor and snowmobile adventure.',
          places: [
            { name: 'Gulmarg Ski Training Slopes', category: 'activity', lat: 34.0500, lng: 74.3800, address: 'Main Meadow Slopes, Gulmarg 193403', price: 2500, duration: 180, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80', desc: 'World renowned powder skiing arena with equipment rental, ski instructors, and gentle rolling trails.' },
            { name: 'St. Mary Historic Church', category: 'attraction', lat: 34.0480, lng: 74.3880, address: 'Near Golf Course, Gulmarg 193403', price: 0, duration: 45, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', desc: '100-year-old Victorian-era stone church nestled alone in deep snow meadow with alpine bell tower.' },
          ],
          notes_items: [{ text: 'Rent snow boots and ski goggles from J&K Tourism counter.', time: '10:00', icon: '⛷️' }]
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
      ],
      reservation: {
        title: 'Rainbow Cruises Luxury Houseboat Boarding',
        type: 'hotel',
        location: 'Punnamada Jetty, Finishing Point, Alleppey',
        confirmation_number: 'RBC-ALEP-7731',
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
  let skippedTripCount = 0;

  const tripTx = db.transaction(() => {
    for (const t of demoTripsData) {
      const existingTrip = db.prepare('SELECT id FROM trips WHERE user_id = ? AND title = ?').get(adminUser!.id, t.title);
      if (existingTrip) {
        skippedTripCount++;
        continue;
      }

      const tripRes = insertTrip.run(
        adminUser!.id,
        t.title,
        t.description,
        t.start_date,
        t.end_date,
        t.currency,
        t.cover_image
      );
      const tripId = Number(tripRes.lastInsertRowid);
      createdTripCount++;

      let firstDayId: number | null = null;

      for (const d of t.days) {
        const dayRes = insertDay.run(tripId, d.day_number, d.date, d.title, d.notes);
        const dayId = Number(dayRes.lastInsertRowid);
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
            const placeId = Number(placeRes.lastInsertRowid);

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

      if (t.budget) {
        let bIdx = 0;
        for (const b of t.budget) {
          insertBudget.run(tripId, b.category, b.name, b.total_price, b.note, bIdx++);
        }
      }

      if (t.packing) {
        let pIdx = 0;
        for (const p of t.packing) {
          insertPacking.run(tripId, p.name, p.checked, p.category, pIdx++);
        }
      }

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
  });

  tripTx();

  logger(`Trips: ${createdTripCount} created, ${skippedTripCount} skipped (already present).`);

  // 7. Saved Destinations (Bucket List)
  const demoBucketList = [
    { name: 'Pangong Tso High-Altitude Lake, Ladakh', lat: 33.7595, lng: 78.6674, country_code: 'IN', notes: '[DEMO] Pristine turquoise saline lake at 14,000 ft, best explored via Nubra Valley pass.' },
    { name: 'Hampi UNESCO Ruins & Boulder Valley, Karnataka', lat: 15.3350, lng: 76.4600, country_code: 'IN', notes: '[DEMO] Ancient Vijayanagara empire monuments, Virupaksha temple, and scenic Tungabhadra sunsets.' },
    { name: 'Valley of Flowers National Park, Uttarakhand', lat: 30.7280, lng: 79.6053, country_code: 'IN', notes: '[DEMO] UNESCO world heritage alpine meadow in full bloom with rare Himalayan flora in July-August.' },
    { name: 'Ziro Valley Cultural Landscape, Arunachal Pradesh', lat: 27.5956, lng: 93.8315, country_code: 'IN', notes: '[DEMO] Serene pine-clad valleys, sustainable paddy fish-cultivation, and Apatani tribal heritage.' },
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

  // 8. In-App Notifications
  const demoNotifications = [
    {
      type: 'simple',
      scope: 'trip',
      title_key: 'demo.notif.manali_prep',
      text_key: 'demo.notif.manali_prep_body',
      title_params: JSON.stringify({ trip: 'Manali Adventure' }),
      text_params: JSON.stringify({ text: 'Your Manali Adventure starts in 18 days! Check your packing list for thermal gear.' }),
      is_read: 0,
    },
    {
      type: 'simple',
      scope: 'user',
      title_key: 'demo.notif.vol_accepted',
      text_key: 'demo.notif.vol_accepted_body',
      title_params: JSON.stringify({ opp: 'Mountain Trail Cleanup' }),
      text_params: JSON.stringify({ text: 'Great news! Clean Himalayas Foundation has ACCEPTED your Volunteer Yatra application.' }),
      is_read: 0,
    },
    {
      type: 'simple',
      scope: 'user',
      title_key: 'demo.notif.rewards_milestone',
      text_key: 'demo.notif.rewards_milestone_body',
      title_params: JSON.stringify({ points: '2,450' }),
      text_params: JSON.stringify({ text: 'You achieved 2,450 reward points! You are currently ranked #4 on the traveler leaderboard.' }),
      is_read: 1,
    },
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

  // 9. Recent Audit Log Entries
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

  logger(`SUCCESS! Seeded demo data for admin ${adminUser.username} (${adminUser.email}). Balance: ${adminBalance} points.`);

  return {
    success: true,
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    adminUsername: adminUser.username,
    tripsInserted: createdTripCount,
    tripsSkipped: skippedTripCount,
    pointsBalance: adminBalance,
    leaderboardCount: demoLeaderboardUsers.length + 1,
    opportunitiesCount: demoOpportunities.length,
    message: `Successfully populated ${createdTripCount} trips (skipped ${skippedTripCount}), ${adminBalance} points, ${demoOpportunities.length} volunteer opportunities for admin ${adminUser.email}.`,
  };
}
