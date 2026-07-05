const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const wa = require('../services/whatsapp');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM templates WHERE tenant_id = ? ORDER BY synced_at DESC')
    .all(req.user.tenantId);
  res.json(rows);
});

// Pull the latest approved/pending/rejected templates from Meta into our DB
router.post('/sync', authRequired, async (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenantId);
  if (!tenant.whatsapp_connected) {
    return res.status(400).json({ error: 'Connect WhatsApp first' });
  }
  try {
    const templates = await wa.fetchTemplates(tenant);
    db.prepare('DELETE FROM templates WHERE tenant_id = ?').run(tenant.id);
    const insert = db.prepare(
      'INSERT INTO templates (id, tenant_id, name, language, category, status, meta_template_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const tx = db.transaction((rows) => {
      for (const t of rows) {
        insert.run(uuidv4(), tenant.id, t.name, t.language, t.category, t.status, t.id);
      }
    });
    tx(templates);
    res.json({ synced: templates.length });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

module.exports = router;
