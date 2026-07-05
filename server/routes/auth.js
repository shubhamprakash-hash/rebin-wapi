const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function signToken(user, tenant) {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      name: user.name,
      email: user.email,
      companyName: tenant.company_name
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Create a new company (tenant) + admin user
router.post('/signup', (req, res) => {
  const { company_name, name, email, password } = req.body;
  if (!company_name || !name || !email || !password) {
    return res.status(400).json({ error: 'company_name, name, email and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

  const tenantId = uuidv4();
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare('INSERT INTO tenants (id, company_name) VALUES (?, ?)').run(tenantId, company_name);
  db.prepare(
    'INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, tenantId, name, email, passwordHash, 'admin');

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = signToken(user, tenant);

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, tenant });
});

// Add a team member (agent) to an existing tenant
router.post('/invite', authRequired, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already in use' });

  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, req.user.tenantId, name, email, passwordHash, role === 'admin' ? 'admin' : 'agent');

  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
  const token = signToken(user, tenant);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, tenant });
});

router.get('/me', authRequired, (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenantId);
  const users = db.prepare('SELECT id, name, email, role FROM users WHERE tenant_id = ?').all(req.user.tenantId);
  res.json({ user: req.user, tenant, teamMembers: users });
});

module.exports = router;
