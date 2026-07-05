const axios = require('axios');

function graphBase() {
  return `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v20.0'}`;
}

async function sendTextMessage(tenant, to, text) {
  return axios.post(
    `${graphBase()}/${tenant.phone_number_id}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    { headers: { Authorization: `Bearer ${tenant.access_token}` } }
  );
}

async function sendTemplateMessage(tenant, to, templateName, language = 'en_US', components = []) {
  return axios.post(
    `${graphBase()}/${tenant.phone_number_id}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components
      }
    },
    { headers: { Authorization: `Bearer ${tenant.access_token}` } }
  );
}

async function fetchTemplates(tenant) {
  const res = await axios.get(`${graphBase()}/${tenant.waba_id}/message_templates`, {
    headers: { Authorization: `Bearer ${tenant.access_token}` },
    params: { limit: 100 }
  });
  return res.data.data || [];
}

async function exchangeCodeForToken(code) {
  const res = await axios.get(`${graphBase()}/oauth/access_token`, {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      code
    }
  });
  return res.data.access_token;
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  fetchTemplates,
  exchangeCodeForToken,
  graphBase
};
