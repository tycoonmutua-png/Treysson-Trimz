require('dotenv').config();
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding database...');

    // Check if already seeded
    const { rows } = await client.query('SELECT COUNT(*) FROM services');
    if (parseInt(rows[0].count) > 0) {
      console.log('⚠️  Database already seeded. Skipping.');
      return;
    }

    // --- Services ---
    const services = [
      { name: 'Classic Haircut',        category: 'haircut',   duration: 30, price: 400,  description: 'Clean fade or scissor cut, styled to perfection.' },
      { name: 'Skin Fade',              category: 'haircut',   duration: 45, price: 550,  description: 'Precision skin fade with detailed line-up.' },
      { name: 'Beard Trim & Shape',     category: 'beard',     duration: 20, price: 250,  description: 'Expert beard sculpting and edge-up.' },
      { name: 'Hot Towel Shave',        category: 'shave',     duration: 30, price: 350,  description: 'Traditional straight-razor shave with hot towel.' },
      { name: 'Haircut + Beard Combo',  category: 'combo',     duration: 60, price: 700,  description: 'Full haircut and beard grooming in one session.' },
      { name: 'Hair Treatment',         category: 'treatment', duration: 45, price: 500,  description: 'Deep conditioning and scalp treatment.' },
    ];

    for (const s of services) {
      await client.query(
        `INSERT INTO services (name, category, duration, price, description)
         VALUES ($1,$2,$3,$4,$5)`,
        [s.name, s.category, s.duration, s.price, s.description]
      );
    }
    console.log(`  ✔ ${services.length} services inserted`);

    // --- Barbers ---
    const barbers = [
      { name: 'Treysson', specialties: ['Skin Fade','Beard Trim'],     bio: 'Head barber with 8+ years experience.' },
      { name: 'Kevin',    specialties: ['Classic Cut','Hair Treatment'], bio: 'Specialist in natural hair and treatments.' },
      { name: 'Jayden',   specialties: ['Hot Towel Shave','Combos'],   bio: 'Precision cuts and classic shaves.' },
    ];

    const defaultSchedule = [
      { day: 'monday',    is_working: true,  start_time: '08:00', end_time: '18:00' },
      { day: 'tuesday',   is_working: true,  start_time: '08:00', end_time: '18:00' },
      { day: 'wednesday', is_working: true,  start_time: '08:00', end_time: '18:00' },
      { day: 'thursday',  is_working: true,  start_time: '08:00', end_time: '18:00' },
      { day: 'friday',    is_working: true,  start_time: '08:00', end_time: '18:00' },
      { day: 'saturday',  is_working: true,  start_time: '08:00', end_time: '17:00' },
      { day: 'sunday',    is_working: false, start_time: '08:00', end_time: '18:00' },
    ];

    for (const b of barbers) {
      const res = await client.query(
        `INSERT INTO barbers (name, specialties, bio) VALUES ($1,$2,$3) RETURNING id`,
        [b.name, b.specialties, b.bio]
      );
      const barberId = res.rows[0].id;

      for (const s of defaultSchedule) {
        await client.query(
          `INSERT INTO barber_schedules (barber_id, day, is_working, start_time, end_time)
           VALUES ($1,$2,$3,$4,$5)`,
          [barberId, s.day, s.is_working, s.start_time, s.end_time]
        );
      }
    }
    console.log(`  ✔ ${barbers.length} barbers inserted with schedules`);

    console.log('✅ Seeding complete.');
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();