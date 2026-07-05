const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', authRequired, (req, res) => {
  const tenantId = req.user.tenantId;
  const contacts = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE tenant_id = ?').get(tenantId).c;
  const conversations = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE tenant_id = ?').get(tenantId).c;
  const messagesIn = db
    .prepare("SELECT COUNT(*) as c FROM messages WHERE tenant_id = ? AND direction = 'inbound'")
    .get(tenantId).c;
  const messagesOut = db
    .prepare("SELECT COUNT(*) as c FROM messages WHERE tenant_id = ? AND direction = 'outbound'")
    .get(tenantId).c;
  const campaigns = db.prepare('SELECT COUNT(*) as c FROM campaigns WHERE tenant_id = ?').get(tenantId).c;
  const tenant = db.prepare('SELECT whatsapp_connected, plan FROM tenants WHERE id = ?').get(tenantId);

  res.json({ contacts, conversations, messagesIn, messagesOut, campaigns, ...tenant });
});

module.exports = router;
