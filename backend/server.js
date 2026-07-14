import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import dotenv from 'dotenv';

import authRouter      from './routes/auth.js';
import usersRouter     from './routes/users.js';
import rolesRouter     from './routes/roles.js';
import productsRouter  from './routes/products.js';
import clientsRouter   from './routes/clients.js';
import dashboardRouter from './routes/dashboard.js';

dotenv.config();

const { Pool } = pkg;
const app = express();

// ──────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ──────────────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────────────────────────────────────
// DATABASE CONNECTION
// ──────────────────────────────────────────────────────────────────────────────
const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'corvex_db',
  password: process.env.DB_PASSWORD || '100802',
  port:     Number(process.env.DB_PORT) || 5432,
  max:      10,          // max connections in pool
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

// Make pool available to all routes via app.locals
app.locals.pool = pool;

async function connectDatabase() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT current_database(), current_user, version()');
    const { current_database, current_user } = result.rows[0];
    console.log(`✅ PostgreSQL connected — database: "${current_database}", user: "${current_user}"`);
    client.release();
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
    console.error('   Check your .env DB credentials and ensure PostgreSQL is running.');
  }
}

connectDatabase();

// ──────────────────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/users',     usersRouter);
app.use('/api/roles',     rolesRouter);
app.use('/api/products',  productsRouter);
app.use('/api/clients',   clientsRouter);
app.use('/api/dashboard', dashboardRouter);

// Health Check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CORVEX Backend API is running.',
    version: '1.0.0',
    endpoints: [
      'POST /api/auth/login',
      'GET  /api/users',
      'POST /api/users',
      'PUT  /api/users/:id',
      'DEL  /api/users/:id',
      'GET  /api/roles',
      'PUT  /api/roles/:id/permissions',
      'GET  /api/products',
      'GET  /api/products/:id',
      'POST /api/products',
      'PUT  /api/products/:id',
      'GET  /api/clients',
      'GET  /api/clients/:id',
      'POST /api/clients',
      'PUT  /api/clients/:id',
      'GET  /api/dashboard/system-health',
      'GET  /api/dashboard/user-stats',
      'GET  /api/dashboard/inventory-health',
      'GET  /api/dashboard/recent-audit',
      'GET  /api/dashboard/branches',
    ],
    timestamp: new Date().toISOString(),
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 404 Handler
// ──────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// ──────────────────────────────────────────────────────────────────────────────
// Global Error Handler
// ──────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ success: false, message: 'An unexpected error occurred.', error: err.message });
});

// ──────────────────────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`🚀 CORVEX API running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});