const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const wa = require('../services/whatsapp');

const router = express.Router();

router.get('/status', authRequired, (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenantId);
  res.json({
    connected: !!tenant.whatsapp_connected,
    waba_id: tenant.waba_id,
    phone_number_id: tenant.phone_number_id
  });
});

// Path A (fastest, zero Meta App Review needed): paste credentials generated
// manually from the Meta Developer Dashboard (System User permanent token).
router.post('/manual-connect', authRequired, (req, res) => {
  const { waba_id, phone_number_id, access_token } = req.body;
  if (!waba_id || !phone_number_id || !access_token) {
    return res.status(400).json({ error: 'waba_id, phone_number_id and access_token are required' });
  }
  db.prepare(
    'UPDATE tenants SET waba_id = ?, phone_number_id = ?, access_token = ?, whatsapp_connected = 1 WHERE id = ?'
  ).run(waba_id, phone_number_id, access_token, req.user.tenantId);
  res.json({ ok: true });
});

// Path B: real Embedded Signup flow (requires META_APP_ID/META_CONFIG_ID
// configured and, for external customers, Meta Advanced Access approval).
router.post('/embedded-signup/exchange', authRequired, async (req, res) => {
  const { code, waba_id, phone_number_id } = req.body;
  if (!code || !waba_id || !phone_number_id) {
    return res.status(400).json({ error: 'code, waba_id and phone_number_id are required' });
  }
  try {
    const accessToken = await wa.exchangeCodeForToken(code);
    db.prepare(
      'UPDATE tenants SET waba_id = ?, phone_number_id = ?, access_token = ?, whatsapp_connected = 1 WHERE id = ?'
    ).run(waba_id, phone_number_id, accessToken, req.user.tenantId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

router.post('/disconnect', authRequired, (req, res) => {
  db.prepare(
    'UPDATE tenants SET waba_id = NULL, phone_number_id = NULL, access_token = NULL, whatsapp_connected = 0 WHERE id = ?'
  ).run(req.user.tenantId);
  res.json({ ok: true });
});

module.exports = router;
