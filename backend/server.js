require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const bcrypt = require('bcryptjs');

// Database Setup & Auto-Migrations
const db = require('./config/db');

// Main Routing Router
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Standard Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Http Request Logger
app.use(morgan('dev'));

// Static Admin UI panel (if applicable) or default route mapping
app.use('/admin', express.static(path.join(__dirname, 'public/admin_panel')));

// Direct API Mount Point
app.use('/api', apiRoutes);

// Base routing check representing administrative gateway configurations
app.get('/', (req, res) => {
  res.json({
    status: "Healthy",
    service: "9UPI PAY Enterprise Production API Pipeline",
    version: "v1.1.0",
    environment: process.env.NODE_ENV || "production",
    connections: {
      engine: "PostgreSQL Standard Pool Connection",
      activeGatewayAuth: "JWT Security Signatures Enabled"
    },
    documentation: {
      telegram: "https://t.me/NineUpiPay",
      channelHeadAgent: "https://t.me/NineUpipayhead"
    }
  });
});

// Seed Initial Admin credentials if table is currently empty
const seedAdministrationAccess = async () => {
  try {
    // Check if roles have populated, then verify admins count
    const adminCheck = await db.query('SELECT COUNT(*) as count FROM admins');
    const adminCount = parseInt(adminCheck.rows[0].count);

    if (adminCount === 0) {
      console.log('📌 Database empty: Seeding default administrative accounts...');
      
      const defaultAdminId = '9UPIADMIN';
      const defaultAdminEmail = 'admin@nineupi.fun';
      const defaultAdminPin = '1234'; // High-security standard clear code for bootstrap
      
      const hashedPin = await bcrypt.hash(defaultAdminPin, 10);
      
      await db.query(`
        INSERT INTO admins (admin_id, name, email, pin, role_name)
        VALUES ($1, $2, $3, $4, 'Super Admin')
      `, [defaultAdminId, 'Super Administrator', defaultAdminEmail, hashedPin]);
      
      console.log(`=======================================================`);
      console.log(`🔑 INITIAL ADMIN TERMINAL SEEDS REGISTERED SUCCESSFULLY`);
      console.log(`👤 UserID Key ID  : ${defaultAdminId}`);
      console.log(`✉️ Email Target   : ${defaultAdminEmail}`);
      console.log(`🔒 Secret Pin Entry: ${defaultAdminPin}`);
      console.log(`=======================================================`);
      
      await db.logAudit('USER_SETUP', 'System', 'Initial Super Admin seed successfully registered.');
    }
  } catch (err) {
    console.error('⚠️ Seeding check skipped / failed: DB connection offline.', err.message);
  }
};

// Bootstrap Server & Database pipeline in sequential order
const bootSystem = async () => {
  // 1. Establish database connection pool and run SQL schema
  await db.initDatabase();
  
  // 2. Clear credentials seeding checks
  await seedAdministrationAccess();
  
  // 3. Start Express service
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 9UPI PAY API Engine Server Status: [ONLINE]`);
    console.log(`📡 Server Address Port : http://localhost:${PORT}`);
    console.log(`🔧 Live API endpoints  : http://localhost:${PORT}/api/`);
    console.log(`🛡️ JWT Signature Code  : Enabled`);
    console.log(`=======================================================`);
  });
};

bootSystem();
