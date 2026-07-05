// ===================== RebinChat frontend (vanilla JS) =====================
const state = {
  token: localStorage.getItem('rebinchat_token') || null,
  tenant: null,
  user: null,
  socket: null,
  activeView: 'dashboard',
  activeConversationId: null
};

function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  return fetch('/api' + path, Object.assign({}, options, { headers })).then(async (r) => {
    let data = {};
    let parseFailed = false;
    try {
      data = await r.json();
    } catch (e) {
      parseFailed = true;
    }
    if (!r.ok) {
      const message = data.error || (parseFailed ? `Server error (HTTP ${r.status}) - check server logs` : 'Request failed');
      throw new Error(message);
    }
    return data;
  });
}

// ---------------------- Auth screen ----------------------
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
    document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    onAuthSuccess(data);
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const company_name = document.getElementById('signup-company').value;
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ company_name, name, email, password })
    });
    onAuthSuccess(data);
  } catch (err) {
    document.getElementById('signup-error').textContent = err.message;
  }
});

function onAuthSuccess(data) {
  state.token = data.token;
  state.tenant = data.tenant;
  state.user = data.user;
  localStorage.setItem('rebinchat_token', data.token);
  boot();
}

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('rebinchat_token');
  if (state.socket) state.socket.disconnect();
  window.location.reload();
});

// ---------------------- Boot / shell ----------------------
async function boot() {
  try {
    const me = await api('/auth/me');
    state.tenant = me.tenant;
    state.user = me.user;
  } catch (e) {
    localStorage.removeItem('rebinchat_token');
    return;
  }

  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  document.getElementById('company-name').textContent = state.tenant.company_name;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderView(btn.dataset.view);
    });
  });

  connectSocket();
  await refreshConnectionBanner();
  renderView('dashboard');
}

function connectSocket() {
  state.socket = io({ auth: { token: state.token } });
  state.socket.on('new_message', (payload) => {
    if (state.activeView === 'inbox') renderInbox(payload.conversationId);
  });
  state.socket.on('message_status', () => {
    if (state.activeView === 'inbox') renderInbox();
  });
}

async function refreshConnectionBanner() {
  const status = await api('/whatsapp/status');
  document.getElementById('connection-banner').classList.toggle('hidden', status.connected);
  return status;
}

function renderView(view) {
  state.activeView = view;
  const c = document.getElementById('view-container');
  c.innerHTML = '<p class="empty-state">Loading…</p>';
  const renderers = {
    dashboard: renderDashboard,
    inbox: renderInbox,
    contacts: renderContacts,
    campaigns: renderCampaigns,
    templates: renderTemplates,
    chatbot: renderChatbot,
    settings: renderSettings
  };
  (renderers[view] || renderDashboard)();
}

// ---------------------- Dashboard ----------------------
async function renderDashboard() {
  const s = await api('/analytics/summary');
  const c = document.getElementById('view-container');
  c.innerHTML = `
    <h1 class="page-title">Dashboard</h1>
    <div class="grid-cards">
      ${statCard(s.contacts, 'Contacts')}
      ${statCard(s.conversations, 'Conversations')}
      ${statCard(s.messagesIn, 'Messages received')}
      ${statCard(s.messagesOut, 'Messages sent')}
      ${statCard(s.campaigns, 'Campaigns')}
    </div>
    <div class="card">
      <b>Plan:</b> ${s.plan || 'starter'} &nbsp;•&nbsp;
      <b>WhatsApp:</b> ${s.whatsapp_connected ? 'Connected ✅' : 'Not connected — go to Settings'}
    </div>
  `;
}
function statCard(value, label) {
  return `<div class="card stat-card"><div class="stat-value">${value ?? 0}</div><div class="stat-label">${label}</div></div>`;
}

// ---------------------- Inbox ----------------------
async function renderInbox(focusConversationId) {
  const conversations = await api('/inbox/conversations');
  const c = document.getElementById('view-container');
  c.innerHTML = `
    <h1 class="page-title">Shared Inbox</h1>
    <div class="inbox-layout">
      <div class="convo-list" id="convo-list">
        ${
          conversations.length
            ? conversations
                .map(
                  (cv) => `
          <div class="convo-item" data-id="${cv.id}">
            <div class="convo-name">${escapeHtml(cv.name || cv.wa_id)}</div>
            <div class="convo-preview">${escapeHtml(cv.last_message || '')}</div>
          </div>`
                )
                .join('')
            : '<p class="empty-state">No conversations yet.<br/>They will appear here once a customer messages your connected number.</p>'
        }
      </div>
      <div class="thread-panel" id="thread-panel">
        <p class="empty-state">Select a conversation</p>
      </div>
    </div>
  `;

  document.querySelectorAll('.convo-item').forEach((el) => {
    el.addEventListener('click', () => openThread(el.dataset.id));
  });

  const target = focusConversationId || state.activeConversationId;
  if (target && conversations.find((cv) => cv.id === target)) openThread(target);
}

async function openThread(conversationId) {
  state.activeConversationId = conversationId;
  document.querySelectorAll('.convo-item').forEach((el) => el.classList.toggle('active', el.dataset.id === conversationId));

  const { conversation, messages } = await api(`/inbox/conversations/${conversationId}/messages`);
  const panel = document.getElementById('thread-panel');
  panel.innerHTML = `
    <div class="thread-header">Conversation</div>
    <div class="thread-messages" id="thread-messages">
      ${messages
        .map(
          (m) => `
        <div class="bubble ${m.direction}">
          ${escapeHtml(m.body || '')}
          <div class="bubble-meta">${m.status} • ${new Date(m.created_at).toLocaleString()}</div>
        </div>`
        )
        .join('')}
    </div>
    <form class="thread-composer" id="composer-form">
      <input type="text" id="composer-input" placeholder="Type a message…" autocomplete="off" />
      <button class="btn-primary" type="submit">Send</button>
    </form>
  `;
  const threadMessages = document.getElementById('thread-messages');
  threadMessages.scrollTop = threadMessages.scrollHeight;

  document.getElementById('composer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('composer-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await api(`/inbox/conversations/${conversationId}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
      openThread(conversationId);
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------------------- Contacts ----------------------
async function renderContacts() {
  const contacts = await api('/contacts');
  const c = document.getElementById('view-container');
  c.innerHTML = `
    <div class="toolbar">
      <h1 class="page-title">Contacts</h1>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <b>Add a contact</b>
      <div class="form-row" style="margin-top:10px;">
        <label>WhatsApp number (with country code, digits only)</label>
        <input id="new-contact-wa" placeholder="919876543210" />
      </div>
      <div class="form-row">
        <label>Name</label>
        <input id="new-contact-name" placeholder="Customer name" />
      </div>
      <div class="form-row">
        <label>Tags (comma separated, used for campaign targeting)</label>
        <input id="new-contact-tags" placeholder="vip, mumbai" />
      </div>
      <button class="btn-primary" id="add-contact-btn">Add contact</button>

      <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px;">
        <b>Or bulk import via CSV</b> <span class="small-note">(columns: wa_id, name, tags)</span>
        <div style="margin-top:8px;">
          <input type="file" id="csv-file" accept=".csv" />
          <button class="btn-secondary" id="import-csv-btn">Import CSV</button>
        </div>
      </div>
    </div>

    <table>
      <thead><tr><th>Name</th><th>WhatsApp</th><th>Tags</th><th></th></tr></thead>
      <tbody>
        ${contacts
          .map(
            (ct) => `
          <tr>
            <td>${escapeHtml(ct.name)}</td>
            <td>${escapeHtml(ct.wa_id)}</td>
            <td>${(ct.tags || '')
              .split(',')
              .filter(Boolean)
              .map((t) => `<span class="tag-pill">${escapeHtml(t.trim())}</span>`)
              .join('')}</td>
            <td><button class="btn-link" data-del="${ct.id}">Delete</button></td>
          </tr>`
          )
          .join('') || '<tr><td colspan="4" class="empty-state">No contacts yet</td></tr>'}
      </tbody>
    </table>
  `;

  document.getElementById('add-contact-btn').addEventListener('click', async () => {
    const wa_id = document.getElementById('new-contact-wa').value.trim();
    const name = document.getElementById('new-contact-name').value.trim();
    const tags = document.getElementById('new-contact-tags').value.trim();
    if (!wa_id) return alert('WhatsApp number is required');
    try {
      await api('/contacts', { method: 'POST', body: JSON.stringify({ wa_id, name, tags }) });
      renderContacts();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('import-csv-btn').addEventListener('click', async () => {
    const file = document.getElementById('csv-file').files[0];
    if (!file) return alert('Choose a CSV file first');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const result = await api('/contacts/import', { method: 'POST', body: fd });
      alert(`Imported ${result.imported} contacts`);
      renderContacts();
    } catch (err) {
      alert(err.message);
    }
  });

  document.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this contact?')) return;
      await api('/contacts/' + btn.dataset.del, { method: 'DELETE' });
      renderContacts();
    });
  });
}

// ---------------------- Campaigns ----------------------
async function renderCampaigns() {
  const [campaigns, templates] = await Promise.all([api('/campaigns'), api('/templates')]);
  const approvedTemplates = templates.filter((t) => (t.status || '').toUpperCase() === 'APPROVED');
  const c = document.getElementById('view-container');
  c.innerHTML = `
    <h1 class="page-title">Campaigns</h1>
    <div class="card" style="margin-bottom:20px;">
      <b>New broadcast campaign</b>
      <div class="form-row" style="margin-top:10px;">
        <label>Campaign name</label>
        <input id="camp-name" placeholder="July offer blast" />
      </div>
      <div class="form-row">
        <label>Approved template</label>
        <select id="camp-template">
          <option value="">Select a template…</option>
          ${approvedTemplates
            .map((t) => `<option value="${t.name}" data-lang="${t.language}">${t.name} (${t.language})</option>`)
            .join('')}
        </select>
        ${
          templates.length === 0
            ? '<div class="small-note">No templates synced yet — go to the Templates tab and click "Sync from Meta".</div>'
            : ''
        }
      </div>
      <div class="form-row">
        <label>Target tag (leave blank to send to all contacts)</label>
        <input id="camp-tag" placeholder="vip" />
      </div>
      <button class="btn-primary" id="send-campaign-btn">Send campaign</button>
    </div>

    <table>
      <thead><tr><th>Name</th><th>Template</th><th>Status</th><th>Sent</th><th>Failed</th><th>Total</th></tr></thead>
      <tbody>
        ${campaigns
          .map(
            (cp) => `
          <tr>
            <td>${escapeHtml(cp.name)}</td>
            <td>${escapeHtml(cp.template_name)}</td>
            <td>${cp.status}</td>
            <td>${cp.sent}</td>
            <td>${cp.failed}</td>
            <td>${cp.total}</td>
          </tr>`
          )
          .join('') || '<tr><td colspan="6" class="empty-state">No campaigns sent yet</td></tr>'}
      </tbody>
    </table>
  `;

  document.getElementById('send-campaign-btn').addEventListener('click', async () => {
    const name = document.getElementById('camp-name').value.trim();
    const select = document.getElementById('camp-template');
    const template_name = select.value;
    const language = select.selectedOptions[0]?.dataset.lang || 'en_US';
    const tag = document.getElementById('camp-tag').value.trim();
    if (!name || !template_name) return alert('Campaign name and template are required');
    try {
      const result = await api('/campaigns', { method: 'POST', body: JSON.stringify({ name, template_name, language, tag }) });
      alert(`Campaign started — sending to ${result.total} contacts.`);
      renderCampaigns();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------------------- Templates ----------------------
async function renderTemplates() {
  const templates = await api('/templates');
  const c = document.getElementById('view-container');
  c.innerHTML = `
    <div class="toolbar">
      <h1 class="page-title">Message Templates</h1>
      <button class="btn-secondary" id="sync-templates-btn">Sync from Meta</button>
    </div>
    <p class="small-note">Templates are created and approved inside Meta Business Manager, then synced here for use in campaigns.</p>
    <table>
      <thead><tr><th>Name</th><th>Language</th><th>Category</th><th>Status</th></tr></thead>
      <tbody>
        ${templates
          .map(
            (t) => `<tr><td>${escapeHtml(t.name)}</td><td>${t.language}</td><td>${t.category}</td><td>${t.status}</td></tr>`
          )
          .join('') || '<tr><td colspan="4" class="empty-state">No templates synced yet</td></tr>'}
      </tbody>
    </table>
  `;
  document.getElementById('sync-templates-btn').addEventListener('click', async () => {
    try {
      const r = await api('/templates/sync', { method: 'POST' });
      alert(`Synced ${r.synced} templates`);
      renderTemplates();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------------------- Chatbot ----------------------
async function renderChatbot() {
  const rules = await api('/chatbot');
  const c = document.getElementById('view-container');
  c.innerHTML = `
    <h1 class="page-title">Chatbot Automation</h1>
    <p class="small-note">If an incoming message contains the keyword below, RebinChat replies automatically.</p>
    <div class="card" style="margin-bottom:20px;">
      <div class="form-row"><label>Keyword to match</label><input id="rule-keyword" placeholder="price" /></div>
      <div class="form-row"><label>Auto-reply text</label><textarea id="rule-reply" rows="3" placeholder="Thanks for reaching out! Our pricing starts at..."></textarea></div>
      <button class="btn-primary" id="add-rule-btn">Add rule</button>
    </div>
    <table>
      <thead><tr><th>Keyword</th><th>Reply</th><th>Active</th><th></th></tr></thead>
      <tbody>
        ${rules
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.keyword)}</td>
            <td>${escapeHtml(r.reply)}</td>
            <td><input type="checkbox" class="toggle" data-toggle="${r.id}" ${r.is_active ? 'checked' : ''}/></td>
            <td><button class="btn-link" data-del="${r.id}">Delete</button></td>
          </tr>`
          )
          .join('') || '<tr><td colspan="4" class="empty-state">No rules yet</td></tr>'}
      </tbody>
    </table>
  `;

  document.getElementById('add-rule-btn').addEventListener('click', async () => {
    const keyword = document.getElementById('rule-keyword').value.trim();
    const reply = document.getElementById('rule-reply').value.trim();
    if (!keyword || !reply) return alert('Keyword and reply text are required');
    await api('/chatbot', { method: 'POST', body: JSON.stringify({ keyword, reply }) });
    renderChatbot();
  });

  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('change', async () => {
      await api('/chatbot/' + el.dataset.toggle, { method: 'PATCH' });
    });
  });

  document.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('/chatbot/' + btn.dataset.del, { method: 'DELETE' });
      renderChatbot();
    });
  });
}

// ---------------------- Settings ----------------------
async function renderSettings() {
  const status = await api('/whatsapp/status');
  const config = await fetch('/api/public-config').then((r) => r.json());

  const c = document.getElementById('view-container');
  c.innerHTML = `
    <h1 class="page-title">Settings</h1>

    <div class="card" style="margin-bottom:20px;">
      <b>WhatsApp connection</b>
      <p class="small-note">Status: ${status.connected ? `Connected ✅ (Phone Number ID: ${status.phone_number_id})` : 'Not connected'}</p>

      ${
        status.connected
          ? `<button class="btn-danger" id="disconnect-btn">Disconnect</button>`
          : `
        <div style="margin-top:10px;">
          <b>Option A — Manual connect (fastest, works immediately)</b>
          <p class="small-note">Paste the WABA ID, Phone Number ID and a permanent access token generated from your Meta Developer Dashboard (System User token). No Meta App Review required for testing.</p>
          <div class="form-row"><label>WhatsApp Business Account ID (WABA ID)</label><input id="manual-waba" /></div>
          <div class="form-row"><label>Phone Number ID</label><input id="manual-phone" /></div>
          <div class="form-row"><label>Permanent Access Token</label><input id="manual-token" type="password" /></div>
          <button class="btn-primary" id="manual-connect-btn">Connect</button>
        </div>

        <div style="margin-top:20px; border-top:1px solid var(--border); padding-top:16px;">
          <b>Option B — Embedded Signup (official Meta flow)</b>
          <p class="small-note">${
            config.embeddedSignupAvailable
              ? 'Click below and the customer completes Facebook login, business selection and phone verification inside a popup.'
              : 'Not configured yet — set META_APP_ID and META_CONFIG_ID in your .env file to enable this button.'
          }</p>
          <button class="btn-secondary" id="embedded-signup-btn" ${config.embeddedSignupAvailable ? '' : 'disabled'}>Connect with Facebook</button>
        </div>
      `
      }
    </div>

    <div class="card" style="margin-bottom:20px;">
      <b>Team</b>
      <div id="team-list" class="small-note">Loading team…</div>
      <div style="margin-top:12px;">
        <div class="form-row"><label>New team member name</label><input id="invite-name" /></div>
        <div class="form-row"><label>Email</label><input id="invite-email" /></div>
        <div class="form-row"><label>Password</label><input id="invite-password" type="password" /></div>
        <div class="form-row">
          <label>Role</label>
          <select id="invite-role"><option value="agent">Agent</option><option value="admin">Admin</option></select>
        </div>
        <button class="btn-primary" id="invite-btn">Add team member</button>
      </div>
    </div>

    <div class="card">
      <b>Plan</b>
      <p class="small-note">Current plan: <b>${state.tenant.plan}</b>. Billing/subscription integration (Razorpay/Stripe) can be wired in when you're ready to charge customers — see README.</p>
    </div>
  `;

  loadTeam();

  if (status.connected) {
    document.getElementById('disconnect-btn').addEventListener('click', async () => {
      if (!confirm('Disconnect WhatsApp number?')) return;
      await api('/whatsapp/disconnect', { method: 'POST' });
      renderSettings();
      refreshConnectionBanner();
    });
  } else {
    document.getElementById('manual-connect-btn').addEventListener('click', async () => {
      const waba_id = document.getElementById('manual-waba').value.trim();
      const phone_number_id = document.getElementById('manual-phone').value.trim();
      const access_token = document.getElementById('manual-token').value.trim();
      if (!waba_id || !phone_number_id || !access_token) return alert('All three fields are required');
      try {
        await api('/whatsapp/manual-connect', { method: 'POST', body: JSON.stringify({ waba_id, phone_number_id, access_token }) });
        alert('Connected! You can now sync templates and receive/send messages.');
        renderSettings();
        refreshConnectionBanner();
      } catch (err) {
        alert(err.message);
      }
    });

    const esBtn = document.getElementById('embedded-signup-btn');
    if (config.embeddedSignupAvailable) {
      esBtn.addEventListener('click', () => launchEmbeddedSignup(config));
    }
  }

  document.getElementById('invite-btn').addEventListener('click', async () => {
    const name = document.getElementById('invite-name').value.trim();
    const email = document.getElementById('invite-email').value.trim();
    const password = document.getElementById('invite-password').value;
    const role = document.getElementById('invite-role').value;
    if (!name || !email || !password) return alert('All fields are required');
    try {
      await api('/auth/invite', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      alert('Team member added');
      loadTeam();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function loadTeam() {
  const me = await api('/auth/me');
  const el = document.getElementById('team-list');
  if (!el) return;
  el.innerHTML = me.teamMembers
    .map((u) => `<div>${escapeHtml(u.name)} — ${escapeHtml(u.email)} <span class="tag-pill">${u.role}</span></div>`)
    .join('');
}

// ---------------------- Embedded Signup (Meta JS SDK) ----------------------
let fbSdkLoaded = false;
function loadFacebookSdk(appId) {
  return new Promise((resolve) => {
    if (fbSdkLoaded) return resolve();
    window.fbAsyncInit = function () {
      FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v20.0' });
      fbSdkLoaded = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    document.body.appendChild(script);
  });
}

async function launchEmbeddedSignup(config) {
  await loadFacebookSdk(config.appId);

  let sessionInfo = null;
  const messageListener = (event) => {
    if (!event.origin.endsWith('facebook.com')) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
        sessionInfo = data.data; // { phone_number_id, waba_id }
      }
    } catch (e) {
      /* ignore non-JSON postMessage events */
    }
  };
  window.addEventListener('message', messageListener);

  FB.login(
    async (response) => {
      window.removeEventListener('message', messageListener);
      const code = response.authResponse?.code;
      if (!code || !sessionInfo) {
        alert('Signup was cancelled or incomplete.');
        return;
      }
      try {
        await api('/whatsapp/embedded-signup/exchange', {
          method: 'POST',
          body: JSON.stringify({ code, waba_id: sessionInfo.waba_id, phone_number_id: sessionInfo.phone_number_id })
        });
        alert('WhatsApp connected successfully!');
        renderSettings();
        refreshConnectionBanner();
      } catch (err) {
        alert(err.message);
      }
    },
    {
      config_id: config.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }
    }
  );
}

// ---------------------- Utils ----------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ---------------------- Startup ----------------------
if (state.token) {
  boot();
} else {
  authScreen.classList.remove('hidden');
}
