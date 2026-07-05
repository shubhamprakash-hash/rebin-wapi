const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'rebinchat.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  plan TEXT DEFAULT 'starter',
  waba_id TEXT,
  phone_number_id TEXT,
  access_token TEXT,
  whatsapp_connected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  wa_id TEXT NOT NULL,
  name TEXT,
  tags TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, wa_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  last_message_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL, -- inbound | outbound
  wa_message_id TEXT,
  msg_type TEXT DEFAULT 'text',
  body TEXT,
  status TEXT DEFAULT 'sent', -- sent | delivered | read | failed
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT,
  language TEXT,
  category TEXT,
  status TEXT,
  meta_template_id TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT,
  template_name TEXT,
  language TEXT,
  status TEXT DEFAULT 'draft',
  total INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chatbot_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  reply TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ------------------------------------------------------------------
// Seed a default company + admin login on every boot, if none exists.
// This exists because free-tier hosting (e.g. Render's free plan) wipes
// the SQLite file on restart/sleep - re-seeding on startup means you
// always have a working login even after the disk gets reset.
// Override via env vars if you want different default credentials.
// ------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function seedDefaultAccount() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return;

  const companyName = process.env.SEED_COMPANY_NAME || 'Rebin Infotech';
  const name = process.env.SEED_ADMIN_NAME || 'Admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@rebininfotech.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'RebinChat@123';

  const tenantId = uuidv4();
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare('INSERT INTO tenants (id, company_name) VALUES (?, ?)').run(tenantId, companyName);
  db.prepare(
    'INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, tenantId, name, email, passwordHash, 'admin');

  console.log('\n  Seeded default RebinChat login:');
  console.log(`    Email:    ${email}`);
  console.log(`    Password: ${password}`);
  console.log('  Change this password after logging in (or set SEED_ADMIN_* env vars before deploying).\n');
}

seedDefaultAccount();

module.exports = db;
