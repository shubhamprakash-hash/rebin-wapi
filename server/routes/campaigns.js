const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const wa = require('../services/whatsapp');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM campaigns WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(req.user.tenantId);
  res.json(rows);
});

// Create + send a broadcast campaign using an approved template.
// Recipients: all contacts, or contacts whose `tags` field contains `tag`.
router.post('/', authRequired, async (req, res) => {
  const { name, template_name, language, tag } = req.body;
  if (!name || !template_name) return res.status(400).json({ error: 'name and template_name are required' });

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenantId);
  if (!tenant.whatsapp_connected) return res.status(400).json({ error: 'Connect WhatsApp first' });

  const contacts = tag
    ? db.prepare('SELECT * FROM contacts WHERE tenant_id = ? AND tags LIKE ?').all(tenant.id, `%${tag}%`)
    : db.prepare('SELECT * FROM contacts WHERE tenant_id = ?').all(tenant.id);

  if (contacts.length === 0) return res.status(400).json({ error: 'No matching contacts found' });

  const campaignId = uuidv4();
  db.prepare(
    'INSERT INTO campaigns (id, tenant_id, name, template_name, language, status, total) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(campaignId, tenant.id, name, template_name, language || 'en_US', 'sending', contacts.length);

  res.json({ ok: true, campaignId, total: contacts.length });

  // Fire-and-forget sender loop with a small delay between sends to stay
  // comfortably under Meta's per-number messaging tier limits.
  (async () => {
    let sent = 0;
    let failed = 0;
    for (const contact of contacts) {
      try {
        await wa.sendTemplateMessage(tenant, contact.wa_id, template_name, language || 'en_US');
        sent++;
      } catch (e) {
        failed++;
        console.error('Campaign send failed for', contact.wa_id, e.response?.data || e.message);
      }
      await new Promise((r) => setTimeout(r, 300)); // simple throttle, ~3 msgs/sec
    }
    db.prepare("UPDATE campaigns SET status = 'completed', sent = ?, failed = ? WHERE id = ?").run(
      sent,
      failed,
      campaignId
    );
  })();
});

module.exports = router;
