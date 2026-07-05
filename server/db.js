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

module.exports = db;
