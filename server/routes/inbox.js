const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const wa = require('../services/whatsapp');
const { emitToTenant } = require('../socket');

const router = express.Router();

router.get('/conversations', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.status, c.last_message_at, ct.id as contact_id, ct.wa_id, ct.name,
              (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE c.tenant_id = ?
       ORDER BY c.last_message_at DESC`
    )
    .all(req.user.tenantId);
  res.json(rows);
});

router.get('/conversations/:id/messages', authRequired, (req, res) => {
  const convo = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.user.tenantId);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  res.json({ conversation: convo, messages });
});

router.post('/conversations/:id/reply', authRequired, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const convo = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.user.tenantId);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(convo.contact_id);
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenantId);

  if (!tenant.whatsapp_connected) {
    return res.status(400).json({ error: 'Connect a WhatsApp number first (Settings > WhatsApp Connection)' });
  }

  try {
    const result = await wa.sendTextMessage(tenant, contact.wa_id, text);
    const messageId = uuidv4();
    db.prepare(
      'INSERT INTO messages (id, tenant_id, conversation_id, direction, wa_message_id, msg_type, body, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(messageId, tenant.id, convo.id, 'outbound', result.data?.messages?.[0]?.id || null, 'text', text, 'sent');
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(convo.id);
    emitToTenant(tenant.id, 'new_message', { conversationId: convo.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

module.exports = router;
