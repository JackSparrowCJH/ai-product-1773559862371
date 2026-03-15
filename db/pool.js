require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_URL,
  max: 10,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
