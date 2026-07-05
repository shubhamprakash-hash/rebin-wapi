require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { initSocket } = require('./socket');

const app = express();
app.use(cors());

// Capture raw body (needed to verify Meta's X-Hub-Signature-256 header)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

// Public, non-authenticated config for the frontend Embedded Signup button
app.get('/api/public-config', (req, res) => {
  res.json({
    appId: process.env.META_APP_ID || '',
    configId: process.env.META_CONFIG_ID || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v20.0',
    embeddedSignupAvailable: !!(process.env.META_APP_ID && process.env.META_CONFIG_ID)
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/inbox', require('./routes/inbox'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/analytics', require('./routes/analytics'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Catch-all error handler - ensures API errors always come back as JSON,
// not Express's default HTML error page (which broke the frontend's
// error parsing and showed a generic "Request failed" message).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);
initSocket(server);

const db = require('./db');
const PORT = process.env.PORT || 4000;

db.ready
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n  RebinChat is running at http://localhost:${PORT}\n`);
      console.log(`  Webhook callback URL to give Meta: http://<your-domain>/api/webhook\n`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database - server not started:', err);
    process.exit(1);
  });
