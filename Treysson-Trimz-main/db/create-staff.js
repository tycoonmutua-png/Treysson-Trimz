require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');

const staff = [
  { name: 'Eli Carlos',  email: 'eli@treyssontrimz.com',     phone: '+254113146508', password: 'Eli@Trimz2024',     role: 'super_admin' },
  { name: 'Admin User',  email: 'admin@treyssontrimz.com',   phone: '+254113146508', password: 'TrimzAdmin2024',    role: 'admin' },
  { name: 'Cashier One', email: 'cashier@treyssontrimz.com', phone: '+254113146508', password: 'TrimzCashier2024',  role: 'cashier' },
];

async function createStaff() {
  for (const s of staff) {
    const hashed = await bcrypt.hash(s.password, 10);
    await pool.query(
      `UPDATE staff SET password=$1 WHERE email=$2`,
      [hashed, s.email]
    );
    console.log(`✅ Password set for ${s.name} (${s.role})`);
  }
  console.log('Done!');
  await pool.end();
}

createStaff();