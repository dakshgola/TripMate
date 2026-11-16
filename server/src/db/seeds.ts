import Database from 'better-sqlite3';
import crypto from 'crypto';
import { readEnv } from '../app-config';
import { seedDocumentProviders } from './document-provider-seed';

// bcrypt cost factor for the seeded admin password — kept in sync with authService.
const BCRYPT_COST = 12;

// Seeds run at startup before the DB admin panel can be used, so only env vars
// are checked here. The granular password_login/password_registration DB toggles
// are only relevant after the first user exists; at that point seeds have already
// finished and skip via the userCount > 0 guard above.
function isOidcOnlyConfigured(): boolean {
  const oidc = readEnv().oidc;
  if (!oidc.only) return false;
  return !!(oidc.issuer && oidc.clientId);
}

function seedAdminAccount(db: Database.Database): void {
  try {
    const env_admin_email = readEnv().adminBootstrap.email;
    const env_admin_pw = readEnv().adminBootstrap.password;
    const adminEnvProvided = !!(env_admin_email || env_admin_pw);

    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    if (userCount > 0) {
      // ADMIN_EMAIL/ADMIN_PASSWORD only take effect on the first run (empty database). Once a
      // user exists they are silently ignored — a common trip-up: people add the vars after the
      // fact, restart, nothing changes, and there is no hint why. Say so instead of staying silent.
      if (adminEnvProvided) {
        console.warn('[admin] ADMIN_EMAIL/ADMIN_PASSWORD are set, but users already exist — these only apply on first run (empty database) and are being ignored.');
        console.warn('[admin] Change an existing password from Settings after signing in, reset the admin (see the Troubleshooting wiki), or start with an empty data volume to re-run setup.');
      }
      return;
    }

    // Demo mode seeds its own admin (admin@trek.app, username 'admin') right after this.
    // Creating a first-run admin here would grab username 'admin' first and make the demo
    // seeder fail on the UNIQUE(username) constraint, leaving the demo user uncreated.
    if (readEnv().demo.enabled) return;

    if (isOidcOnlyConfigured()) {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║  TREK — OIDC-Only Mode                       ║');
      console.log('║  First SSO login will become admin.           ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
      return;
    }

    const bcrypt = require('bcryptjs');

    let password: string;
    let email: string;
    if (env_admin_email && env_admin_pw) {
      password = env_admin_pw;
      email = env_admin_email;
    } else {
      // A partial config (only one of the two) is an easy mistake: neither value is used and a
      // generated password is created instead. Flag it so the chosen credentials silently not
      // working isn't a surprise.
      if (adminEnvProvided) {
        console.warn('[admin] Only one of ADMIN_EMAIL/ADMIN_PASSWORD is set — both are required for a custom admin. Falling back to admin@trek.local with a generated password (shown below).');
      }
      password = crypto.randomBytes(12).toString('base64url');
      email = 'admin@trek.local';
    }

    const hash = bcrypt.hashSync(password, BCRYPT_COST);
    const username = 'admin';

    db.prepare('INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)').run(username, email, hash, 'admin');

    const isProd = readEnv().app.isProduction;
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  TREK — First Run: Admin Account Created     ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Email:    ${email.padEnd(33)}║`);
    if (isProd && !adminEnvProvided) {
      console.log('║  Password: [PROTECTED IN PRODUCTION LOGS]    ║');
    } else {
      console.log(`║  Password: ${password.padEnd(33)}║`);
    }
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  } catch (err: unknown) {
    console.error('[ERROR] Error seeding admin account:', err instanceof Error ? err.message : err);
  }
}

function seedCategories(db: Database.Database): void {
  try {
    const existingCats = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
    if (existingCats.count === 0) {
      const defaultCategories = [
        { name: 'Hotel', color: '#3b82f6', icon: '🏨' },
        { name: 'Restaurant', color: '#ef4444', icon: '🍽️' },
        { name: 'Attraction', color: '#8b5cf6', icon: '🏛️' },
        { name: 'Shopping', color: '#f59e0b', icon: '🛍️' },
        { name: 'Transport', color: '#6b7280', icon: '🚌' },
        { name: 'Activity', color: '#10b981', icon: '🎯' },
        { name: 'Bar/Cafe', color: '#f97316', icon: '☕' },
        { name: 'Beach', color: '#06b6d4', icon: '🏖️' },
        { name: 'Nature', color: '#84cc16', icon: '🌿' },
        { name: 'Other', color: '#6366f1', icon: '📍' },
      ];
      const insertCat = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
      for (const cat of defaultCategories) insertCat.run(cat.name, cat.color, cat.icon);
      console.log('Default categories seeded');
    }
  } catch (err: unknown) {
    console.error('Error seeding categories:', err instanceof Error ? err.message : err);
  }
}

function seedAddons(db: Database.Database): void {
  try {
    const defaultAddons = [
      { id: 'packing', name: 'Lists', description: 'Packing lists and to-do tasks for your trips', type: 'trip', icon: 'ListChecks', enabled: 1, sort_order: 0 },
      { id: 'budget', name: 'Costs', description: 'Track and split trip expenses', type: 'trip', icon: 'Wallet', enabled: 1, sort_order: 1 },
      { id: 'documents', name: 'Documents', description: 'Store and manage travel documents', type: 'trip', icon: 'FileText', enabled: 1, sort_order: 2 },
      { id: 'vacay', name: 'Vacay', description: 'Personal vacation day planner with calendar view', type: 'global', icon: 'CalendarDays', enabled: 1, sort_order: 10 },
      { id: 'atlas', name: 'Atlas', description: 'World map of your visited countries with travel stats', type: 'global', icon: 'Globe', enabled: 1, sort_order: 11 },
      { id: 'mcp', name: 'MCP', description: 'Model Context Protocol for AI assistant integration', type: 'integration', icon: 'Terminal', enabled: 0, sort_order: 12 },
      { id: 'naver_list_import', name: 'Naver List Import', description: 'Import places from a shared Naver Maps list', type: 'integration', icon: 'Link2', enabled: 1, sort_order: 13 },
      { id: 'collab', name: 'Collab', description: 'Notes, polls, and live chat for trip collaboration', type: 'trip', icon: 'Users', enabled: 1, sort_order: 6 },
      { id: 'roadtrip', name: 'Road trip', description: 'Drives with stops along the route, driving times, and arrival times that update themselves', type: 'trip', icon: 'Route', enabled: 0, sort_order: 7 },
      { id: 'journey', name: 'Journey', description: 'Trip tracking & travel journal — check-ins, photos, daily stories', type: 'global', icon: 'Compass', enabled: 0, sort_order: 35 },
      { id: 'airtrail', name: 'AirTrail', description: 'Sync flights from your AirTrail instance', type: 'integration', icon: 'Plane', enabled: 0, sort_order: 14 },
      { id: 'dawarich', name: 'Dawarich', description: 'Read visits and recorded routes from your Dawarich instance — suggested journal entries, places and countries you confirm yourself', type: 'integration', icon: 'Dawarich', enabled: 0, sort_order: 17 },
      { id: 'llm_parsing', name: 'AI Parsing', description: 'LLM fallback for booking imports kitinerary cannot read', type: 'integration', icon: 'Sparkles', enabled: 0, sort_order: 15 },
      { id: 'collections', name: 'Collections', description: 'Personal place library — save places across trips into named lists, copy into any trip, share with others', type: 'global', icon: 'Bookmark', enabled: 0, sort_order: 16 },
    ];
    const insertAddon = db.prepare('INSERT OR IGNORE INTO addons (id, name, description, type, icon, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const a of defaultAddons) insertAddon.run(a.id, a.name, a.description, a.type, a.icon, a.enabled, a.sort_order);

    const providerRows = [
      {
        id: 'immich',
        name: 'Immich',
        description: 'Immich photo provider',
        icon: 'Image',
        enabled: 0,
        sort_order: 0,
      },
      {
        id: 'synologyphotos',
        name: 'Synology Photos',
        description: 'Synology Photos integration with separate account settings',
        icon: 'Image',
        enabled: 0,
        sort_order: 1,
      },
    ];
    const insertProvider = db.prepare('INSERT OR IGNORE INTO photo_providers (id, name, description, icon, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    for (const p of providerRows) insertProvider.run(p.id, p.name, p.description, p.icon, p.enabled, p.sort_order);

    const providerFields = [
      { provider_id: 'immich', field_key: 'immich_url', label: 'providerUrl', input_type: 'url', placeholder: 'https://immich.example.com', hint: null, required: 1, secret: 0, settings_key: 'immich_url', payload_key: 'immich_url', sort_order: 0 },
      { provider_id: 'immich', field_key: 'immich_api_key', label: 'providerApiKey', input_type: 'password', placeholder: 'API Key', hint: null, required: 1, secret: 1, settings_key: null, payload_key: 'immich_api_key', sort_order: 1 },
      { provider_id: 'immich', field_key: 'immich_allow_insecure_tls', label: 'skipSSLVerification', input_type: 'checkbox', placeholder: null, hint: null, required: 0, secret: 0, settings_key: 'allow_insecure_tls', payload_key: 'allow_insecure_tls', sort_order: 2 },
      { provider_id: 'immich', field_key: 'immich_auto_upload', label: 'immichAutoUpload', input_type: 'checkbox', placeholder: null, hint: null, required: 0, secret: 0, settings_key: 'auto_upload', payload_key: 'auto_upload', sort_order: 5 },
      { provider_id: 'synologyphotos', field_key: 'synology_url', label: 'providerUrl', input_type: 'url', placeholder: 'https://synology.example.com/photo', hint: 'providerUrlHintSynology', required: 1, secret: 0, settings_key: 'synology_url', payload_key: 'synology_url', sort_order: 0 },
      { provider_id: 'synologyphotos', field_key: 'synology_username', label: 'providerUsername', input_type: 'text', placeholder: 'Username', hint: null, required: 1, secret: 0, settings_key: 'synology_username', payload_key: 'synology_username', sort_order: 1 },
      { provider_id: 'synologyphotos', field_key: 'synology_password', label: 'providerPassword', input_type: 'password', placeholder: 'Password', hint: null, required: 1, secret: 1, settings_key: null, payload_key: 'synology_password', sort_order: 2 },
      { provider_id: 'synologyphotos', field_key: 'synology_otp', label: 'providerOTP', input_type: 'text', placeholder: '123456', hint: null, required: 0, secret: 0, settings_key: null, payload_key: 'synology_otp', sort_order: 3 },
      { provider_id: 'synologyphotos', field_key: 'synology_skip_ssl', label: 'skipSSLVerification', input_type: 'checkbox', placeholder: null, hint: null, required: 0, secret: 0, settings_key: 'synology_skip_ssl', payload_key: 'synology_skip_ssl', sort_order: 4 },
    ];
    const insertProviderField = db.prepare('INSERT OR IGNORE INTO photo_provider_fields (provider_id, field_key, label, input_type, placeholder, hint, required, secret, settings_key, payload_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const f of providerFields) {
      insertProviderField.run(f.provider_id, f.field_key, f.label, f.input_type, f.placeholder, f.hint, f.required, f.secret, f.settings_key, f.payload_key, f.sort_order);
    }

    // Document providers live in their own pair of tables (see the migration
    // for why they are not a `kind` column on photo_providers). Seeded from the
    // same helper the migration uses, so a fresh install and an upgraded one
    // agree.
    seedDocumentProviders(db);

    console.log('Default addons seeded');
  } catch (err: unknown) {
    console.error('Error seeding addons:', err instanceof Error ? err.message : err);
  }
}

function seedVolunteerOpportunities(db: Database.Database): void {
  try {
    const count = (db.prepare('SELECT COUNT(*) as count FROM volunteer_opportunities').get() as { count: number }).count;
    if (count > 0) return;

    const opportunities = [
      {
        id: 'rishikesh-content-nomad',
        title: 'Visual Storyteller & Content Creator at Riverside Camps',
        host_name: 'Ganga Whispers Eco-Resort',
        location: 'Kaudiyala, Rishikesh',
        state: 'Uttarakhand',
        region: 'Uttarakhand',
        category: 'content',
        duration: '3 Weeks - 2 Months',
        stipend: '₹12,000 / month',
        perks: JSON.stringify(['Free Wooden Cottage Stay', '3 Organic Buffet Meals', 'Rafting Passes', '100 Mbps Starlink WiFi']),
        skills: JSON.stringify(['Reels & Video Editing', 'Drone/DSLR Photography', 'Canva / Social Media']),
        hours_per_day: '3-4 hrs / day',
        min_commitment: '21 Days',
        spots_left: 2,
        rating: 4.9,
        review_count: 38,
        image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
        description: 'Live right on the banks of holy river Ganga. Capture the serene morning aartis, riverside yoga sessions, and adventure rafting thrills while creating engaging social media content.',
        responsibilities: JSON.stringify([
          'Create 4-5 high quality Instagram Reels per week',
          'Photograph guest experiences and camp amenities',
          'Manage daily Instagram stories and engage with travel community',
        ]),
        what_you_get: JSON.stringify([
          'Private river-facing luxury tent/cottage',
          'All daily meals & snacks from the organic camp kitchen',
          'Complimentary river rafting and cliff jumping sessions',
          'Official Certificate of Media Residency & ₹12,000 monthly stipend',
        ]),
        verified: 0,
      },
      {
        id: 'manali-hostel-host',
        title: 'Hostel Experience & Community Manager at Himalayan Den',
        host_name: 'The Himalayan Nomad Hostel',
        location: 'Old Manali',
        state: 'Himachal Pradesh',
        region: 'Himachal',
        category: 'hostel',
        duration: '4 Weeks - 3 Months',
        stipend: '₹10,000 / month',
        perks: JSON.stringify(['Private Attic Room', 'Unlimited Cafe Food & Chai', 'Trek Gear Access', 'High-Speed Fiber Net']),
        skills: JSON.stringify(['Community Hosting', 'Acoustic Jam Sessions', 'Guest Relations', 'Event Planning']),
        hours_per_day: '4 hrs / day',
        min_commitment: '1 Month',
        spots_left: 1,
        rating: 4.95,
        review_count: 52,
        image_url: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=800&q=80',
        description: 'Immerse yourself in apple orchards and snow peaks of Old Manali. Organize bonfire evenings, board game nights, and guided village walks for backpackers from all over the world.',
        responsibilities: JSON.stringify([
          'Welcome arriving travelers and introduce them to Old Manali hidden gems',
          'Host evening bonfires, live jamming and pub crawls',
          'Coordinate with housekeeping and local trek guides',
        ]),
        what_you_get: JSON.stringify([
          'Cozy wooden attic room with balcony facing snow peaks',
          'Full meals from the in-house rooftop cafe',
          'Free rental of mountain bikes and trekking gear',
          '₹10,000/mo pocket allowance',
        ]),
        verified: 0,
      },
      {
        id: 'dehradun-wall-mural-residency',
        title: 'Vibrant Wall Murals & Cafe Art Residency in the Foothills',
        host_name: 'Jungle Bloom Art Cafe & Homestay',
        location: 'Dehradun Foothills',
        state: 'Uttarakhand',
        region: 'Uttarakhand',
        category: 'art',
        duration: '2 Weeks - 4 Weeks',
        stipend: '₹15,000 project bonus',
        perks: JSON.stringify(['Private Art Studio', 'Artisan Coffee & Meals', 'Free Art Supplies', 'Mountain View Deck']),
        skills: JSON.stringify(['Wall Murals & Acrylics', 'Creative Lettering', 'Visual Designing']),
        hours_per_day: '3-4 hrs / day',
        min_commitment: '14 Days',
        spots_left: 2,
        rating: 4.88,
        review_count: 29,
        image_url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
        description: 'Turn white walls into vibrant stories of Himalayan flora, wildlife and wanderlust. An inspiring residency with all painting materials and canvas provided.',
        responsibilities: JSON.stringify([
          'Paint 2-3 feature wall murals across the cafe courtyard',
          'Design artistic blackboard menu displays',
          'Host an informal weekend art workshop for homestay guests',
        ]),
        what_you_get: JSON.stringify([
          'Independent artist suite overlooking Sal forest',
          'All painting supplies, paints and brushes sponsored',
          'Unlimited espresso, bakery treats & home-cooked meals',
          '₹15,000 completion honorarium',
        ]),
        verified: 0,
      },
      {
        id: 'kerala-organic-permaculture',
        title: 'Organic Tea & Permaculture Volunteer in God’s Own Country',
        host_name: 'Spice Valley Bio-Farm',
        location: 'Munnar / Wayanad',
        state: 'Kerala',
        region: 'Kerala',
        category: 'farming',
        duration: '3 Weeks - 6 Weeks',
        stipend: '₹8,500 / month',
        perks: JSON.stringify(['Treehouse Stay', 'Farm-to-table Kerala Meals', 'Daily Morning Yoga', 'Spice Tour Guide']),
        skills: JSON.stringify(['Eco-Gardening', 'Organic Farming', 'Herbal Plant Knowledge', 'Nature Enthusiast']),
        hours_per_day: '3 hrs / day',
        min_commitment: '20 Days',
        spots_left: 3,
        rating: 4.92,
        review_count: 44,
        image_url: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=800&q=80',
        description: 'Live surrounded by misty rolling tea hills and spice plantations. Learn sustainable farming, harvest black pepper & cardamom, and experience tranquil village life.',
        responsibilities: JSON.stringify([
          'Help maintain organic herbal beds and nursery',
          'Assist in tea plucking and artisanal spice processing',
          'Accompany guests on tranquil nature trail walks',
        ]),
        what_you_get: JSON.stringify([
          'Rustic traditional treehouse accommodation',
          'Authentic Kerala meals served on fresh banana leaves',
          'Complimentary Ayurvedic rejuvenation massage once a week',
          '₹8,500 monthly travel stipend',
        ]),
        verified: 0,
      },
      {
        id: 'goa-sunset-yoga-wellness',
        title: 'Sunset Beach Yoga & Wellness Host in South Goa',
        host_name: 'Nirvana Ocean Breeze Retreat',
        location: 'Palolem Beach, South Goa',
        state: 'Goa',
        region: 'Goa',
        category: 'yoga',
        duration: '1 Month - 3 Months',
        stipend: '₹18,000 / month',
        perks: JSON.stringify(['Beachfront Wooden Shack', 'Healthy Smoothies & Meals', 'Scooty Provided', 'Ocean Views']),
        skills: JSON.stringify(['Hatha / Vinyasa Yoga', 'Breathwork & Meditation', 'Warm Guest Interactions']),
        hours_per_day: '3 hrs / day',
        min_commitment: '30 Days',
        spots_left: 1,
        rating: 4.98,
        review_count: 61,
        image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
        description: 'Wake up to the sound of crashing waves and coconut palms. Lead relaxing morning and sunset yoga sessions on the white sands of Palolem.',
        responsibilities: JSON.stringify([
          'Lead 1 morning and 1 sunset gentle yoga / pranayama class daily',
          'Create a warm, peaceful atmosphere for wellness retreat guests',
          'Assist in arranging beach detox workshops',
        ]),
        what_you_get: JSON.stringify([
          'Private beach shack 20 steps from the water',
          'Fresh fruit bowls, smoothies and all meals',
          'Honda Activa / Scooty with fuel provided for local exploration',
          '₹18,000 monthly coaching stipend',
        ]),
        verified: 0,
      },
      {
        id: 'rajasthan-haveli-music-events',
        title: 'Acoustic Performer & Cultural Night Host at Heritage Haveli',
        host_name: 'Desert Dune Cultural Club',
        location: 'Pushkar / Jodhpur',
        state: 'Rajasthan',
        region: 'Rajasthan',
        category: 'music',
        duration: '2 Weeks - 2 Months',
        stipend: '₹14,000 / month',
        perks: JSON.stringify(['Heritage Haveli Suite', 'Royal Rajasthani Thali', 'Desert Safari Excursions', 'Musical Stage']),
        skills: JSON.stringify(['Guitar / Vocals', 'Jam Session Hosting', 'Stage Management', 'Enthusiastic Performer']),
        hours_per_day: '2.5 hrs / day',
        min_commitment: '15 Days',
        spots_left: 2,
        rating: 4.86,
        review_count: 31,
        image_url: 'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?auto=format&fit=crop&w=800&q=80',
        description: 'Perform under starry desert skies in a 200-year-old carved sandstone courtyard. Bring travelers together with soul-stirring melodies and acoustic jam nights.',
        responsibilities: JSON.stringify([
          'Host 4-5 evening acoustic rooftop sessions per week',
          'Collaborate with local Rajasthani folk artists (Sarangi & Khartal players)',
          'Organize open-mic evenings for travelers',
        ]),
        what_you_get: JSON.stringify([
          'Royal heritage suite with jharokha balcony',
          'Grand Rajasthani breakfast and dinner daily',
          'Desert camel safari and overnight camp passes',
          '₹14,000 monthly performance stipend',
        ]),
        verified: 0,
      },
      {
        id: 'spiti-digital-nomad-dev',
        title: 'Full-Stack Web Dev & Tech Nomad Residency at 10,000 ft',
        host_name: 'Alt-Life Mountain Coliving',
        location: 'Dharamkot / Spiti Valley',
        state: 'Himachal Pradesh',
        region: 'Himachal',
        category: 'tech',
        duration: '1 Month - 6 Months',
        stipend: '₹20,000 / month',
        perks: JSON.stringify(['Private Studio Apartment', 'Dedicated 200 Mbps Desk', 'Unlimited Specialty Coffee', 'Heated Rooms']),
        skills: JSON.stringify(['React / TypeScript', 'Web Optimization', 'CMS & Automation']),
        hours_per_day: '3-4 hrs / day',
        min_commitment: '30 Days',
        spots_left: 1,
        rating: 4.97,
        review_count: 47,
        image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
        description: 'Code with panoramic Himalayan views, high-speed fiber internet and wood-fired heaters. Help upgrade internal booking systems while living the dream mountain workation.',
        responsibilities: JSON.stringify([
          'Maintain and polish the community website and automated booking flows',
          'Help troubleshoot local tech/wifi hardware setup if needed',
          'Share tech insights in monthly community meetups',
        ]),
        what_you_get: JSON.stringify([
          'Furnished mountain studio with heating & ergonomic workstation',
          'Unlimited gourmet coffee, breakfast and meals',
          'Weekend guided high-altitude treks',
          '₹20,000 monthly stipend',
        ]),
        verified: 0,
      },
    ];

    const insert = db.prepare(`
      INSERT OR REPLACE INTO volunteer_opportunities (
        id, title, host_name, location, state, region, category, duration, stipend,
        perks, skills, hours_per_day, min_commitment, spots_left, rating, review_count,
        image_url, description, responsibilities, what_you_get, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const o of opportunities) {
      insert.run(
        o.id, o.title, o.host_name, o.location, o.state, o.region, o.category, o.duration, o.stipend,
        o.perks, o.skills, o.hours_per_day, o.min_commitment, o.spots_left, o.rating, o.review_count,
        o.image_url, o.description, o.responsibilities, o.what_you_get, o.verified
      );
    }
    console.log('Volunteer opportunities seeded');
  } catch (err: unknown) {
    console.error('Error seeding volunteer opportunities:', err instanceof Error ? err.message : err);
  }
}

function runSeeds(db: Database.Database): void {
  seedAdminAccount(db);
  seedCategories(db);
  seedAddons(db);
  seedVolunteerOpportunities(db);
}

export { runSeeds, seedAdminAccount };
