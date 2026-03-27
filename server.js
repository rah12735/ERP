const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE INIT ─────────────────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);
  console.log('Database tables ready.');
}

// ─── SSE (live sync between tabs) ──────────────────────────────────────────
let clients = [];
function notifyClients() {
  const payload = `data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
  clients.forEach(c => c.res.write(payload));
}

app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
  clients.push({ req, res });
  req.on('close', () => { clients = clients.filter(c => c.res !== res); });
});

// ─── USERS ─────────────────────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  const result = await pool.query('SELECT data FROM users ORDER BY data->>\'name\'');
  res.json(result.rows.map(r => r.data));
});

app.post('/api/users/init', async (req, res) => {
  const count = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(count.rows[0].count) === 0 && Array.isArray(req.body)) {
    for (const user of req.body) {
      await pool.query(
        'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
        [user.id || user.username, JSON.stringify(user)]
      );
    }
    notifyClients();
  }
  res.json({ success: true });
});

// ─── EMPLOYEES ─────────────────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  const result = await pool.query('SELECT data FROM employees');
  res.json(result.rows.map(r => r.data));
});

app.post('/api/employees/init', async (req, res) => {
  const count = await pool.query('SELECT COUNT(*) FROM employees');
  if (parseInt(count.rows[0].count) === 0 && Array.isArray(req.body)) {
    for (const emp of req.body) {
      await pool.query(
        'INSERT INTO employees (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
        [emp.id, JSON.stringify(emp)]
      );
    }
    notifyClients();
  }
  res.json({ success: true });
});

app.post('/api/employees', async (req, res) => {
  const emp = req.body;
  await pool.query(
    'INSERT INTO employees (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
    [emp.id, JSON.stringify(emp)]
  );
  notifyClients();
  res.json({ success: true });
});

app.post('/api/employees/batch', async (req, res) => {
  const { deleteIds, upsertList } = req.body;
  if (deleteIds && deleteIds.length > 0) {
    await pool.query('DELETE FROM employees WHERE id = ANY($1)', [deleteIds]);
  }
  if (upsertList && upsertList.length > 0) {
    for (const emp of upsertList) {
      await pool.query(
        'INSERT INTO employees (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
        [emp.id, JSON.stringify(emp)]
      );
    }
  }
  notifyClients();
  res.json({ success: true });
});

// ─── FILE UPLOAD ────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const b64 = req.file.buffer.toString('base64');
  const dataUrl = `data:${req.file.mimetype};base64,${b64}`;
  res.json({ success: true, url: dataUrl });
});

// ─── START ──────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n========================================================`);
    console.log(`  ECHJAY INDUSTRIES ERP - Cloud Server`);
    console.log(`  Running on port ${PORT}`);
    console.log(`========================================================\n`);
  });
}).catch(err => {
  console.error('Database connection failed:', err.message);
  console.error('Make sure DATABASE_URL environment variable is set correctly.');
  process.exit(1);
});
