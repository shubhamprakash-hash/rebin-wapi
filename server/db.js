const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'rebinchat.sqlite');

const SCHEMA = `
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
  direction TEXT NOT NULL,
  wa_message_id TEXT,
  msg_type TEXT DEFAULT 'text',
  body TEXT,
  status TEXT DEFAULT 'sent',
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
`;

// dbApi is exported immediately (same object reference always) so route
// files can safely `require('../db')` at the top of their file. Its methods
// are filled in once the WASM engine finishes loading (see `ready` below).
// As long as the HTTP server doesn't start accepting requests until `ready`
// resolves (handled in server/index.js), every route call is safe.
const dbApi = {
  prepare: null,
  exec: null,
  transaction: null,
  ready: null
};

let sqlDb;

function persist() {
  try {
    const data = sqlDb.export();
    fs.writeFileSync(dbFile, Buffer.from(data));
  } catch (e) {
    console.error('Failed to persist database to disk:', e.message);
  }
}

function wrapStatement(sql) {
  return {
    run(...params) {
      const stmt = sqlDb.prepare(sql);
      try {
        stmt.bind(params);
        stmt.step();
      } finally {
        stmt.free();
      }
      persist();
      return { changes: sqlDb.getRowsModified() };
    },
    get(...params) {
      const stmt = sqlDb.prepare(sql);
      let row;
      try {
        stmt.bind(params);
        if (stmt.step()) row = stmt.getAsObject();
      } finally {
        stmt.free();
      }
      return row;
    },
    all(...params) {
      const stmt = sqlDb.prepare(sql);
      const rows = [];
      try {
        stmt.bind(params);
        while (stmt.step()) rows.push(stmt.getAsObject());
      } finally {
        stmt.free();
      }
      return rows;
    }
  };
}

function seedDefaultAccount() {
  const userCount = dbApi.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return;

  const companyName = process.env.SEED_COMPANY_NAME || 'Rebin Infotech';
  const name = process.env.SEED_ADMIN_NAME || 'Admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@rebininfotech.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'RebinChat@123';

  const tenantId = uuidv4();
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  dbApi.prepare('INSERT INTO tenants (id, company_name) VALUES (?, ?)').run(tenantId, companyName);
  dbApi
    .prepare('INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, tenantId, name, email, passwordHash, 'admin');

  console.log('\n  Seeded default RebinChat login:');
  console.log(`    Email:    ${email}`);
  console.log(`    Password: ${password}`);
  console.log('  Change this password after logging in (or set SEED_ADMIN_* env vars before deploying).\n');
}

dbApi.ready = (async () => {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbFile)) {
    try {
      sqlDb = new SQL.Database(fs.readFileSync(dbFile));
    } catch (e) {
      console.error('Existing database file was unreadable, starting fresh:', e.message);
      sqlDb = new SQL.Database();
    }
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(SCHEMA);

  dbApi.prepare = wrapStatement;
  dbApi.exec = (sql) => sqlDb.run(sql);
  // Simple transaction helper matching the subset used by the routes:
  // db.transaction(fn) returns a function you call with an array of rows.
  dbApi.transaction = (fn) => (rows) => {
    const result = fn(rows);
    persist();
    return result;
  };

  seedDefaultAccount();
  persist();

  console.log('  Database ready (sql.js / SQLite, file-backed at data/rebinchat.sqlite)');
})();

module.exports = dbApi;
