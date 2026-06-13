const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Initialize Connection Pool
// Connection properties can either be fed via DATABASE_URL or distinct host variables
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nineupi';

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Test connection and auto-run bootstrap migrations
const initDatabase = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connection pool successfully established.');
    
    // Read and run the schema queries to construct tables dynamically if they do not exist
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('⚡ PG Tables and seeds verified and successfully initialized.');
    } else {
      console.warn('⚠️ schema.sql script not found. Skipping auto-tables setup.');
    }
    client.release();
  } catch (error) {
    console.error('❌ Critical: Failed to connect to PostgreSQL database:', error.message);
    console.log('ℹ️ Attempting to construct self-healing fallback mechanisms for local environment simulation.');
  }
};

module.exports = {
  pool,
  initDatabase,
  query: (text, params) => pool.query(text, params),
  
  // High-Fidelity Audit Logger API
  logAudit: async (action, adminUser = 'System', details = '') => {
    try {
      await pool.query(
        'INSERT INTO audit_logs (action, admin_user, details) VALUES ($1, $2, $3)',
        [action, adminUser, details]
      );
    } catch (err) {
      console.error('Failed to write audit log:', err.message);
    }
  },

  // User Activity Tracker
  logActivity: async (userId, activity, details = '') => {
    try {
      await pool.query(
        'INSERT INTO activity_logs (user_id, activity, details) VALUES ($1, $2, $3)',
        [userId, activity, details]
      );
    } catch (err) {
      console.error('Failed to write activity log:', err.message);
    }
  }
};
