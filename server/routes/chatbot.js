const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM chatbot_rules WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(req.user.tenantId);
  res.json(rows);
});

router.post('/', authRequired, (req, res) => {
  const { keyword, reply } = req.body;
  if (!keyword || !reply) return res.status(400).json({ error: 'keyword and reply are required' });
  const id = uuidv4();
  db.prepare('INSERT INTO chatbot_rules (id, tenant_id, keyword, reply) VALUES (?, ?, ?, ?)').run(
    id,
    req.user.tenantId,
    keyword,
    reply
  );
  res.json(db.prepare('SELECT * FROM chatbot_rules WHERE id = ?').get(id));
});

router.patch('/:id', authRequired, (req, res) => {
  const rule = db
    .prepare('SELECT * FROM chatbot_rules WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.user.tenantId);
  if (!rule) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE chatbot_rules SET is_active = ? WHERE id = ?').run(rule.is_active ? 0 : 1, rule.id);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM chatbot_rules WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenantId);
  res.json({ ok: true });
});

module.exports = router;
