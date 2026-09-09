/* =====================================================================
   views/messages.js -- internal messaging + portal notes
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};

  R.Views.messages = {
    id: 'messages', title: 'Messages', group: 'Messaging',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root, params) {
      const box = (params && params.tab) || 'inbox';
      const TABS = [{ id: 'inbox', label: 'INBOX' }, { id: 'sent', label: 'SENT' }, { id: 'notes', label: 'PORTAL NOTES' }];
      let html = UI.pageHead('MESSAGING', 'internal mail & portal notices');
      html += UI.tabs(TABS, box);
      html += UI.toolbar('<button class="primary" id="btnNew">[ + COMPOSE ]</button>');
      html += '<div id="tabbody"></div>';
      root.innerHTML = html;
      UI.onTabs(root, (t) => R.App.go('messages/' + t));
      document.getElementById('btnNew').onclick = () => R.Views.messages.compose();
      const body = document.getElementById('tabbody');
      if (box === 'notes') return R.Views.messages.notes(body);
      return R.Views.messages.box(body, box);
    },

    async box(body, which) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const res = await api.get('/api/messages?box=' + which);
      const rows = res.data.map((m) => ({
        id: m.id, when: U.datetime(m.created_at),
        who: which === 'sent' ? ('to: ' + (m.to_name || '—')) : ('from: ' + (m.from_name || '—')),
        subject: m.subject || '(no subject)', read: m.is_read ? 'READ' : 'UNREAD',
        preview: String(m.body || '').replace(/\s+/g, ' ').slice(0, 54)
      }));
      body.innerHTML = U.table({
        title: (which === 'sent' ? 'SENT MESSAGES' : 'INBOX'),
        columns: [
          { title: 'WHEN', key: 'when', width: 17 }, { title: 'CORRESPONDENT', key: 'who', max: 24 },
          { title: 'SUBJECT', key: 'subject', max: 26 }, { title: 'STATUS', key: 'read', width: 7 },
          { title: 'PREVIEW', key: 'preview', max: 54 }
        ], rows, empty: '   no messages'
      });
      UI.onRows(body, (id) => {
        const m = res.data.find((x) => String(x.id) === String(id));
        if (!m) return;
        if (!m.is_read && which === 'inbox') api.post('/api/messages/' + m.id + '/read').catch(() => { });
        UI.modal({
          title: m.subject || '(no subject)',
          html: '<pre class="ascii">' + U.esc(U.box('FROM', [m.from_name || '—'], 62)) + '</pre>' +
            '<pre class="ascii">' + U.esc(U.box('MESSAGE', String(m.body || '').split('\n'), 62)) + '</pre>',
          saveLabel: 'CLOSE', onSave: async () => { }
        });
      });
    },

    async notes(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const res = await api.get('/api/portal-notes');
      const rows = res.data.map((n) => ({
        id: n.id, when: U.date(n.created_at), title: n.title,
        body: String(n.body || '').replace(/\s+/g, ' ').slice(0, 62)
      }));
      let html = U.table({
        title: 'PORTAL NOTES',
        columns: [
          { title: 'DATE', key: 'when', width: 11 }, { title: 'TITLE', key: 'title', max: 26 },
          { title: 'BODY', key: 'body', max: 62 }
        ], rows, empty: '   no portal notes published'
      });
      if (R.App.user.profile === 'admin') html += '<div class="toolbar"><button id="btnAdd">[ + PUBLISH NOTE ]</button></div>';
      body.innerHTML = html;
      if (R.App.user.profile === 'admin') document.getElementById('btnAdd').onclick = () => UI.modal({
        title: 'PUBLISH PORTAL NOTE',
        fields: [
          { name: 'title', label: 'Title', required: true },
          { name: 'body', label: 'Body', type: 'textarea', rows: 6, required: true }
        ],
        onSave: async (data) => { await api.post('/api/portal-notes', data); UI.ok('Note published'); R.App.reload(); }
      });
    },

    async compose() {
      const staff = await api.get('/api/staff?limit=300&has_login=1');
      UI.modal({
        title: 'COMPOSE MESSAGE',
        fields: [
          { name: 'to_staff_id', label: 'To', type: 'select', options: staff.data.map((s) => ({ value: s.id, label: (s.username || '?') + '  ' + U.name(s) })), required: true },
          { name: 'subject', label: 'Subject', required: true },
          { name: 'body', label: 'Message', type: 'textarea', rows: 7, required: true }
        ],
        onSave: async (data) => { await api.post('/api/messages', data); UI.ok('Message sent'); R.App.reload(); }
      });
    }
  };
})(window.RSIS);
