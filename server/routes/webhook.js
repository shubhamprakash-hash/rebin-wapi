const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { emitToTenant } = require('../socket');

const router = express.Router();

// Step: Meta webhook verification (GET request with hub.challenge)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody || !process.env.META_APP_SECRET) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function findTenantByPhoneNumberId(phoneNumberId) {
  return db.prepare('SELECT * FROM tenants WHERE phone_number_id = ?').get(phoneNumberId);
}

function getOrCreateContact(tenantId, waId, name) {
  let contact = db.prepare('SELECT * FROM contacts WHERE tenant_id = ? AND wa_id = ?').get(tenantId, waId);
  if (!contact) {
    const id = uuidv4();
    db.prepare('INSERT INTO contacts (id, tenant_id, wa_id, name) VALUES (?, ?, ?, ?)').run(
      id,
      tenantId,
      waId,
      name || waId
    );
    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  }
  return contact;
}

function getOrCreateConversation(tenantId, contactId) {
  let convo = db
    .prepare("SELECT * FROM conversations WHERE tenant_id = ? AND contact_id = ? AND status != 'closed'")
    .get(tenantId, contactId);
  if (!convo) {
    const id = uuidv4();
    db.prepare('INSERT INTO conversations (id, tenant_id, contact_id) VALUES (?, ?, ?)').run(
      id,
      tenantId,
      contactId
    );
    convo = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  } else {
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(convo.id);
  }
  return convo;
}

function runChatbot(tenant, conversation, contact, incomingText) {
  if (!incomingText) return;
  const rules = db
    .prepare('SELECT * FROM chatbot_rules WHERE tenant_id = ? AND is_active = 1')
    .all(tenant.id);
  const text = incomingText.toLowerCase();
  const match = rules.find((r) => text.includes(r.keyword.toLowerCase()));
  if (!match) return;

  const wa = require('../services/whatsapp');
  wa.sendTextMessage(tenant, contact.wa_id, match.reply)
    .then((r) => {
      const msgId = uuidv4();
      db.prepare(
        'INSERT INTO messages (id, tenant_id, conversation_id, direction, wa_message_id, msg_type, body, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(msgId, tenant.id, conversation.id, 'outbound', r.data?.messages?.[0]?.id || null, 'text', match.reply, 'sent');
      emitToTenant(tenant.id, 'new_message', { conversationId: conversation.id });
    })
    .catch((e) => console.error('Chatbot auto-reply failed:', e.response?.data || e.message));
}

// Step: receive incoming messages, delivery/read statuses, account/template events
router.post('/', (req, res) => {
  // Always ack quickly so Meta doesn't retry/disable the webhook
  res.sendStatus(200);

  if (process.env.META_APP_SECRET && !verifySignature(req)) {
    console.warn('Webhook signature verification failed - ignoring payload');
    return;
  }

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const tenant = phoneNumberId ? findTenantByPhoneNumberId(phoneNumberId) : null;
      if (!tenant) continue;

      // Incoming messages
      for (const msg of value.messages || []) {
        const waId = msg.from;
        const contactName = value.contacts?.[0]?.profile?.name;
        const contact = getOrCreateContact(tenant.id, waId, contactName);
        const conversation = getOrCreateConversation(tenant.id, contact.id);

        let bodyText = '';
        if (msg.type === 'text') bodyText = msg.text?.body || '';
        else if (msg.type === 'button') bodyText = msg.button?.text || '';
        else if (msg.type === 'interactive') bodyText = JSON.stringify(msg.interactive);
        else bodyText = `[${msg.type} message]`;

        const messageId = uuidv4();
        db.prepare(
          'INSERT INTO messages (id, tenant_id, conversation_id, direction, wa_message_id, msg_type, body, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(messageId, tenant.id, conversation.id, 'inbound', msg.id, msg.type, bodyText, 'received');

        emitToTenant(tenant.id, 'new_message', { conversationId: conversation.id });
        runChatbot(tenant, conversation, contact, bodyText);
      }

      // Delivery / read statuses for messages we sent
      for (const status of value.statuses || []) {
        db.prepare('UPDATE messages SET status = ? WHERE wa_message_id = ?').run(status.status, status.id);
        emitToTenant(tenant.id, 'message_status', { wa_message_id: status.id, status: status.status });
      }
    }
  }
});

module.exports = router;
