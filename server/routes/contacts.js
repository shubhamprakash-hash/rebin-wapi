const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM contacts WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(req.user.tenantId);
  res.json(rows);
});

router.post('/', authRequired, (req, res) => {
  const { wa_id, name, tags } = req.body;
  if (!wa_id) return res.status(400).json({ error: 'wa_id (phone number in international format) is required' });

  const id = uuidv4();
  try {
    db.prepare('INSERT INTO contacts (id, tenant_id, wa_id, name, tags) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.user.tenantId,
      wa_id.replace(/\D/g, ''),
      name || wa_id,
      tags || ''
    );
    res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
  } catch (e) {
    res.status(400).json({ error: 'Contact already exists' });
  }
});

router.delete('/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenantId);
  res.json({ ok: true });
});

// CSV import: columns expected -> wa_id,name,tags
router.post('/import', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required (field name: file)' });

  let records;
  try {
    records = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO contacts (id, tenant_id, wa_id, name, tags) VALUES (?, ?, ?, ?, ?)'
  );
  let count = 0;
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const waId = (row.wa_id || row.phone || '').replace(/\D/g, '');
      if (!waId) continue;
      insert.run(uuidv4(), req.user.tenantId, waId, row.name || waId, row.tags || '');
      count++;
    }
  });
  tx(records);

  res.json({ imported: count });
});

module.exports = router;
